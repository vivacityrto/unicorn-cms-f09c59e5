import { ChecklistItem, DailyNote, NoteColor, isValidColor, newItemId } from './types';

interface RawRow {
  id: string;
  user_id: string;
  note_date: string;
  title?: string | null;
  color?: string | null;
  body?: string | null;
  items?: unknown;
  content?: string | null;
  created_at: string;
  updated_at?: string | null;
}

function coerceItems(raw: unknown): ChecklistItem[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((r) => {
      if (!r || typeof r !== 'object') return null;
      const obj = r as Record<string, unknown>;
      const id = typeof obj.id === 'string' ? obj.id : newItemId();
      const text = typeof obj.text === 'string' ? obj.text : '';
      const done = obj.done === true;
      return { id, text, done } as ChecklistItem;
    })
    .filter((x): x is ChecklistItem => x !== null);
}

/**
 * Normalise a raw row into a DailyNote. If the row is legacy (empty title +
 * empty items) and has non-empty `content`, derive title/items from it so
 * old freeform notes still render sensibly.
 */
export function hydrateLegacyNote(row: RawRow): DailyNote {
  const items = coerceItems(row.items);
  const title = (row.title ?? '').trim();
  const body = row.body ?? '';
  const color: NoteColor = isValidColor(row.color) ? row.color : 'purple';
  const legacy = (row.content ?? '').trim();

  let outTitle = title;
  let outItems = items;
  let outBody = body;

  if (!title && items.length === 0 && legacy) {
    const lines = legacy.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
    if (lines.length === 0) {
      outBody = body || legacy;
    } else if (lines.length === 1) {
      outTitle = lines[0];
    } else {
      outTitle = lines[0];
      outItems = lines.slice(1).map((text) => ({ id: newItemId(), text, done: false }));
    }
  }

  return {
    id: row.id,
    user_id: row.user_id,
    note_date: row.note_date,
    title: outTitle,
    color,
    body: outBody,
    items: outItems,
    content: row.content ?? '',
    created_at: row.created_at,
    updated_at: row.updated_at ?? null,
  };
}
