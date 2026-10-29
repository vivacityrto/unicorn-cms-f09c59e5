/* @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';

const notes = vi.hoisted(() => ({
  provided: true,
  stopMic: vi.fn(),
  isRecording: false,
  activeRockId: null as string | null,
  handingOverFromRockId: null as string | null,
  lastSaved: null as { rockId: string; at: number } | null,
  drafts: {} as Record<string, string>,
}));
vi.mock('@/components/eos/rocks/notes/RockNotesDictation', () => ({
  useOptionalRockNotesDictation: () => (notes.provided ? { ...notes, getDraft: (id: string) => notes.drafts[id] ?? '' } : null),
}));

import { DictationStatusBar } from '@/components/eos/meeting/discuss/DictationStatusBar';

const titles: Record<string, string> = { a: 'Alpha tidy-up', b: 'Bravo hiring' };
const renderBar = (currentRockId: string | null = 'a') =>
  render(<DictationStatusBar currentRockId={currentRockId} titleOf={id => titles[id] ?? 'this Rock'} fallback={<p>fallback hint</p>} />);

beforeEach(() => {
  notes.provided = true;
  notes.stopMic.mockReset();
  notes.isRecording = false;
  notes.activeRockId = null;
  notes.handingOverFromRockId = null;
  notes.lastSaved = null;
  notes.drafts = {};
});
afterEach(cleanup);

describe('DictationStatusBar', () => {
  it('shows the fallback when there is nothing to say, and without a notes controller', () => {
    renderBar();
    expect(screen.getByText('fallback hint')).toBeInTheDocument();
    cleanup();
    notes.provided = false;
    renderBar();
    expect(screen.getByText('fallback hint')).toBeInTheDocument();
  });

  it('names the Rock the microphone is writing to, says Next keeps the note, and offers Stop', () => {
    notes.isRecording = true;
    notes.activeRockId = 'a';
    renderBar();
    expect(screen.getByText(/Listening · notes go to “Alpha tidy-up”/)).toBeInTheDocument();
    expect(screen.getByTitle('Next saves this note and keeps listening for the next Rock')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Stop/ }));
    expect(notes.stopMic).toHaveBeenCalled();
  });

  it('says it is finishing and saving the Rock just left while the microphone hands over', () => {
    notes.isRecording = true;
    notes.activeRockId = 'a';
    notes.handingOverFromRockId = 'a';
    renderBar('b');
    expect(screen.getByText(/Saving your note for “Alpha tidy-up”/)).toBeInTheDocument();
    expect(screen.queryByText(/Listening ·/)).toBeNull();
  });

  it('confirms a save with the Rock it was saved for', () => {
    notes.lastSaved = { rockId: 'a', at: 1 };
    renderBar('b');
    expect(screen.getByText(/Saved your note for “Alpha tidy-up”/)).toBeInTheDocument();
  });

  it('warns about an unsaved note on this Rock, and says Next saves it', () => {
    notes.drafts = { a: 'half a thought' };
    renderBar('a');
    expect(screen.getByText(/Unsaved note for “Alpha tidy-up” · Next saves it/)).toBeInTheDocument();
  });

  it('prefers the live and hand-over states over an older confirmation', () => {
    notes.lastSaved = { rockId: 'a', at: 1 };
    notes.isRecording = true;
    notes.activeRockId = 'b';
    renderBar('b');
    expect(screen.getByText(/Listening · notes go to “Bravo hiring”/)).toBeInTheDocument();
    expect(screen.queryByText(/Saved your note/)).toBeNull();
  });
});
