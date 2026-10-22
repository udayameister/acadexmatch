/** Builds and downloads a single calendar event (.ics) — times are India Standard Time. */
export interface CalendarEvent {
  uid: string;
  title: string;
  date: string; // YYYY-MM-DD
  time?: string | null; // "HH:MM" or "10:30 AM IST"
  durationMin?: number;
  location?: string;
  description?: string;
  url?: string;
}

function to24h(t?: string | null): { h: number; m: number } | null {
  if (!t) return null;
  const m = t.match(/(\d{1,2}):(\d{2})\s*(AM|PM)?/i);
  if (!m) return null;
  let h = Number(m[1]);
  const min = Number(m[2]);
  if (m[3]) { const pm = m[3].toUpperCase() === 'PM'; if (pm && h < 12) h += 12; if (!pm && h === 12) h = 0; }
  return h < 24 && min < 60 ? { h, m: min } : null;
}

const esc = (s: string) => s.replace(/\\/g, '\\\\').replace(/\n/g, '\\n').replace(/,/g, '\\,').replace(/;/g, '\\;');
const pad = (n: number) => String(n).padStart(2, '0');

export function buildEventIcs(e: CalendarEvent): string {
  const t = to24h(e.time);
  const d = e.date.replace(/-/g, '');
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//AcadeXMatch//EN', 'CALSCALE:GREGORIAN', 'BEGIN:VEVENT',
    `UID:${e.uid}@acadexmatch`, `DTSTAMP:${new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '')}`];
  if (t) {
    // Convert IST to UTC.
    const start = new Date(Date.UTC(Number(e.date.slice(0, 4)), Number(e.date.slice(5, 7)) - 1, Number(e.date.slice(8, 10)), t.h, t.m) - 330 * 60000);
    const end = new Date(start.getTime() + (e.durationMin || 30) * 60000);
    const f = (x: Date) => `${x.getUTCFullYear()}${pad(x.getUTCMonth() + 1)}${pad(x.getUTCDate())}T${pad(x.getUTCHours())}${pad(x.getUTCMinutes())}00Z`;
    lines.push(`DTSTART:${f(start)}`, `DTEND:${f(end)}`);
  } else {
    lines.push(`DTSTART;VALUE=DATE:${d}`);
  }
  lines.push(`SUMMARY:${esc(e.title)}`);
  if (e.location) lines.push(`LOCATION:${esc(e.location)}`);
  if (e.description || e.url) lines.push(`DESCRIPTION:${esc([e.description, e.url].filter(Boolean).join('\n'))}`);
  if (e.url) lines.push(`URL:${e.url}`);
  lines.push('BEGIN:VALARM', 'TRIGGER:-PT1H', 'ACTION:DISPLAY', `DESCRIPTION:${esc(e.title)}`, 'END:VALARM', 'END:VEVENT', 'END:VCALENDAR');
  return lines.join('\r\n');
}

export function downloadEventIcs(e: CalendarEvent, fileName = 'interview.ics'): void {
  const blob = new Blob([buildEventIcs(e)], { type: 'text/calendar;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = fileName;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
