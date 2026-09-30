/* @vitest-environment jsdom */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// What the mocked eos_issues update chain resolves with, and the filter calls it received.
let updateResult: { data: { id: string }[] | null; error: { message: string } | null };
const calls: { update?: unknown; eq: [string, unknown][]; is: [string, unknown][] } = { eq: [], is: [] };
const rpcSpy = vi.fn();

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: () => {
      const chain: Record<string, unknown> = {};
      chain.update = (payload: unknown) => {
        calls.update = payload;
        return chain;
      };
      chain.eq = (col: string, val: unknown) => {
        calls.eq.push([col, val]);
        return chain;
      };
      chain.is = (col: string, val: unknown) => {
        calls.is.push([col, val]);
        return chain;
      };
      chain.select = async () => updateResult;
      return chain;
    },
    rpc: (...args: unknown[]) => {
      rpcSpy(...args);
      return Promise.resolve({ error: null });
    },
  },
}));

import {
  IssueEditConflictError,
  createIssueTodos,
  mergeConflictingText,
  saveIssueTextField,
  shouldAdoptRemoteText,
} from '@/lib/eosIssueEdit';

beforeEach(() => {
  calls.update = undefined;
  calls.eq = [];
  calls.is = [];
  rpcSpy.mockClear();
  updateResult = { data: [{ id: 'issue-1' }], error: null };
});

describe('saveIssueTextField (compare-and-swap on the field)', () => {
  it('saves only if the field still holds the value the editor started from', async () => {
    await saveIssueTextField('issue-1', 'outcome_note', 'new text', 'old text');
    expect(calls.update).toEqual({ outcome_note: 'new text' });
    expect(calls.eq).toEqual([
      ['id', 'issue-1'],
      ['outcome_note', 'old text'],
    ]);
  });

  it('matches a NULL column with IS NULL, not = null', async () => {
    await saveIssueTextField('issue-1', 'solution', 'first solution', null);
    expect(calls.is).toEqual([['solution', null]]);
    expect(calls.eq).toEqual([['id', 'issue-1']]);
  });

  it('throws a conflict error when nobody matched (someone else edited first)', async () => {
    updateResult = { data: [], error: null };
    await expect(saveIssueTextField('issue-1', 'outcome_note', 'x', 'stale')).rejects.toBeInstanceOf(
      IssueEditConflictError
    );
  });

  it('rethrows real database errors unchanged', async () => {
    updateResult = { data: null, error: { message: 'boom' } };
    await expect(saveIssueTextField('issue-1', 'outcome_note', 'x', 'y')).rejects.toMatchObject({
      message: 'boom',
    });
  });
});

describe('mergeConflictingText', () => {
  it('keeps both versions when they differ', () => {
    expect(mergeConflictingText('their notes', 'my notes')).toBe('their notes\n\nmy notes');
  });

  it('does not duplicate when the saved text already contains what was typed', () => {
    expect(mergeConflictingText('agreed: ship it on Friday', 'ship it')).toBe('agreed: ship it on Friday');
  });

  it('keeps the typed text when it already extends the saved text', () => {
    expect(mergeConflictingText('ship it', 'ship it on Friday')).toBe('ship it on Friday');
  });

  it('handles an empty side without adding blank lines', () => {
    expect(mergeConflictingText('', 'mine')).toBe('mine');
    expect(mergeConflictingText('theirs', '')).toBe('theirs');
  });
});

describe('shouldAdoptRemoteText', () => {
  it('adopts a remote change when the user has no unsaved edits', () => {
    expect(shouldAdoptRemoteText('saved', 'saved', 'someone typed this')).toBe(true);
  });

  it('never overwrites text the user is in the middle of typing', () => {
    expect(shouldAdoptRemoteText('half typed', 'saved', 'someone typed this')).toBe(false);
  });

  it('does nothing when the saved value has not moved', () => {
    expect(shouldAdoptRemoteText('saved', 'saved', 'saved')).toBe(false);
  });
});

describe('createIssueTodos', () => {
  it('creates the to-do right away, linked to the meeting, via the existing RPC', async () => {
    const todo = { title: 'Send checklist', owner_id: 'u-1', due_date: '2026-10-05' };
    await createIssueTodos('issue-1', 'meeting-9', [todo]);
    expect(rpcSpy).toHaveBeenCalledWith('create_todos_from_issue', {
      p_issue_id: 'issue-1',
      p_todos: [todo],
      p_meeting_id: 'meeting-9',
    });
  });

  it('does nothing for an empty list', async () => {
    await createIssueTodos('issue-1', 'meeting-9', []);
    expect(rpcSpy).not.toHaveBeenCalled();
  });
});
