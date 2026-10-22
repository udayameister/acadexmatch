import type { TrackedJob, TrackedStatus } from '@/types';

export const TRACKED_STATUS: { key: TrackedStatus; label: string; cls: string }[] = [
  { key: 'saved', label: 'Saved', cls: 'bg-slate-50 text-slate-700 border-slate-200' },
  { key: 'applied', label: 'Applied', cls: 'bg-brand-50 text-brand-900 border-brand-200' },
  { key: 'interview', label: 'Interview', cls: 'bg-gold-50 text-gold-900 border-gold-200' },
  { key: 'offer', label: 'Offer', cls: 'bg-emerald-50 text-emerald-800 border-emerald-200' },
  { key: 'rejected', label: 'Not selected', cls: 'bg-crimson-50 text-crimson-700 border-crimson-100' },
  { key: 'withdrawn', label: 'Withdrawn', cls: 'bg-slate-50 text-slate-500 border-slate-200' },
];

export function statusInfo(s: TrackedStatus) {
  return TRACKED_STATUS.find(x => x.key === s) || TRACKED_STATUS[0];
}

function istToday(): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
}

/** Whole days from today (India time) to the last date; negative when it has passed; null when unknown. */
export function daysLeft(deadline: string | null | undefined): number | null {
  if (!deadline || !/^\d{4}-\d{2}-\d{2}$/.test(deadline)) return null;
  return Math.round((Date.parse(`${deadline}T00:00:00Z`) - Date.parse(`${istToday()}T00:00:00Z`)) / 86400000);
}

export function countdown(deadline: string | null | undefined): { text: string; cls: string } {
  const d = daysLeft(deadline);
  if (d === null) return { text: 'No last date', cls: 'bg-slate-50 text-slate-500 border-slate-200' };
  if (d < 0) return { text: 'Closed', cls: 'bg-slate-100 text-slate-500 border-slate-200' };
  if (d === 0) return { text: 'Closes today', cls: 'bg-crimson-600 text-white border-crimson-600' };
  if (d === 1) return { text: '1 day left', cls: 'bg-crimson-50 text-crimson-700 border-crimson-200' };
  if (d <= 3) return { text: `${d} days left`, cls: 'bg-crimson-50 text-crimson-700 border-crimson-200' };
  if (d <= 7) return { text: `${d} days left`, cls: 'bg-gold-50 text-gold-900 border-gold-200' };
  return { text: `${d} days left`, cls: 'bg-emerald-50 text-emerald-800 border-emerald-200' };
}

function icsEscape(v: string): string {
  return v.replace(/\\/g, '\\\\').replace(/;/g, '\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
}

function fold(line: string): string {
  const out: string[] = [];
  let rest = line;
  while (rest.length > 74) { out.push(rest.slice(0, 74)); rest = ` ${rest.slice(74)}`; }
  out.push(rest);
  return out.join('\r\n');
}

/** Calendar file with an all-day event on each last date and a reminder two days before. */
export function buildIcs(items: TrackedJob[], origin: string): string {
  const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//AcadeXMatch//Deadline tracker//EN', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH'];
  for (const t of items) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(t.deadline)) continue;
    const start = t.deadline.replace(/-/g, '');
    const endDate = new Date(`${t.deadline}T00:00:00Z`);
    endDate.setUTCDate(endDate.getUTCDate() + 1);
    const end = endDate.toISOString().slice(0, 10).replace(/-/g, '');
    const link = t.jobId ? `${origin}/jobs/${t.jobId}` : t.url || '';
    lines.push(
      'BEGIN:VEVENT',
      `UID:${t.id}@acadexmatch`,
      `DTSTAMP:${stamp}`,
      `DTSTART;VALUE=DATE:${start}`,
      `DTEND;VALUE=DATE:${end}`,
      fold(`SUMMARY:${icsEscape(`Last date: ${t.title} — ${t.institute}`)}`),
      fold(`DESCRIPTION:${icsEscape([t.reference ? `Ref: ${t.reference}` : '', link].filter(Boolean).join('\n'))}`),
      ...(link ? [fold(`URL:${link}`)] : []),
      'BEGIN:VALARM', 'ACTION:DISPLAY', 'TRIGGER:-P2D', fold(`DESCRIPTION:${icsEscape(`2 days left: ${t.title}`)}`), 'END:VALARM',
      'END:VEVENT',
    );
  }
  lines.push('END:VCALENDAR');
  return lines.join('\r\n') + '\r\n';
}

export function downloadIcs(items: TrackedJob[], fileName = 'acadexmatch-deadlines.ics'): void {
  const blob = new Blob([buildIcs(items, window.location.origin)], { type: 'text/calendar;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = fileName;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
