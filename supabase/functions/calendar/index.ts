const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;

async function fetchAppData(key: string) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/app_data?key=eq.${key}&select=value`, {
    headers: { 'apikey': SUPABASE_ANON_KEY, 'Authorization': `Bearer ${SUPABASE_ANON_KEY}` },
  });
  const rows = await res.json();
  return rows?.[0]?.value ?? null;
}

function p2(n: number) { return String(n).padStart(2, '0'); }

function diffDays(a: string, b: string) {
  return Math.round((new Date(b).getTime() - new Date(a).getTime()) / 86400000);
}

function getDayInfo(ds: string, segments: any[], exceptions: any) {
  const ex = exceptions?.[ds];
  if (ex) return ex;
  const seg = segments.find((s: any) => s.startDate <= ds && s.endDate >= ds);
  if (!seg) return { type: 'unknown' };
  if (seg.type === 'standby') {
    const d = seg.standbyData?.[ds];
    return d ? { type: 'work', shiftId: d.shiftId, note: d.note } : { type: 'standby' };
  }
  const idx = diffDays(seg.startDate, ds) % seg.cycle.length;
  return seg.cycle[idx] ?? { type: 'unknown' };
}

// Find shift by id, with fallback to strip variant suffix (e.g. 576V → 576)
function findShift(shiftId: string, shiftMap: Record<string, any>) {
  if (shiftMap[shiftId]) return shiftMap[shiftId];
  const base = shiftId.replace(/V$|AV$/, '');
  return shiftMap[base] ?? null;
}

function toIcsDate(dateStr: string, timeStr: string, nextDay = false) {
  const [y, m, d] = dateStr.split('-').map(Number);
  const [hh, mm] = timeStr.split(':').map(Number);
  const date = new Date(y, m - 1, d + (nextDay ? 1 : 0), hh, mm);
  return `${date.getFullYear()}${p2(date.getMonth()+1)}${p2(date.getDate())}T${p2(date.getHours())}${p2(date.getMinutes())}00`;
}

function escIcs(s: string) { return s.replace(/[\\;,]/g, c => '\\' + c).replace(/\n/g, '\\n'); }

Deno.serve(async () => {
  const [shifts, segments, exceptions] = await Promise.all([
    fetchAppData('shifts'),
    fetchAppData('segments'),
    fetchAppData('exceptions'),
  ]);

  const shiftMap: Record<string, any> = Object.fromEntries((shifts ?? []).map((s: any) => [s.id, s]));

  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth() - 3, 1);
  const end = new Date(now.getFullYear(), now.getMonth() + 13, 0);

  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//railwayshift//calendar//TW',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'X-WR-CALNAME:鐵路輪班',
    'X-WR-TIMEZONE:Asia/Taipei',
    'REFRESH-INTERVAL;VALUE=DURATION:PT1H',
    'X-PUBLISHED-TTL:PT1H',
    'BEGIN:VTIMEZONE',
    'TZID:Asia/Taipei',
    'BEGIN:STANDARD',
    'DTSTART:19700101T000000',
    'TZOFFSETFROM:+0800',
    'TZOFFSETTO:+0800',
    'TZNAME:CST',
    'END:STANDARD',
    'END:VTIMEZONE',
  ];

  const cur = new Date(start);
  while (cur <= end) {
    const ds = `${cur.getFullYear()}-${p2(cur.getMonth()+1)}-${p2(cur.getDate())}`;
    const info = getDayInfo(ds, segments ?? [], exceptions ?? {});

    if (info.type === 'work' && info.shiftId) {
      const shift = findShift(info.shiftId, shiftMap);
      if (shift) {
        const startTime = info.customStart || shift.startTime || '';
        const endTime = shift.endTime || '';

        if (startTime && endTime) {
          // Determine if event spans midnight by comparing time strings
          const spansMiddnight = endTime <= startTime;

          const dtStart = toIcsDate(ds, startTime);
          const dtEnd = toIcsDate(ds, endTime, spansMiddnight);

          const summary = `${info.shiftId} 工作班`;
          const descParts = [];
          if (shift.depTrain) descParts.push(`首班：${shift.depTrain} ${shift.depTime || ''}`);
          if (shift.arrTrain) descParts.push(`末班：${shift.arrTrain} ${shift.arrTime || ''}`);
          if (shift.specialNote) descParts.push(shift.specialNote);
          if (info.note) descParts.push(info.note);

          lines.push('BEGIN:VEVENT');
          lines.push(`UID:${ds}-${info.shiftId}@railwayshift`);
          lines.push(`DTSTART;TZID=Asia/Taipei:${dtStart}`);
          lines.push(`DTEND;TZID=Asia/Taipei:${dtEnd}`);
          lines.push(`SUMMARY:${escIcs(summary)}`);
          if (descParts.length) lines.push(`DESCRIPTION:${escIcs(descParts.join('\\n'))}`);
          lines.push('BEGIN:VALARM');
          lines.push('TRIGGER:-PT2H');
          lines.push('ACTION:DISPLAY');
          lines.push(`DESCRIPTION:${escIcs(summary)} 出發提醒`);
          lines.push('END:VALARM');
          lines.push('END:VEVENT');
        }
      }
    }

    cur.setDate(cur.getDate() + 1);
  }

  lines.push('END:VCALENDAR');

  return new Response(lines.join('\r\n') + '\r\n', {
    headers: {
      'Content-Type': 'text/calendar; charset=utf-8',
      'Cache-Control': 'no-cache',
    },
  });
});
