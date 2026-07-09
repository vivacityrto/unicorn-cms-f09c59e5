## Goal
Redesign the Daily Notes side panel (`src/components/TaskNotesSidebar.tsx`) into a structured note+checklist hybrid with Panel/Focus modes, rich-text editor, carry-over, search, and expand-to-workspace. Keep existing trigger wiring in `TasksManagement.tsx` and the `@tanstack/react-query` + Supabase data pattern.

## 1. Database migration
Extend `public.user_daily_notes` (keep RLS + `content` column for back-compat):
```sql
ALTER TABLE public.user_daily_notes
  ADD COLUMN title text NOT NULL DEFAULT '',
  ADD COLUMN color text NOT NULL DEFAULT 'purple',
  ADD COLUMN body  text NOT NULL DEFAULT '',
  ADD COLUMN items jsonb NOT NULL DEFAULT '[]'::jsonb;
```
No server-side sanitize trigger — sanitize client-side only, matching how every other rich-text feature in this codebase already works (`ComposeEmailDialog`, `ClientStructuredNotesTab`, `NoteFormDialog` all sanitize via `src/lib/sanitize.ts`, none use a DB trigger).

Legacy row hydration is read-side only (no data migration): if `title`/`items` empty and `content` non-empty, derive `title` = first line, `items` = remaining lines as unchecked.

## 2. Component structure
Replace internals of `TaskNotesSidebar.tsx`; keep exported signature (`isOpen`, `onClose`, `userId`) so `TasksManagement.tsx` wiring is untouched. New files under `src/components/task-notes/`:

- **`TaskNotesSidebar.tsx`** — shell, header, `Panel ⇄ Focus` segmented toggle (persisted to `localStorage['unicorn:notes:view-mode']`), search state, selected-date state, expand state. Renders `PanelMode` or `FocusMode`.
- **`PanelMode.tsx`** — progress bar, search, month `Calendar` (dot on note-days, aqua selected, acai today), day label + Add Note, `CarryOverBanner`, `NoteCardList`, sticky footer (Delete Completed / Clear All).
- **`FocusMode.tsx`** — progress ring (SVG, purple→fuchsia gradient), 7-day week strip with chevron paging, search, Add Note, `CarryOverBanner`, `NoteCardList`. No footer.
- **`NoteCard.tsx`** — time, color dot, title, sanitized body (`dangerouslySetInnerHTML` with `sanitizeNoteHtml`), checklist with circular checkboxes, inline "Add item" input, edit/delete icon buttons. Toggle/add-item = optimistic `useMutation` on `items`.
- **`NoteEditorModal.tsx`** — shared Add/Edit modal. Reuse existing `<RichTextEditor>` from `src/components/ui/rich-text-editor.tsx` (already wraps Tiptap StarterKit + Link + Underline + TextAlign — do not instantiate a second bespoke `useEditor()`). Title input, 4 color swatches, checklist editor, discard-if-empty rule.
- **`CarryOverBanner.tsx`** — macaron banner, count of unfinished items from previous day, "Carry Over" action.
- **`SearchResultsList.tsx`** — flat, date-desc results with date chip when search query active.
- **`ExpandedNotesModal.tsx`** — two-pane full-screen modal (left: search + calendar + progress + carry-over; right: 2-column grid of note cards).
- **`useDailyNotes.ts`** — `useNotesForDate`, `useNotesForMonth` (calendar dots), `useSearchNotes`, `usePreviousDayUnfinished`. All keyed `['user_daily_notes', userId, ...]`.
- **`useNoteMutations.ts`** — `createNote`, `updateNote`, `deleteNote`, `toggleItem`, `addItem`, `carryOver`, `deleteCompleted`, `clearAll`. Each invalidates the relevant query keys and shows a sonner toast.
- **`sanitizeNoteHtml.ts`** — Add an optional `overrides` param to `sanitizeHtml()` in `src/lib/sanitize.ts` (merges into `ALLOWED_TAGS`/`ALLOWED_ATTR`, backward compatible), then this file calls it with the widened allowlist: `p, br, strong, em, u, s, h2, h3, ul, ol, li, blockquote, hr, a[href], span[style]` — matching what `RichTextEditor`'s extensions can actually produce. Force `a` to `rel="noopener noreferrer" target="_blank"`.
- **`hydrateLegacyNote.ts`** — pure function: if `title` + `items` empty and `content` non-empty, split into title + unchecked items.

## 3. Styling
Colors/gradients via existing CSS custom properties in `src/index.css` (`--brand-purple-600`, `--brand-acai-700`, `--brand-light-purple-300`, `--brand-fuchsia-600`, `--brand-macaron-500`, `--primary`, `--gradient-brand`, `--radius`). No hardcoded hex. Shadows via Tailwind utilities `shadow-card` / `shadow-card-hover` / `shadow-xl` (defined in `tailwind.config.ts`'s `boxShadow`, not CSS vars). Motion easing via `ease-smooth` Tailwind class (already `cubic-bezier(0.4,0,0.2,1)`). Panel width ~470px. `prefers-reduced-motion` respected via `motion-reduce:` utilities. Icons only from `lucide-react`.

## 4. Interactions
- Mode toggle swaps only region below header; shared state (selected date, search, scroll) lives in `TaskNotesSidebar.tsx` and is passed as props.
- Search: when query non-empty, both modes render `SearchResultsList` instead of the calendar/week + notes; Add Note still targets `selectedDate`.
- Carry-over: RPC-free — client reads previous day's notes, computes unfinished items; on click, upserts a "Carried Over" macaron note on `selectedDate`, updates source notes, deletes any source note that becomes fully empty.
- Empty-note discard: `createNote`/`updateNote` short-circuit or delete when title/body/items all empty.
- Toasts: reuse `sonner` (already imported in current file).

## 5. Wiring
No changes to `src/pages/TasksManagement.tsx`. The Notes button + `<TaskNotesSidebar>` mount stay as-is.

## 6. Dependencies
None to add — `@tiptap/*`, `dompurify` already installed and wired into `src/components/ui/rich-text-editor.tsx` and `src/lib/sanitize.ts`. Reuse both rather than adding parallel copies.

## 7. Out of scope
- No tenant scoping (internal per-user tool; RLS is already `auth.uid() = user_id`).
- No changes to `TasksManagement.tsx` beyond existing mount.
- No changes to unrelated files/features.

## Acceptance
Walk through §8 checklist of the uploaded spec: mode toggle preserves state, calendar dots, progress bar/ring, carry-over banner + action, cross-date search, expand modal, empty-note discard, sanitized rich text (toolbar formatting survives a save round-trip), reduced-motion, toast styling.