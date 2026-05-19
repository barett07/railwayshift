// TDX TRA train search proxy
// Input  (POST JSON): { fromStation, toStation, mode, time, date, trainTypes?, limit?, includeDelay? }
//   mode = "before" → time = arriveBy   (上班用，找最後一班能準時抵達)
//   mode = "after"  → time = departAfter(下班用，找最早一班可搭)
//   includeDelay = true 時加打 StationLiveBoard，回傳的車次帶 delayMin 欄位（即時誤點分鐘）
// Output (JSON):      { best, candidates, mode, date, from, to }

const TDX_AUTH = 'https://tdx.transportdata.tw/auth/realms/TDXConnect/protocol/openid-connect/token';
const TDX_API = 'https://tdx.transportdata.tw/api/basic/v3/Rail/TRA';

// 寫死 TRA 全站站號表（從 TDX /Rail/TRA/Station 抓取一次後嵌入）
// 動態抓取會在多 instance 場景下打爆 TDX 速率限制，回 429
const STATION_MAP: Record<string, string> = {"基隆":"0900","三坑":"0910","八堵":"0920","七堵":"0930","百福":"0940","五堵":"0950","汐止":"0960","汐科":"0970","南港":"0980","松山":"0990","臺北":"1000","臺北-環島":"1001","萬華":"1010","板橋":"1020","浮洲":"1030","樹林":"1040","南樹林":"1050","山佳":"1060","鶯歌":"1070","鳳鳴":"1075","桃園":"1080","內壢":"1090","中壢":"1100","埔心":"1110","楊梅":"1120","富岡":"1130","新富":"1140","北湖":"1150","湖口":"1160","新豐":"1170","竹北":"1180","北新竹":"1190","千甲":"1191","新莊":"1192","竹中":"1193","六家":"1194","上員":"1201","榮華":"1202","竹東":"1203","橫山":"1204","九讚頭":"1205","合興":"1206","富貴":"1207","內灣":"1208","新竹":"1210","三姓橋":"1220","香山":"1230","崎頂":"1240","竹南":"1250","樹林調車場":"1998","談文":"2110","大山":"2120","後龍":"2130","龍港":"2140","白沙屯":"2150","新埔":"2160","通霄":"2170","苑裡":"2180","日南":"2190","大甲":"2200","臺中港":"2210","清水":"2220","沙鹿":"2230","龍井":"2240","大肚":"2250","追分":"2260","造橋":"3140","豐富":"3150","苗栗":"3160","南勢":"3170","銅鑼":"3180","三義":"3190","泰安":"3210","后里":"3220","豐原":"3230","栗林":"3240","潭子":"3250","頭家厝":"3260","松竹":"3270","太原":"3280","精武":"3290","臺中":"3300","五權":"3310","大慶":"3320","烏日":"3330","新烏日":"3340","成功":"3350","彰化":"3360","花壇":"3370","大村":"3380","員林":"3390","永靖":"3400","社頭":"3410","田中":"3420","二水":"3430","源泉":"3431","濁水":"3432","龍泉":"3433","集集":"3434","水里":"3435","車埕":"3436","林內":"3450","石榴":"3460","斗六":"3470","斗南":"3480","石龜":"3490","大林":"4050","民雄":"4060","嘉北":"4070","嘉義":"4080","水上":"4090","南靖":"4100","後壁":"4110","新營":"4120","柳營":"4130","林鳳營":"4140","隆田":"4150","拔林":"4160","善化":"4170","南科":"4180","新市":"4190","永康":"4200","大橋":"4210","臺南":"4220","保安":"4250","仁德":"4260","中洲":"4270","長榮大學":"4271","沙崙":"4272","大湖":"4290","路竹":"4300","岡山":"4310","橋頭":"4320","楠梓":"4330","新左營":"4340","左營":"4350","內惟":"4360","美術館":"4370","鼓山":"4380","三塊厝":"4390","高雄":"4400","民族":"4410","科工館":"4420","正義":"4430","鳳山":"4440","後庄":"4450","九曲堂":"4460","六塊厝":"4470","屏東":"5000","歸來":"5010","麟洛":"5020","西勢":"5030","竹田":"5040","潮州":"5050","崁頂":"5060","南州":"5070","鎮安":"5080","林邊":"5090","佳冬":"5100","東海":"5110","枋寮":"5120","加祿":"5130","內獅":"5140","枋山":"5160","枋野":"5170","大武":"5190","瀧溪":"5200","金崙":"5210","太麻里":"5220","知本":"5230","康樂":"5240","南方小站":"5998","潮州基地":"5999","臺東":"6000","山里":"6010","鹿野":"6020","瑞源":"6030","瑞和":"6040","關山":"6050","海端":"6060","池上":"6070","富里":"6080","東竹":"6090","東里":"6100","玉里":"6110","三民":"6120","瑞穗":"6130","富源":"6140","大富":"6150","光復":"6160","萬榮":"6170","鳳林":"6180","南平":"6190","林榮新光":"6200","豐田":"6210","壽豐":"6220","平和":"6230","志學":"6240","吉安":"6250","花蓮":"7000","北埔":"7010","景美":"7020","新城":"7030","崇德":"7040","和仁":"7050","和平":"7060","漢本":"7070","武塔":"7080","南澳":"7090","東澳":"7100","永樂":"7110","蘇澳":"7120","蘇澳新":"7130","新馬":"7140","冬山":"7150","羅東":"7160","中里":"7170","二結":"7180","宜蘭":"7190","四城":"7200","礁溪":"7210","頂埔":"7220","頭城":"7230","外澳":"7240","龜山":"7250","大溪":"7260","大里":"7270","石城":"7280","福隆":"7290","貢寮":"7300","雙溪":"7310","牡丹":"7320","三貂嶺":"7330","大華":"7331","十分":"7332","望古":"7333","嶺腳":"7334","平溪":"7335","菁桐":"7336","猴硐":"7350","瑞芳":"7360","海科館":"7361","八斗子":"7362","四腳亭":"7380","暖暖":"7390"};

let cachedToken: { token: string; expiresAt: number } | null = null;

const CORS = {
  'Access-Control-Allow-Origin': 'https://barett07.github.io',
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

function toMin(t: string): number {
  const [h, m] = t.split(':').map(Number);
  return h * 60 + m;
}

async function sleep(ms: number) { return new Promise((r) => setTimeout(r, ms)); }

// 對 TDX timetable 端點做 fetch；遇到 429 自動退避重試
async function fetchTimetableWithRetry(url: string, token: string): Promise<Response> {
  const delays = [800, 2000, 4000];
  for (let i = 0; i <= delays.length; i++) {
    const res = await fetch(url, { headers: { 'Authorization': `Bearer ${token}` } });
    if (res.status !== 429) return res;
    if (i === delays.length) return res;
    await sleep(delays[i]);
  }
  // unreachable
  return await fetch(url, { headers: { 'Authorization': `Bearer ${token}` } });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS });
  if (req.method !== 'POST') return json({ error: 'method not allowed' }, 405);

  try {
    const body = await req.json();
    const { fromStation, toStation, mode, time, date, trainTypes, limit, includeDelay } = body || {};

    if (!fromStation || !toStation || !mode || !time || !date) {
      return json({ error: 'missing required fields: fromStation, toStation, mode, time, date' }, 400);
    }
    if (mode !== 'before' && mode !== 'after') {
      return json({ error: 'mode must be "before" or "after"' }, 400);
    }

    const fromId = STATION_MAP[fromStation];
    const toId = STATION_MAP[toStation];
    if (!fromId) return json({ error: `查無車站：${fromStation}` }, 400);
    if (!toId) return json({ error: `查無車站：${toStation}` }, 400);

    const token = await getAccessToken();
    const url = `${TDX_API}/DailyTrainTimetable/OD/${fromId}/to/${toId}/${date}?%24format=JSON`;
    const res = await fetchTimetableWithRetry(url, token);
    if (!res.ok) {
      const text = await res.text();
      return json({ error: `TDX query failed: ${res.status}`, detail: text.slice(0,200) }, res.status === 429 ? 429 : 502);
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

    // limit:0 = 不截斷（批次重抓用）；預設回前 5 筆
    const maxResults = (typeof limit === 'number' && limit >= 0) ? limit : 5;
    const sliced = maxResults === 0 ? candidates : candidates.slice(0, maxResults);

    // 加打 TrainLiveBoard 取即時誤點（全臺鐵所有運行中車次，可對齊候選車次）
    // best-effort，失敗不擋主流程
    if (includeDelay) {
      try {
        const lbUrl = `${TDX_API}/TrainLiveBoard?%24format=JSON`;
        const lbRes = await fetchTimetableWithRetry(lbUrl, token);
        if (lbRes.ok) {
          const lbData = await lbRes.json();
          const delayMap: Record<string, number> = {};
          for (const t of (lbData.TrainLiveBoards || [])) {
            if (t.TrainNo != null && typeof t.DelayTime === 'number') {
              delayMap[String(t.TrainNo)] = t.DelayTime;
            }
          }
          for (const c of sliced) {
            const d = delayMap[String(c.trainNo)];
            if (d !== undefined) (c as any).delayMin = d;
          }
        }
      } catch (_e) { /* ignore */ }
    }

    return json({
      best: sliced[0] ?? null,
      candidates: sliced,
      mode,
      date,
      from: { name: fromStation, id: fromId },
      to: { name: toStation, id: toId },
    });
  } catch (e: any) {
    return json({ error: e.message ?? String(e) }, 500);
  }
});
