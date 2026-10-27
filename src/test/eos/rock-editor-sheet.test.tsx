import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { RockEditorSheet } from '@/components/eos/rockEditor/RockEditorSheet';
import type { RockLevel } from '@/types/eos';
import type { EditorRock } from '@/hooks/useRockEditorData';

const state = vi.hoisted(() => ({
  rocks: [] as unknown[],
  companyMilestones: [] as unknown[],
  mutateAsync: vi.fn(),
  suggest: vi.fn(),
}));

vi.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ profile: { user_uuid: 'me' } }) }));
vi.mock('@/hooks/useVivacityTeamUsers', () => ({
  VIVACITY_TENANT_ID: 6372,
  useVivacityTeamUsers: () => ({ data: [{ user_uuid: 'me', first_name: 'Carl', last_name: 'S', email: 'c@x.au' }] }),
}));
vi.mock('@/hooks/useRockEditorData', () => ({
  useRockEditorData: () => ({
    rocks: state.rocks, rocksLoading: false, rocksError: null,
    functions: [{ id: 'fn', name: 'Delivery' }],
    companyMilestones: state.companyMilestones, companyRootId: null,
  }),
}));
vi.mock('@/hooks/useSaveRock', () => ({ useSaveRock: () => ({ mutateAsync: state.mutateAsync, isPending: false }) }));
vi.mock('@/hooks/useAISuggestRock', () => ({ useAISuggestRock: () => ({ suggestRock: state.suggest, isGenerating: false }) }));
vi.mock('@/components/eos/VivacityTeamPicker', () => ({
  VivacityTeamPicker: ({ value, onChange, placeholder }: { value: string; onChange: (id: string) => void; placeholder?: string }) => (
    <input aria-label={placeholder || 'person'} value={value} onChange={e => onChange(e.target.value)} />
  ),
}));

const NOW_Q = (() => { const d = new Date(); return { year: d.getFullYear(), quarter: Math.floor(d.getMonth() / 3) + 1 }; })();
const rock = (over: Partial<EditorRock> & { id: string; title: string; level: RockLevel }): EditorRock => ({
  quarterYear: NOW_Q.year, quarterNumber: NOW_Q.quarter, ownerId: 'me', archived: false, parentId: null, ...over,
});

const open = (props: Partial<React.ComponentProps<typeof RockEditorSheet>> = {}) => {
  const onOpenChange = vi.fn();
  const onCreated = vi.fn();
  render(<RockEditorSheet open onOpenChange={onOpenChange} onCreated={onCreated} {...props} />);
  return { onOpenChange, onCreated };
};

beforeEach(() => {
  state.rocks = [];
  state.companyMilestones = [];
  state.mutateAsync.mockReset().mockResolvedValue({ id: 'new-1', parent_rock_id: null, action: 'created' });
  state.suggest.mockReset();
  window.localStorage.clear();
});

describe('RockEditorSheet: create', () => {
  it('keeps the buttons enabled and explains what is missing instead of silently refusing', () => {
    open();
    const create = screen.getByRole('button', { name: 'Create Company Rock' });
    expect(create).toBeEnabled();
    fireEvent.click(create);

    const alert = screen.getByRole('alert');
    expect(within(alert).getByText(/One thing needs fixing|things need fixing/)).toBeInTheDocument();
    expect(within(alert).getByRole('button', { name: /Title: Give the Rock a title/ })).toBeInTheDocument();
    expect(within(alert).getByRole('button', { name: /Owner:/ })).toBeInTheDocument();
    expect(state.mutateAsync).not.toHaveBeenCalled();
  });

  it('creates a Company Rock with a due date already defaulted to the quarter end', async () => {
    const { onOpenChange, onCreated } = open();
    fireEvent.change(screen.getByLabelText(/^Title/), { target: { value: 'Double recurring revenue' } });
    fireEvent.change(screen.getByLabelText('Who is accountable?'), { target: { value: 'me' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create Company Rock' }));

    await waitFor(() => expect(state.mutateAsync).toHaveBeenCalledTimes(1));
    const { values } = state.mutateAsync.mock.calls[0][0];
    expect(values).toMatchObject({ level: 'company', title: 'Double recurring revenue', ownerId: 'me', parentId: null });
    expect(values.dueDate).toMatch(/^\d{4}-(03-31|06-30|09-30|12-31)$/);
    await waitFor(() => expect(onCreated).toHaveBeenCalledWith('new-1'));
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it('starts an Individual Rock under the Rock it was opened from, owned by the person creating it', async () => {
    state.rocks = [rock({ id: 'co', title: 'Grow revenue', level: 'company' })];
    open({ initialLevel: 'individual', initialParentId: 'co' });
    fireEvent.change(screen.getByLabelText(/^Title/), { target: { value: 'Close five enterprise deals' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create Individual Rock' }));

    await waitFor(() => expect(state.mutateAsync).toHaveBeenCalled());
    expect(state.mutateAsync.mock.calls[0][0].values).toMatchObject({ level: 'individual', parentId: 'co', ownerId: 'me' });
  });

  it('sends the parent’s client with an Individual Rock under a client Team Rock', async () => {
    state.rocks = [rock({ id: 'ct', title: 'Client Rock - Altaira - Q4', level: 'team', clientTenantId: 55 })];
    open({ initialLevel: 'individual', initialParentId: 'ct' });
    fireEvent.change(screen.getByLabelText(/^Title/), { target: { value: 'Run the Altaira onboarding' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create Individual Rock' }));

    await waitFor(() => expect(state.mutateAsync).toHaveBeenCalled());
    expect(state.mutateAsync.mock.calls[0][0]).toMatchObject({ clientTenantId: 55 });
  });

  it('sends no client for a Company Rock', async () => {
    open();
    fireEvent.change(screen.getByLabelText(/^Title/), { target: { value: 'No client here' } });
    fireEvent.change(screen.getByLabelText('Who is accountable?'), { target: { value: 'me' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create Company Rock' }));
    await waitFor(() => expect(state.mutateAsync).toHaveBeenCalled());
    expect(state.mutateAsync.mock.calls[0][0].clientTenantId).toBeNull();
  });

  it('says so, and offers a way out, when a Team Rock has no Company Rock to serve', () => {
    open({ initialLevel: 'team' });
    expect(screen.getByText(/no Company Rock in Q\d \d{4} to serve yet/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Create a Company Rock instead' }));
    expect(screen.getByRole('button', { name: 'Create Company Rock' })).toBeInTheDocument();
    expect(screen.queryByText(/to serve yet/)).not.toBeInTheDocument();
  });

  it('warns about a likely duplicate in the same quarter without blocking', () => {
    state.rocks = [rock({ id: 'x', title: 'Launch the new client portal', level: 'company' })];
    open();
    fireEvent.change(screen.getByLabelText(/^Title/), { target: { value: 'Launch the new client portal' } });
    expect(screen.getByText(/similar Rock already exists this quarter/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Create Company Rock' })).toBeEnabled();
  });

  it('turns a pasted list into milestones', () => {
    open();
    fireEvent.click(screen.getByRole('button', { name: 'Paste a list' }));
    fireEvent.change(screen.getByLabelText(/One milestone per line/), { target: { value: '1. Draft the plan\n- Review it\n\n3) Publish' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add 3 milestones' }));
    expect(screen.getByLabelText('Milestone 1 title')).toHaveValue('Draft the plan');
    expect(screen.getByLabelText('Milestone 2 title')).toHaveValue('Review it');
    expect(screen.getByLabelText('Milestone 3 title')).toHaveValue('Publish');
  });

  it('adds the next milestone when Enter is pressed in a filled title', () => {
    open();
    fireEvent.click(screen.getByRole('button', { name: 'Add milestone' }));
    const first = screen.getByLabelText('Milestone 1 title');
    fireEvent.change(first, { target: { value: 'One' } });
    fireEvent.keyDown(first, { key: 'Enter' });
    expect(screen.getByLabelText('Milestone 2 title')).toBeInTheDocument();
  });

  it('clears the form for the next Rock after "Create and add another", keeping the level', async () => {
    const { onOpenChange } = open();
    fireEvent.change(screen.getByLabelText(/^Title/), { target: { value: 'First Rock' } });
    fireEvent.change(screen.getByLabelText('Who is accountable?'), { target: { value: 'me' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create and add another' }));

    await waitFor(() => expect(screen.getByLabelText(/^Title/)).toHaveValue(''));
    expect(onOpenChange).not.toHaveBeenCalledWith(false);
    expect(screen.getByLabelText('Who is accountable?')).toHaveValue('me');
    expect(screen.getByText(/1 created so far/)).toBeInTheDocument();
  });

  it('submits with Ctrl+Enter', async () => {
    open();
    fireEvent.change(screen.getByLabelText(/^Title/), { target: { value: 'Keyboard Rock' } });
    fireEvent.change(screen.getByLabelText('Who is accountable?'), { target: { value: 'me' } });
    fireEvent.keyDown(screen.getByLabelText(/^Title/), { key: 'Enter', ctrlKey: true });
    await waitFor(() => expect(state.mutateAsync).toHaveBeenCalledTimes(1));
  });

  it('stays open and keeps what was typed when the save fails', async () => {
    state.mutateAsync.mockRejectedValueOnce(new Error('nope'));
    const { onOpenChange } = open();
    fireEvent.change(screen.getByLabelText(/^Title/), { target: { value: 'Will fail' } });
    fireEvent.change(screen.getByLabelText('Who is accountable?'), { target: { value: 'me' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create Company Rock' }));
    await waitFor(() => expect(state.mutateAsync).toHaveBeenCalled());
    expect(onOpenChange).not.toHaveBeenCalledWith(false);
    expect(screen.getByLabelText(/^Title/)).toHaveValue('Will fail');
  });

  it('offers to restore an unfinished draft, and keeps it until the person decides', async () => {
    window.localStorage.setItem('eos-rock-draft:company:none', JSON.stringify({
      v: 1, savedAt: Date.now() - 1000,
      values: { level: 'company', parentId: null, functionId: null, ownerId: null, title: 'Half done', description: '', issue: '', outcome: '', quarterYear: NOW_Q.year, quarterNumber: NOW_Q.quarter, dueDate: '', milestones: [] },
    }));
    open();
    expect(screen.getByRole('status')).toHaveTextContent('Half done');
    fireEvent.click(screen.getByRole('button', { name: 'Restore it' }));
    expect(screen.getByLabelText(/^Title/)).toHaveValue('Half done');
  });

  it('fills only the empty fields from an AI draft', async () => {
    state.suggest.mockResolvedValue({ title: 'AI title', description: 'AI description', issue: 'AI issue', outcome: 'AI outcome', milestones: [{ text: 'AI step' }] });
    open();
    fireEvent.change(screen.getByLabelText(/^Title/), { target: { value: 'My own title' } });
    fireEvent.click(screen.getByRole('button', { name: /More context/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Draft with AI' }));
    await waitFor(() => expect(screen.getByLabelText('Description')).toHaveValue('AI description'));
    expect(screen.getByLabelText(/^Title/)).toHaveValue('My own title');
    expect(screen.getByLabelText('Milestone 1 title')).toHaveValue('AI step');
  });
});
