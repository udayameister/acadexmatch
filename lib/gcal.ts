/** "Add to Google Calendar" link for an all-day event (end date inclusive). */
export function googleCalendarLink(title: string, date: string, endDate: string | undefined, details: string): string {
  const d = (s: string) => s.replace(/-/g, '');
  const after = new Date(Date.parse(`${endDate || date}T00:00:00Z`) + 86400000).toISOString().slice(0, 10);
  return `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${encodeURIComponent(title)}&dates=${d(date)}/${d(after)}&details=${encodeURIComponent(details)}`;
}
