/**
 * Local-timezone formatting for signal history timestamps.
 * Uses the browser's own zone via Intl — never a hardcoded offset.
 */
export function formatPrintedLocal(ts: string | Date, now: Date = new Date()): string {
  const d = ts instanceof Date ? ts : new Date(ts);
  if (Number.isNaN(d.getTime())) return "unknown time";
  const sameDay =
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate();
  const time = new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit" }).format(d);
  if (sameDay) return time;
  const date = new Intl.DateTimeFormat(undefined, { day: "numeric", month: "short" }).format(d);
  return `${date} ${time}`;
}
