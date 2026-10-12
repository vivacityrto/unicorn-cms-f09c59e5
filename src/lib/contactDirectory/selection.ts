/**
 * Selection helpers for the Contact Directory table. The header checkbox only
 * ever ticks the visible page, so "select everything that matches the current
 * filters" is a separate, explicit step (offered once a whole page is ticked).
 */

export interface SelectionSummary {
  /** Every row on the current page is selected. */
  pageFullySelected: boolean;
  /** Every row matching the current filters is selected. */
  allMatchingSelected: boolean;
  /** Matching rows beyond the current page that "select all matching" would add. */
  canSelectAllMatching: boolean;
}

export function summariseSelection(filteredKeys: string[], pagedKeys: string[], selected: Set<string>): SelectionSummary {
  const pageFullySelected = pagedKeys.length > 0 && pagedKeys.every((k) => selected.has(k));
  const allMatchingSelected = filteredKeys.length > 0 && filteredKeys.every((k) => selected.has(k));
  return {
    pageFullySelected,
    allMatchingSelected,
    canSelectAllMatching: pageFullySelected && !allMatchingSelected && filteredKeys.length > pagedKeys.length,
  };
}

/** Splits a list into chunks so a very large selection is written in several requests. */
export function chunk<T>(values: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < values.length; i += size) out.push(values.slice(i, i + size));
  return out;
}
