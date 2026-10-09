import type { WebinarListDiagnostics } from '@/services/teamsEventsService';

/**
 * Plain-English reason an upcoming-webinar list is empty, built from the
 * server's counts. Distinguishes "Microsoft returned nothing" (organiser
 * access policy / who created the webinars) from "we filtered everything out"
 * (not published, or outside the next 14 days).
 */
export function explainEmptyList(d: WebinarListDiagnostics | undefined): string | null {
  if (!d) return null;

  if (d.graph_total === 0) {
    return (
      'Microsoft returned no webinars at all. Webinars only appear when they were created by an organiser the ' +
      'Unicorn app has been granted access to (the Teams application access policy). Webinars created under a ' +
      'different account, or co-organised only, will not show.'
    );
  }

  const statuses = Object.entries(d.status_counts)
    .map(([status, n]) => `${n} ${status}`)
    .join(', ');
  const parts = [`Microsoft returned ${d.graph_total} webinar${d.graph_total === 1 ? '' : 's'} (${statuses}).`];

  const published = d.status_counts.published ?? 0;
  if (published === 0) {
    parts.push('None are published; draft and cancelled webinars are not listed.');
  } else {
    if (d.published_after_window > 0) {
      parts.push(`${d.published_after_window} published start more than 14 days from now.`);
    }
    if (d.published_before_window > 0) {
      parts.push(`${d.published_before_window} published have already started.`);
    }
    if (d.published_without_start > 0) {
      parts.push(`${d.published_without_start} published have no start time.`);
    }
  }
  return parts.join(' ');
}
