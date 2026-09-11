import type { DragEndEvent } from "@dnd-kit/core";
import { arrayMove } from "@dnd-kit/sortable";

export type ShowcaseParsedItem = {
  module_number: number;
  lesson_number: number;
  title: string;
  lesson_title?: string;
  original_title?: string;
  vimeo_id: string;
  link: string;
  duration_seconds: number | null;
  thumbnail_url: string | null;
  already_imported: boolean;
  existing_courses: Array<{ id: number; title: string; status: string | null }>;
};

export type ShowcaseUnmatchedItem = { title: string; vimeo_id: string | null; link: string | null };

export type ShowcasePreview = {
  albumId: string;
  videoCount: number;
  parsed: ShowcaseParsedItem[];
  unmatched: ShowcaseUnmatchedItem[];
};

/**
 * The subset of ShowcaseItemDraft's fields these pure functions actually
 * read or write. Generic over the caller's full draft type (which also
 * carries `questions`, `moduleNumber`, etc.) so this module never needs its
 * own copy of unrelated fields/types like QuizQuestion.
 */
export interface MinimalShowcaseItemDraft {
  key: string;
  vimeoId: string;
  lessonNumber: number;
  title: string;
  metadataFreeTitle: string;
  originalTitle: string;
}

/**
 * Renumbers `lesson_number` within each `module_number` group, starting at
 * 1, in array order. Exact behavior preserved from the original inline
 * helper in AcademyAddCoursePage.tsx.
 */
export function resequenceParsed(items: ShowcaseParsedItem[]): ShowcaseParsedItem[] {
  const nextLessonByModule = new Map<number, number>();
  return items.map((item) => {
    const lessonNumber = (nextLessonByModule.get(item.module_number) ?? 0) + 1;
    nextLessonByModule.set(item.module_number, lessonNumber);
    return { ...item, lesson_number: lessonNumber };
  });
}

/**
 * Resequences a newly-ordered `parsed` array and re-maps `items` (the
 * AI-drafted-lesson list) to the new lesson numbers by matching on
 * vimeo_id/vimeoId. An item whose vimeo_id is no longer present in
 * `parsed` is silently dropped -- existing behavior, not a bug.
 */
export function applyShowcaseOrder<T extends MinimalShowcaseItemDraft>(
  parsed: ShowcaseParsedItem[],
  items: T[],
  ordered: ShowcaseParsedItem[],
): { parsed: ShowcaseParsedItem[]; items: T[] } {
  const resequenced = resequenceParsed(ordered);
  let nextItems = items;
  if (items.length > 0) {
    const byVimeoId = new Map(items.map((item) => [item.vimeoId, item]));
    nextItems = resequenced
      .map((item) => {
        const draft = byVimeoId.get(item.vimeo_id);
        return draft ? { ...draft, lessonNumber: item.lesson_number } : null;
      })
      .filter((item): item is T => item !== null);
  }
  return { parsed: resequenced, items: nextItems };
}

/** Drag-and-drop reorder of the review list, id-matched on vimeo_id. Returns null for a no-op. */
export function reorderShowcaseByDragEvent(
  parsed: ShowcaseParsedItem[],
  event: DragEndEvent,
): ShowcaseParsedItem[] | null {
  const { active, over } = event;
  if (!over || active.id === over.id) return null;
  const oldIndex = parsed.findIndex((p) => p.vimeo_id === active.id);
  const newIndex = parsed.findIndex((p) => p.vimeo_id === over.id);
  if (oldIndex === -1 || newIndex === -1) return null;
  return arrayMove(parsed, oldIndex, newIndex);
}

/** Single-step up/down reorder by index + direction, clamped to array bounds. Returns null for a no-op. */
export function moveShowcaseByDirection(
  parsed: ShowcaseParsedItem[],
  index: number,
  direction: -1 | 1,
): ShowcaseParsedItem[] | null {
  const nextIndex = index + direction;
  if (nextIndex < 0 || nextIndex >= parsed.length) return null;
  const next = [...parsed];
  [next[index], next[nextIndex]] = [next[nextIndex], next[index]];
  return next;
}

/** Sorts by (module_number, lesson_number). */
export function autoOrganiseShowcase(parsed: ShowcaseParsedItem[]): ShowcaseParsedItem[] {
  return [...parsed].sort((a, b) => a.module_number - b.module_number || a.lesson_number - b.lesson_number);
}

/** Whether removing title numbering would change anything -- the existing no-op guard. */
export function hasShowcaseMetadataToRemove<T extends MinimalShowcaseItemDraft>(
  parsed: ShowcaseParsedItem[],
  items: T[],
): boolean {
  return (
    parsed.some((item) => item.lesson_title && item.lesson_title !== item.title) ||
    items.some((item) => item.metadataFreeTitle !== item.title)
  );
}

/** Swaps each title for its metadata-free (numbering-removed) form. */
export function removeShowcaseMetadata<T extends MinimalShowcaseItemDraft>(
  parsed: ShowcaseParsedItem[],
  items: T[],
): { parsed: ShowcaseParsedItem[]; items: T[] } {
  return {
    parsed: parsed.map((item) => ({ ...item, title: item.lesson_title || item.title })),
    items: items.map((item) => ({ ...item, title: item.metadataFreeTitle })),
  };
}

/** Whether restoring original Vimeo titles would change anything -- the existing no-op guard. */
export function hasShowcaseMetadataToRestore<T extends MinimalShowcaseItemDraft>(
  parsed: ShowcaseParsedItem[],
  items: T[],
): boolean {
  return (
    parsed.some((item) => item.original_title && item.original_title !== item.title) ||
    items.some((item) => item.originalTitle !== item.title)
  );
}

/** Restores each title to its original Vimeo (numbered) form. */
export function restoreShowcaseMetadata<T extends MinimalShowcaseItemDraft>(
  parsed: ShowcaseParsedItem[],
  items: T[],
): { parsed: ShowcaseParsedItem[]; items: T[] } {
  return {
    parsed: parsed.map((item) => ({ ...item, title: item.original_title || item.title })),
    items: items.map((item) => ({ ...item, title: item.originalTitle })),
  };
}

/**
 * Relocates one item (by vimeo_id) to the end of a target module's existing
 * items, preserving order otherwise. Returns null for a no-op (item not
 * found, or already in the target module) -- the caller's existing guard.
 */
export function moveShowcaseItemToModule(
  parsed: ShowcaseParsedItem[],
  vimeoId: string,
  moduleNumber: number,
): { ordered: ShowcaseParsedItem[]; movedTitle: string } | null {
  const item = parsed.find((candidate) => candidate.vimeo_id === vimeoId);
  if (!item || item.module_number === moduleNumber) return null;
  const withoutItem = parsed.filter((candidate) => candidate.vimeo_id !== vimeoId);
  const destinationIndex = withoutItem.reduce(
    (lastIndex, candidate, candidateIndex) => (candidate.module_number === moduleNumber ? candidateIndex : lastIndex),
    -1,
  );
  withoutItem.splice(destinationIndex + 1, 0, { ...item, module_number: moduleNumber });
  return { ordered: withoutItem, movedTitle: item.title };
}

export type ShowcaseItemsReorderResult<T extends MinimalShowcaseItemDraft> =
  | { changed: "applied"; parsed: ShowcaseParsedItem[]; items: T[]; nextSelectedIndex: number }
  | { changed: "items-only"; items: T[]; nextSelectedIndex: number };

/**
 * Drag-and-drop reorder of the drafted-lessons strip (after AI drafting),
 * id-matched on `key`. Keeps the preview list's numbering in sync via
 * applyShowcaseOrder but never re-invokes AI generation. Returns null for
 * a no-op. `hasPreview` mirrors the original `showcasePreview ? ... : []`
 * ternary -- when there's no preview yet, the preview state is left
 * untouched entirely (`changed: "items-only"`), matching original behavior.
 */
export function reorderShowcaseItemsByDragEvent<T extends MinimalShowcaseItemDraft>(
  parsed: ShowcaseParsedItem[],
  items: T[],
  hasPreview: boolean,
  event: DragEndEvent,
  selectedIndex: number,
): ShowcaseItemsReorderResult<T> | null {
  const { active, over } = event;
  if (!over || active.id === over.id) return null;
  const oldIndex = items.findIndex((d) => d.key === active.id);
  const newIndex = items.findIndex((d) => d.key === over.id);
  if (oldIndex === -1 || newIndex === -1) return null;
  const reordered = arrayMove(items, oldIndex, newIndex);
  const nextSelectedIndex = selectedIndex === oldIndex ? newIndex : selectedIndex;
  const orderedParsed = hasPreview
    ? reordered
        .map((draft) => parsed.find((item) => item.vimeo_id === draft.vimeoId))
        .filter((item): item is ShowcaseParsedItem => item !== undefined)
    : [];
  if (orderedParsed.length > 0) {
    const applied = applyShowcaseOrder(parsed, items, orderedParsed);
    return { changed: "applied", ...applied, nextSelectedIndex };
  }
  return { changed: "items-only", items: reordered, nextSelectedIndex };
}
