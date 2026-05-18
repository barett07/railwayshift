// TDX TRA train search proxy
// Input  (POST JSON): { fromStation, toStation, mode, time, date, trainTypes? }
//   mode = "before" → time = arriveBy   (上班用，找最後一班能準時抵達)
//   mode = "after"  → time = departAfter(下班用，找最早一班可搭)
// Output (JSON):      { best, candidates, mode, date, from, to }

const TDX_AUTH = 'https://tdx.transportdata.tw/auth/realms/TDXConnect/protocol/openid-connect/token';
const TDX_API = 'https://tdx.transportdata.tw/api/basic/v3/Rail/TRA';

let cachedToken: { token: string; expiresAt: number } | null = null;
let cachedStationMap: Map<string, string> | null = null;

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, apikey, x-client-info',
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...CORS },
  });
}

async function getAccessToken(): Promise<string> {
  if (cachedToken && cachedToken.expiresAt > Date.now() + 60_000) {
    return cachedToken.token;
  }
  const clientId = Deno.env.get('TDX_CLIENT_ID');
  const clientSecret = Deno.env.get('TDX_CLIENT_SECRET');
  if (!clientId || !clientSecret) throw new Error('TDX_CLIENT_ID / TDX_CLIENT_SECRET not set');

  const res = await fetch(TDX_AUTH, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'client_credentials',
      client_id: clientId,
      client_secret: clientSecret,
    }).toString(),
  });
  if (!res.ok) throw new Error(`TDX auth failed: ${res.status} ${await res.text()}`);
  const data = await res.json();
  cachedToken = {
    token: data.access_token,
    expiresAt: Date.now() + (data.expires_in ?? 86400) * 1000,
  };
  return cachedToken.token;
}

async function loadStationMap(token: string): Promise<Map<string, string>> {
  if (cachedStationMap) return cachedStationMap;
  const res = await fetch(`${TDX_API}/Station?%24format=JSON`, {
    headers: { 'Authorization': `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(`TDX station fetch failed: ${res.status}`);
  const data = await res.json();
  const list = data.Stations || data; // v3 returns { Stations:[...] }, but fall back to array
  const map = new Map<string, string>();
  for (const s of list) {
    const name = s.StationName?.Zh_tw;
    const id = s.StationID;
    if (name && id) map.set(name, id);
  }
  cachedStationMap = map;
  return map;
}

function toMin(t: string): number {
  const [h, m] = t.split(':').map(Number);
  return h * 60 + m;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS });
  if (req.method !== 'POST') return json({ error: 'method not allowed' }, 405);

  try {
    const body = await req.json();
    const { fromStation, toStation, mode, time, date, trainTypes } = body || {};

    if (!fromStation || !toStation || !mode || !time || !date) {
      return json({ error: 'missing required fields: fromStation, toStation, mode, time, date' }, 400);
    }
    if (mode !== 'before' && mode !== 'after') {
      return json({ error: 'mode must be "before" or "after"' }, 400);
    }

    const token = await getAccessToken();
    const stations = await loadStationMap(token);
    const fromId = stations.get(fromStation);
    const toId = stations.get(toStation);
    if (!fromId) return json({ error: `查無車站：${fromStation}` }, 400);
    if (!toId) return json({ error: `查無車站：${toStation}` }, 400);

    const url = `${TDX_API}/DailyTrainTimetable/OD/${fromId}/to/${toId}/${date}?%24format=JSON`;
    const res = await fetch(url, { headers: { 'Authorization': `Bearer ${token}` } });
    if (!res.ok) {
      const text = await res.text();
      return json({ error: `TDX query failed: ${res.status}`, detail: text }, 502);
    }
    const data = await res.json();
    const trains = data.TrainTimetables || [];

    const threshold = toMin(time);
    const allowedTypes: string[] | null = Array.isArray(trainTypes) && trainTypes.length > 0
      ? trainTypes
      : null;

    const candidates: any[] = [];
    for (const t of trains) {
      const info = t.TrainInfo || {};
      const typeName: string | undefined = info.TrainTypeName?.Zh_tw;
      // TDX 的車種名常帶括號（例如「自強(推拉式...)」），用子字串比對
      if (allowedTypes && (!typeName || !allowedTypes.some(k => typeName.includes(k)))) continue;
      if (info.SuspendedFlag) continue;

      const stops: any[] = t.StopTimes || [];
      const fromStop = stops.find(s => s.StationID === fromId);
      const toStop = stops.find(s => s.StationID === toId);
      if (!fromStop || !toStop) continue;
      if (fromStop.StopSequence >= toStop.StopSequence) continue;

      const dep: string | undefined = fromStop.DepartureTime;
      const arr: string | undefined = toStop.ArrivalTime;
      if (!dep || !arr) continue;

      const depHM = dep.slice(0, 5);
      const arrHM = arr.slice(0, 5);
      // 跨日車（前一天發車、隔天凌晨抵達）不視為當日選項
      if (toMin(arrHM) < toMin(depHM)) continue;

      if (mode === 'before') {
        if (toMin(arrHM) > threshold) continue;
      } else {
        if (toMin(depHM) < threshold) continue;
      }

      candidates.push({
        trainNo: info.TrainNo,
        trainType: typeName,
        departureTime: depHM,
        arrivalTime: arrHM,
      });
    }

    if (mode === 'before') {
      // 上班：依出發時間從晚到早（最後一班能準時抵達在最前）
      candidates.sort((a, b) => toMin(b.departureTime) - toMin(a.departureTime));
    } else {
      // 下班：依出發時間從早到晚（最早能搭的在最前）
      candidates.sort((a, b) => toMin(a.departureTime) - toMin(b.departureTime));
    }

    return json({
      best: candidates[0] ?? null,
      candidates: candidates.slice(0, 5),
      mode,
      date,
      from: { name: fromStation, id: fromId },
      to: { name: toStation, id: toId },
    });
  } catch (e: any) {
    return json({ error: e.message ?? String(e) }, 500);
  }
});
