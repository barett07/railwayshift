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

function daysInMonth(y: number, m: number) { return new Date(y, m, 0).getDate(); }

function getDayInfo(ds: string, shifts: any[], segments: any[], exceptions: any) {
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

function toIcsDate(dateStr: string, timeStr: string, isNextDay = false) {
  const [y, m, d] = dateStr.split('-').map(Number);
  const [hh, mm] = timeStr.split(':').map(Number);
  const date = new Date(y, m - 1, d + (isNextDay ? 1 : 0), hh, mm);
  return `${date.getFullYear()}${p2(date.getMonth()+1)}${p2(date.getDate())}T${p2(date.getHours())}${p2(date.getMinutes())}00`;
}

function escIcs(s: string) { return s.replace(/[\\;,]/g, c => '\\' + c).replace(/\n/g, '\\n'); }

Deno.serve(async () => {
  const [shifts, segments, exceptions] = await Promise.all([
    fetchAppData('shifts'),
    fetchAppData('segments'),
    fetchAppData('exceptions'),
  ]);

  const shiftMap = Object.fromEntries((shifts ?? []).map((s: any) => [s.id, s]));

  // Generate events for 3 months back to 12 months ahead
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
  ];

  const cur = new Date(start);
  while (cur <= end) {
    const ds = `${cur.getFullYear()}-${p2(cur.getMonth()+1)}-${p2(cur.getDate())}`;
    const info = getDayInfo(ds, shifts ?? [], segments ?? [], exceptions ?? {});

    if (info.type === 'work' && info.shiftId) {
      const shift = shiftMap[info.shiftId];
      if (shift) {
        const startTime = info.customStart || shift.startTime || '';
        const boardTime = info.customBoard || shift.boardTime || '';
        const endTime = shift.endTime || '';
        const alightTime = info.customAlight || shift.alightTime || '';

        if (startTime && endTime) {
          const eventStart = boardTime || startTime;
          const eventEnd = alightTime || endTime;
          const isOvernight = shift.isOvernight ?? false;

          const dtStart = toIcsDate(ds, eventStart);
          const dtEnd = toIcsDate(ds, eventEnd, isOvernight && eventEnd <= eventStart);

          const summary = `${shift.name} 班`;
          const descParts = [];
          if (shift.depTrain) descParts.push(`首班：${shift.depTrain} ${shift.depTime || ''}`);
          if (shift.arrTrain) descParts.push(`末班：${shift.arrTrain} ${shift.arrTime || ''}`);
          if (shift.specialNote) descParts.push(shift.specialNote);

          const uid = `${ds}-${info.shiftId}@railwayshift`;

          lines.push('BEGIN:VEVENT');
          lines.push(`UID:${uid}`);
          lines.push(`DTSTART;TZID=Asia/Taipei:${dtStart}`);
          lines.push(`DTEND;TZID=Asia/Taipei:${dtEnd}`);
          lines.push(`SUMMARY:${escIcs(summary)}`);
          if (descParts.length) lines.push(`DESCRIPTION:${escIcs(descParts.join('\\n'))}`);
          lines.push('BEGIN:VALARM');
          lines.push('TRIGGER:-PT30M');
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

  return new Response(lines.join('\r\n'), {
    headers: {
      'Content-Type': 'text/calendar; charset=utf-8',
      'Cache-Control': 'no-cache',
    },
  });
});
