import { format } from 'date-fns';

/** Only http(s) URLs are ever rendered as links. */
export function safeExternalUrl(value: string): string | null {
  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:' ? url.toString() : null;
  } catch {
    return null;
  }
}

export function formatDate(value: string | null | undefined, pattern = 'd MMM yyyy'): string | null {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : format(date, pattern);
}

/** "in 10 days", "today", "3 days overdue" for a day offset from today (negative = past). */
export function relativeDays(days: number): string {
  if (days === 0) return 'today';
  const n = Math.abs(days);
  const unit = n === 1 ? 'day' : 'days';
  return days > 0 ? `in ${n} ${unit}` : `${n} ${unit} overdue`;
}
