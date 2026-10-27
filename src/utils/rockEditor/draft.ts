import type { RockLevel } from '@/types/eos';
import type { RockEditorValues } from '@/utils/rockEditor/types';

type DraftStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

export interface RockDraft {
  v: 1;
  savedAt: number;
  values: RockEditorValues;
}

const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

export const draftKey = (level: RockLevel, parentId: string | null) => `eos-rock-draft:${level}:${parentId ?? 'none'}`;

/** Only worth keeping when someone has typed something. */
export function isMeaningful(values: RockEditorValues): boolean {
  return (
    values.title.trim() !== '' ||
    values.description.trim() !== '' ||
    values.issue.trim() !== '' ||
    values.outcome.trim() !== '' ||
    values.milestones.some(m => m.title.trim() !== '')
  );
}

/** Storage can be blocked or full (private windows, cleared site data), so every call is guarded. */
export function saveDraft(storage: DraftStorage | undefined, key: string, values: RockEditorValues, now = Date.now()): void {
  if (!storage) return;
  try {
    if (!isMeaningful(values)) storage.removeItem(key);
    else storage.setItem(key, JSON.stringify({ v: 1, savedAt: now, values } satisfies RockDraft));
  } catch {
    /* the draft just isn't kept */
  }
}

export function loadDraft(storage: DraftStorage | undefined, key: string, now = Date.now()): RockDraft | null {
  if (!storage) return null;
  try {
    const raw = storage.getItem(key);
    if (!raw) return null;
    const draft = JSON.parse(raw) as Partial<RockDraft>;
    const values = draft.values;
    const valid =
      draft.v === 1 &&
      typeof draft.savedAt === 'number' &&
      !!values &&
      typeof values.title === 'string' &&
      typeof values.level === 'string' &&
      Array.isArray(values.milestones);
    if (!valid || now - draft.savedAt! > MAX_AGE_MS) {
      storage.removeItem(key);
      return null;
    }
    return draft as RockDraft;
  } catch {
    return null;
  }
}

export function clearDraft(storage: DraftStorage | undefined, key: string): void {
  try {
    storage?.removeItem(key);
  } catch {
    /* nothing to do */
  }
}
