import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { RockEditorSheet } from '@/components/eos/rockEditor/RockEditorSheet';
import type { EosRock, RockLevel } from '@/types/eos';
import type { EditorRock } from '@/hooks/useRockEditorData';

const state = vi.hoisted(() => ({
  rocks: [] as unknown[],
  companyMilestones: [] as unknown[],
  mutateAsync: vi.fn(),
  suggest: vi.fn(),
  edit: { ready: true, milestones: [] as unknown[], links: [] as unknown[], error: null as Error | null, clientName: null as string | null },
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
    savedMilestones: state.edit.milestones, savedLinks: state.edit.links, editDataReady: state.edit.ready,
    editDataError: state.edit.error, clientName: state.edit.clientName,
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

beforeAll(() => {
  // Radix Select scrolls the chosen option into view; jsdom has no layout.
  Element.prototype.scrollIntoView = vi.fn();
  Element.prototype.hasPointerCapture = vi.fn(() => false);
  Element.prototype.releasePointerCapture = vi.fn();
});

beforeEach(() => {
  state.rocks = [];
  state.companyMilestones = [];
  state.edit = { ready: true, milestones: [], links: [], error: null, clientName: null };
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


describe('RockEditorSheet: edit', () => {
  const saved = (over: Partial<EosRock> = {}): EosRock => ({
    id: 'r1', tenant_id: 6372, title: 'Close five enterprise deals', description: 'Why it matters', issue: null, outcome: null, status: 'at_risk',
    quarter_year: NOW_Q.year, quarter_number: NOW_Q.quarter, due_date: `${NOW_Q.year}-12-31T00:00:00.000Z`, created_at: '', updated_at: '',
    rock_level: 'individual', owner_id: 'me', parent_rock_id: null, function_id: null, client_tenant_id: null, rock_type: 'general', ...over,
  } as EosRock);

  const edit = (rock: EosRock, props: Partial<React.ComponentProps<typeof RockEditorSheet>> = {}) => {
    const onOpenChange = vi.fn();
    render(<RockEditorSheet open onOpenChange={onOpenChange} rock={rock} {...props} />);
    return { onOpenChange };
  };

  it('loads the saved Rock and its milestones, and offers Save changes rather than Create', async () => {
    state.edit.milestones = [{ id: 'm1', title: 'Draft the plan', owner_id: null, due_date: null, priority: 'high', status: 'in_progress', exit_criteria: null, evidence_url: null }];
    edit(saved());
    await waitFor(() => expect(screen.getByLabelText(/^Title/)).toHaveValue('Close five enterprise deals'));
    expect(screen.getByRole('heading', { name: 'Edit Rock' })).toBeInTheDocument();
    expect(screen.getByLabelText('Milestone 1 title')).toHaveValue('Draft the plan');
    expect(screen.getByRole('button', { name: 'Save changes' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Create and add another' })).not.toBeInTheDocument();
  });

  it('shows a loading state until the milestones arrive, and cannot save meanwhile', () => {
    state.edit.ready = false;
    edit(saved());
    expect(screen.getByRole('status')).toHaveTextContent(/Loading the Rock/);
    expect(screen.queryByLabelText(/^Title/)).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Save changes' })).toBeDisabled();
  });

  it('saves with the Rock’s id, keeps its client and type, and leaves status alone when unchanged', async () => {
    state.rocks = [rock({ id: 'co', title: 'Grow', level: 'company' })];
    const { onOpenChange } = edit(saved({ parent_rock_id: 'co', client_tenant_id: 55, rock_type: 'general' }));
    await waitFor(() => expect(screen.getByLabelText(/^Title/)).toHaveValue('Close five enterprise deals'));
    fireEvent.change(screen.getByLabelText(/^Title/), { target: { value: 'Close six enterprise deals' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));

    await waitFor(() => expect(state.mutateAsync).toHaveBeenCalledTimes(1));
    const input = state.mutateAsync.mock.calls[0][0];
    expect(input).toMatchObject({ id: 'r1', clientTenantId: 55, rockType: 'general' });
    expect(input.values).toMatchObject({ title: 'Close six enterprise deals', parentId: 'co' });
    expect(input.status).toBeUndefined();
    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
  });

  it('does not nag about a legacy Rock whose parent is in another quarter while the hierarchy is untouched', async () => {
    state.rocks = [rock({ id: 'old', title: 'Old parent', level: 'company', quarterNumber: NOW_Q.quarter === 1 ? 4 : NOW_Q.quarter - 1 })];
    edit(saved({ parent_rock_id: 'old' }));
    await waitFor(() => expect(screen.getByLabelText(/^Title/)).toHaveValue('Close five enterprise deals'));
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));
    await waitFor(() => expect(state.mutateAsync).toHaveBeenCalled());
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('locks the level for a Rock that serves another, and offers a new Rock at another level instead', async () => {
    state.rocks = [rock({ id: 'co', title: 'Grow', level: 'company' })];
    const onCopyToLevel = vi.fn();
    edit(saved({ rock_level: 'team', parent_rock_id: 'co', function_id: 'fn' }), { onCopyToLevel });
    await waitFor(() => expect(screen.getByLabelText(/^Title/)).toBeInTheDocument());
    expect(screen.getByText(/locked because it serves another Rock/)).toBeInTheDocument();
    expect(screen.queryByRole('radio', { name: /Company/ })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'New Individual Rock' }));
    expect(onCopyToLevel).toHaveBeenCalledWith('individual', expect.objectContaining({ title: 'Close five enterprise deals', level: 'team' }));
  });

  it('also locks the level, and the quarter, for a Rock that other Rocks serve', async () => {
    state.rocks = [rock({ id: 'kid', title: 'Child', level: 'individual', parentId: 'r1' })];
    edit(saved({ rock_level: 'company', owner_id: 'me' }));
    await waitFor(() => expect(screen.getByLabelText(/^Title/)).toBeInTheDocument());
    expect(screen.getByText(/locked because 1 Rock serves it/)).toBeInTheDocument();
    expect(screen.getByText(/Rocks serve this one, and they share its quarter/)).toBeInTheDocument();
  });

  it('lets a loose Rock change level', async () => {
    edit(saved({ parent_rock_id: null }));
    await waitFor(() => expect(screen.getByLabelText(/^Title/)).toBeInTheDocument());
    expect(screen.getByRole('radiogroup', { name: 'Rock level' })).toBeInTheDocument();
  });

  it('closes straight away when nothing has changed', async () => {
    const { onOpenChange } = edit(saved());
    await waitFor(() => expect(screen.getByLabelText(/^Title/)).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(screen.queryByText('Discard your changes?')).not.toBeInTheDocument();
  });

  it('asks before discarding unsaved changes, and lets the person keep editing', async () => {
    const { onOpenChange } = edit(saved());
    await waitFor(() => expect(screen.getByLabelText(/^Title/)).toBeInTheDocument());
    fireEvent.change(screen.getByLabelText(/^Title/), { target: { value: 'Changed' } });
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(screen.getByText('Discard your changes?')).toBeInTheDocument();
    expect(onOpenChange).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Keep editing' }));
    expect(screen.getByLabelText(/^Title/)).toHaveValue('Changed');
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    fireEvent.click(screen.getByRole('button', { name: 'Discard changes' }));
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it('sends a changed status, and only a changed one', async () => {
    edit(saved({ status: 'at_risk' }));
    await waitFor(() => expect(screen.getByLabelText(/^Title/)).toBeInTheDocument());
    const trigger = screen.getByRole('combobox', { name: /Status/i });
    expect(trigger).toHaveTextContent('At Risk');
    fireEvent.keyDown(trigger, { key: 'ArrowDown' });
    fireEvent.click(await screen.findByRole('option', { name: 'On Track' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Save changes' }));
    await waitFor(() => expect(state.mutateAsync).toHaveBeenCalled());
    expect(state.mutateAsync.mock.calls[0][0].status).toBe('on_track');
  });

  it('offers a client’s own Team Rock to a client Individual Rock sitting under something else', async () => {
    state.edit.clientName = 'Altaira Education';
    state.rocks = [
      rock({ id: 'co', title: 'Grow', level: 'company' }),
      rock({ id: 'ct', title: 'Client Rock - Altaira Education', level: 'team', clientTenantId: 55 }),
    ];
    edit(saved({ parent_rock_id: 'co', client_tenant_id: 55 }));
    await waitFor(() => expect(screen.getByText(/Add under the Client Rock for Altaira Education/)).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: 'Use it' }));
    expect(screen.queryByText(/Add under the Client Rock/)).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));
    await waitFor(() => expect(state.mutateAsync).toHaveBeenCalled());
    expect(state.mutateAsync.mock.calls[0][0].values.parentId).toBe('ct');
    expect(state.mutateAsync.mock.calls[0][0].clientTenantId).toBe(55);
  });

  it('does not offer a client Team Rock to a Rock with no client', async () => {
    state.rocks = [rock({ id: 'ct', title: 'Client Rock', level: 'team', clientTenantId: 55 })];
    edit(saved({ client_tenant_id: null }));
    await waitFor(() => expect(screen.getByLabelText(/^Title/)).toBeInTheDocument());
    expect(screen.queryByText(/Add under the Client Rock/)).not.toBeInTheDocument();
  });
});

describe('RockEditorSheet: edit never offers the values of a different Rock', () => {
  const saved = (id: string, title: string): EosRock => ({
    id, tenant_id: 6372, title, description: null, issue: null, outcome: null, status: 'on_track',
    quarter_year: NOW_Q.year, quarter_number: NOW_Q.quarter, due_date: `${NOW_Q.year}-12-31T00:00:00.000Z`, created_at: '', updated_at: '',
    rock_level: 'individual', owner_id: 'me', parent_rock_id: null, function_id: null, client_tenant_id: null, rock_type: 'general',
  } as EosRock);
  const props = { onOpenChange: vi.fn() };

  it('shows loading and blocks Save when another Rock is chosen while its data is still arriving', async () => {
    const a = saved('a', 'Rock A');
    const { rerender } = render(<RockEditorSheet open rock={a} {...props} />);
    await waitFor(() => expect(screen.getByLabelText(/^Title/)).toHaveValue('Rock A'));
    fireEvent.change(screen.getByLabelText(/^Title/), { target: { value: 'Rock A, edited' } });

    state.edit.ready = false;
    rerender(<RockEditorSheet open rock={saved('b', 'Rock B')} {...props} />);
    expect(screen.queryByLabelText(/^Title/)).not.toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent(/Loading the Rock/);
    expect(screen.getByRole('button', { name: 'Save changes' })).toBeDisabled();
    fireEvent.keyDown(screen.getByRole('button', { name: 'Save changes' }), { key: 'Enter', ctrlKey: true });
    expect(state.mutateAsync).not.toHaveBeenCalled();

    state.edit.ready = true;
    rerender(<RockEditorSheet open rock={saved('b', 'Rock B')} {...props} />);
    await waitFor(() => expect(screen.getByLabelText(/^Title/)).toHaveValue('Rock B'));
  });

  it('does not keep the previous opening’s values when the same Rock is reopened before its data is back', async () => {
    const a = saved('a', 'Rock A');
    const { rerender } = render(<RockEditorSheet open rock={a} {...props} />);
    await waitFor(() => expect(screen.getByLabelText(/^Title/)).toHaveValue('Rock A'));
    rerender(<RockEditorSheet open={false} rock={a} {...props} />);

    state.edit.ready = false;
    rerender(<RockEditorSheet open rock={a} {...props} />);
    expect(screen.queryByLabelText(/^Title/)).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Save changes' })).toBeDisabled();
  });
});

describe('RockEditorSheet: review fixes', () => {
  const DRAFT_KEY = 'eos-rock-draft:company:none';
  const props = { onOpenChange: vi.fn(), onCreated: vi.fn() };

  it('lets the person clear the Rock it serves, which frees the quarter to choose a parent from another one', () => {
    state.rocks = [rock({ id: 'co', title: 'Grow revenue', level: 'company' })];
    render(<RockEditorSheet open {...props} initialLevel="individual" initialParentId="co" />);
    expect(screen.getByText(/Set by the Rock it serves/)).toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: 'Quarter' })).toBeDisabled();

    fireEvent.click(screen.getByRole('button', { name: /Clear the Rock this serves/ }));
    expect(screen.queryByText(/Set by the Rock it serves/)).not.toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: 'Quarter' })).toBeEnabled();
    expect(screen.queryByRole('button', { name: /Clear the Rock this serves/ })).not.toBeInTheDocument();
  });

  it('keeps what was typed even when the sheet closes inside the save delay', () => {
    const { rerender } = render(<RockEditorSheet open {...props} />);
    fireEvent.change(screen.getByLabelText(/^Title/), { target: { value: 'Typed just before closing' } });
    expect(window.localStorage.getItem(DRAFT_KEY)).toBeNull(); // the delayed save has not fired yet

    rerender(<RockEditorSheet open={false} {...props} />);
    expect(JSON.parse(window.localStorage.getItem(DRAFT_KEY) as string).values.title).toBe('Typed just before closing');
  });

  it('does not lose a saved draft that was waiting to be restored when the sheet is closed', () => {
    const saved = JSON.stringify({
      v: 1, savedAt: Date.now() - 1000,
      values: { level: 'company', parentId: null, functionId: null, ownerId: null, title: 'Waiting draft', description: '', issue: '', outcome: '', quarterYear: NOW_Q.year, quarterNumber: NOW_Q.quarter, dueDate: '', milestones: [] },
    });
    window.localStorage.setItem(DRAFT_KEY, saved);
    const { rerender } = render(<RockEditorSheet open {...props} />);
    expect(screen.getByRole('status')).toHaveTextContent('Waiting draft');
    rerender(<RockEditorSheet open={false} {...props} />);
    expect(window.localStorage.getItem(DRAFT_KEY)).toBe(saved);
  });

  it('does not save a created Rock as a draft when the sheet then closes', async () => {
    const { rerender } = render(<RockEditorSheet open {...props} />);
    fireEvent.change(screen.getByLabelText(/^Title/), { target: { value: 'About to be created' } });
    fireEvent.change(screen.getByLabelText('Who is accountable?'), { target: { value: 'me' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create Company Rock' }));
    await waitFor(() => expect(state.mutateAsync).toHaveBeenCalled());
    await waitFor(() => expect(props.onOpenChange).toHaveBeenCalledWith(false));

    rerender(<RockEditorSheet open={false} {...props} />);
    expect(window.localStorage.getItem(DRAFT_KEY)).toBeNull();
  });
});
