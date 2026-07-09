export type NoteColor = 'purple' | 'aqua' | 'fuchsia' | 'macaron';

export interface ChecklistItem {
  id: string;
  text: string;
  done: boolean;
}

export interface DailyNote {
  id: string;
  user_id: string;
  note_date: string;
  title: string;
  color: NoteColor;
  body: string;
  items: ChecklistItem[];
  content: string; // legacy
  created_at: string;
  updated_at: string | null;
}

export type ViewMode = 'panel' | 'focus';

export const COLOR_SWATCH: Record<NoteColor, { dot: string; ring: string; label: string }> = {
  purple:   { dot: 'bg-brand-purple-600',   ring: 'ring-brand-purple-600',   label: 'Purple' },
  aqua:     { dot: 'bg-brand-aqua-500',     ring: 'ring-brand-aqua-500',     label: 'Aqua' },
  fuchsia:  { dot: 'bg-brand-fuchsia-600',  ring: 'ring-brand-fuchsia-600',  label: 'Fuchsia' },
  macaron:  { dot: 'bg-brand-macaron-500',  ring: 'ring-brand-macaron-500',  label: 'Macaron' },
};

export function isValidColor(v: unknown): v is NoteColor {
  return v === 'purple' || v === 'aqua' || v === 'fuchsia' || v === 'macaron';
}

export function newItemId(): string {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2);
}
