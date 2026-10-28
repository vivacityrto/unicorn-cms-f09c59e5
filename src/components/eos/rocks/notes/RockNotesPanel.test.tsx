/* @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { RockNote, RockNoteSummary } from '@/utils/rockNotes';

vi.mock('@/hooks/use-toast', () => ({ toast: vi.fn() }));

const mutateAsync = vi.fn();
const summarise = vi.fn();
const createTodo = vi.fn();
let notesData: { notes: RockNote[]; rockTitles: Record<string, string>; authorNames: Record<string, string>; includesDescendants: boolean };
let summaryData: RockNoteSummary | null;

vi.mock('@/hooks/useRockNotes', () => ({
  useAddRockNote: () => ({ mutateAsync }),
  useRockNotes: () => ({ data: notesData, isError: false }),
  useRockNoteSummary: () => ({ data: summaryData }),
  useSummariseRockNotes: () => ({ mutate: summarise, isPending: false }),
  useCreateTodoFromNote: () => ({ mutateAsync: createTodo, isPending: false }),
}));

import { RockNotesPanel } from '@/components/eos/rocks/notes/RockNotesPanel';
import { RockNotesDictationProvider } from '@/components/eos/rocks/notes/RockNotesDictation';

const rock = { id: 'r1', title: 'Harden RBAC', tenant_id: 6372 };

const note = (id: string, at: string, over: Partial<RockNote> = {}): RockNote => ({
  id, rock_id: 'r1', meeting_id: null, body: `body ${id}`, source: 'typed', rock_status: 'on_track',
  milestones_complete: 1, milestones_total: 4, created_by: 'u1', created_at: at, ...over,
});

const renderPanel = (meetingId = 'meeting-now') =>
  render(
    <QueryClientProvider client={new QueryClient()}>
      <RockNotesDictationProvider meetingId={meetingId}>
        <RockNotesPanel rock={rock} />
      </RockNotesDictationProvider>
    </QueryClientProvider>,
  );

beforeEach(() => {
  mutateAsync.mockReset();
  mutateAsync.mockResolvedValue({ note_id: 'n', created_at: 'x', duplicate: false });
  summarise.mockReset();
  createTodo.mockReset();
  createTodo.mockResolvedValue({ id: 't1' });
  notesData = { notes: [], rockTitles: { r1: 'Harden RBAC' }, authorNames: { u1: 'Amy Chen' }, includesDescendants: false };
  summaryData = null;
  delete (window as unknown as { SpeechRecognition?: unknown }).SpeechRecognition;
  delete (window as unknown as { webkitSpeechRecognition?: unknown }).webkitSpeechRecognition;
});
afterEach(cleanup);

describe('RockNotesPanel', () => {
  it('adds what was typed as a note for this Rock and this meeting', async () => {
    renderPanel();
    const box = screen.getByRole('textbox', { name: 'Note for Harden RBAC' });
    fireEvent.change(box, { target: { value: 'Supplier confirmed the date' } });
    expect(screen.getByText('Not saved yet')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Add note' }));
    await vi.waitFor(() => expect(mutateAsync).toHaveBeenCalled());
    expect(mutateAsync).toHaveBeenCalledWith({ rockId: 'r1', body: 'Supplier confirmed the date', meetingId: 'meeting-now', source: 'typed' });
  });

  it('disables Add note until there is text, and Ctrl+Enter adds it', async () => {
    renderPanel();
    expect((screen.getByRole('button', { name: 'Add note' }) as HTMLButtonElement).disabled).toBe(true);
    const box = screen.getByRole('textbox', { name: 'Note for Harden RBAC' });
    fireEvent.change(box, { target: { value: 'quick one' } });
    fireEvent.keyDown(box, { key: 'Enter', ctrlKey: true });
    await vi.waitFor(() => expect(mutateAsync).toHaveBeenCalledTimes(1));
  });

  it('says plainly when dictation is not available instead of failing silently', () => {
    renderPanel();
    const dictate = screen.getByRole('button', { name: /Dictate/ }) as HTMLButtonElement;
    expect(dictate.disabled).toBe(true);
    expect(dictate.title).toMatch(/not available in this browser/);
  });

  it('shows notes newest first with their time, author and the status change they recorded', () => {
    notesData.notes = [
      note('old', '2026-10-01T01:00:00Z', { rock_status: 'on_track' }),
      note('new', '2026-10-15T01:00:00Z', { rock_status: 'at_risk' }),
    ];
    renderPanel();
    const list = screen.getByRole('list', { name: 'Notes, newest first' });
    const items = within(list).getAllByRole('listitem');
    expect(items[0].textContent).toContain('body new');
    expect(items[0].textContent).toContain('Amy Chen');
    expect(items[0].querySelector('[aria-label^="Status changed from On Track to At Risk"]')).toBeTruthy();
    expect(items[1].textContent).toContain('body old');
  });

  it('shows what was said last time, from an earlier meeting only', () => {
    notesData.notes = [
      note('earlier', '2026-10-08T01:00:00Z', { meeting_id: 'meeting-before', body: 'Waiting on legal' }),
      note('today', '2026-10-15T01:00:00Z', { meeting_id: 'meeting-now', body: 'Legal replied' }),
    ];
    renderPanel();
    const last = screen.getByRole('heading', { name: /Last time/ }).parentElement!;
    expect(last.textContent).toContain('Waiting on legal');
    expect(last.textContent).not.toContain('Legal replied');
  });

  it('tags notes from Rocks beneath this one with the Rock they came from', () => {
    notesData = {
      notes: [note('child', '2026-10-15T01:00:00Z', { rock_id: 'r2', body: 'Individual update' })],
      rockTitles: { r1: 'Harden RBAC', r2: 'Review policies' },
      authorNames: {},
      includesDescendants: true,
    };
    renderPanel();
    expect(screen.getByText('Review policies')).toBeTruthy();
  });

  it('offers a summary only once there are notes, and asks for one', () => {
    renderPanel();
    expect(screen.queryByRole('button', { name: 'Write a summary' })).toBeNull();
    cleanup();
    notesData.notes = [note('a', '2026-10-15T01:00:00Z')];
    renderPanel();
    fireEvent.click(screen.getByRole('button', { name: 'Write a summary' }));
    expect(summarise).toHaveBeenCalledWith({ rockId: 'r1', force: false });
  });

  it('flags a summary that is behind the notes, and labels it as AI-written', () => {
    notesData.notes = [note('a', '2026-10-01T01:00:00Z'), note('b', '2026-10-20T01:00:00Z')];
    summaryData = {
      id: 's1', rock_id: 'r1', summary: 'Steady progress.', status_signal: 'at_risk', suggested_todos: [],
      notes_through: '2026-10-05T00:00:00Z', note_count: 1, rocks_included: 1, generated_at: '2026-10-05T01:00:00Z',
    };
    renderPanel();
    expect(screen.getByText('Steady progress.')).toBeTruthy();
    expect(screen.getByText(/1 newer note not included/)).toBeTruthy();
    expect(screen.getByText(/Written by AI from the notes only/)).toBeTruthy();
  });

  it('creates a To-Do only when asked, once, and shows it as created', async () => {
    notesData.notes = [note('a', '2026-10-01T01:00:00Z')];
    summaryData = {
      id: 's1', rock_id: 'r1', summary: 'Needs a follow-up.', status_signal: 'unclear', suggested_todos: [{ title: 'Chase the supplier' }],
      notes_through: '2026-10-01T01:00:00Z', note_count: 1, rocks_included: 1, generated_at: '2026-10-02T01:00:00Z',
    };
    renderPanel();
    expect(createTodo).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: /Create To-Do/ }));
    await vi.waitFor(() => expect(createTodo).toHaveBeenCalledTimes(1));
    expect(createTodo).toHaveBeenCalledWith(expect.objectContaining({ title: 'Chase the supplier', rockTitle: 'Harden RBAC', rockTenantId: 6372, meetingId: 'meeting-now' }));
    await screen.findByText('To-Do created');
    expect(screen.queryByRole('button', { name: /Create To-Do/ })).toBeNull();
  });
});
