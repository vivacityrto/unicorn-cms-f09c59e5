import { describe, expect, it } from 'vitest';
import type { WebinarListDiagnostics } from '@/services/teamsEventsService';
import { explainEmptyList } from './emptyListExplanation';

const base: WebinarListDiagnostics = {
  graph_total: 0,
  status_counts: {},
  published_in_window: 0,
  published_before_window: 0,
  published_after_window: 0,
  published_without_start: 0,
  earliest_published_start_utc: null,
  latest_published_start_utc: null,
};

describe('explainEmptyList', () => {
  it('returns nothing when the server sent no diagnostics', () => {
    expect(explainEmptyList(undefined)).toBeNull();
  });

  it('says Microsoft returned nothing, and points at the organiser access policy', () => {
    const text = explainEmptyList(base) ?? '';
    expect(text).toContain('Microsoft returned no webinars at all');
    expect(text).toContain('application access policy');
  });

  it('explains when nothing is published', () => {
    const text = explainEmptyList({ ...base, graph_total: 3, status_counts: { draft: 2, canceled: 1 } }) ?? '';
    expect(text).toContain('Microsoft returned 3 webinars (2 draft, 1 canceled).');
    expect(text).toContain('None are published');
  });

  it('explains published webinars outside the 14-day window', () => {
    const text =
      explainEmptyList({
        ...base,
        graph_total: 4,
        status_counts: { published: 4 },
        published_after_window: 3,
        published_before_window: 1,
      }) ?? '';
    expect(text).toContain('3 published start more than 14 days from now.');
    expect(text).toContain('1 published have already started.');
  });

  it('uses the singular for one webinar', () => {
    const text = explainEmptyList({ ...base, graph_total: 1, status_counts: { draft: 1 } }) ?? '';
    expect(text).toContain('Microsoft returned 1 webinar (1 draft).');
  });
});
