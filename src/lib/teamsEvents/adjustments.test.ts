import { describe, expect, it } from 'vitest';
import {
  addExtra,
  adjustmentsSummary,
  extraFromDirectory,
  noAdjustments,
  removeExtra,
  skipMember,
  toRequestKeys,
  unskipMember,
} from './adjustments';

const ben = { key: 'contact:2', name: 'Ben Carter', email: 'ben@beta.com', clientName: 'Beta College' };

describe('event adjustments', () => {
  it('adds an extra once and removes it by key', () => {
    const once = addExtra(noAdjustments, ben);
    expect(once.extras).toEqual([ben]);
    expect(addExtra(once, ben)).toBe(once);
    expect(removeExtra(once, 'contact:2').extras).toEqual([]);
    expect(removeExtra(once, 'contact:99')).toEqual(once);
  });

  it('skips a Group member once and can undo it', () => {
    const skipped = skipMember(noAdjustments, 'user:1');
    expect(skipped.skippedKeys).toEqual(['user:1']);
    expect(skipMember(skipped, 'user:1')).toBe(skipped);
    expect(unskipMember(skipped, 'user:1').skippedKeys).toEqual([]);
  });

  it('never mutates the adjustments it was given', () => {
    const before = { extras: [ben], skippedKeys: ['user:1'] };
    const snapshot = JSON.stringify(before);
    removeExtra(before, 'contact:2');
    unskipMember(before, 'user:1');
    addExtra(before, { ...ben, key: 'contact:3' });
    skipMember(before, 'user:9');
    expect(JSON.stringify(before)).toBe(snapshot);
  });

  it('turns adjustments into the keys the server expects', () => {
    const adjusted = skipMember(addExtra(noAdjustments, ben), 'user:1');
    expect(toRequestKeys(adjusted)).toEqual({ extraKeys: ['contact:2'], skippedKeys: ['user:1'] });
    expect(toRequestKeys(noAdjustments)).toEqual({ extraKeys: [], skippedKeys: [] });
  });

  it('describes a directory person as an extra', () => {
    expect(
      extraFromDirectory({
        row_key: 'user:5',
        source: 'user',
        tenant_id: 1,
        tenant_name: 'Acme RTO',
        first_name: 'Amanda',
        last_name: null,
        email: 'amanda@example.com',
        position_type: null,
        status: 'active',
      }),
    ).toEqual({ key: 'user:5', name: 'Amanda', email: 'amanda@example.com', clientName: 'Acme RTO' });
  });

  it('summarises the counts for the confirmation line', () => {
    expect(adjustmentsSummary({ extras: 2, skipped: 1 })).toBe('2 added for this event · 1 skipped for this event');
    expect(adjustmentsSummary({ extras: 0, skipped: 3 })).toBe('3 skipped for this event');
    expect(adjustmentsSummary({ extras: 0, skipped: 0 })).toBeNull();
    expect(adjustmentsSummary(undefined)).toBeNull();
  });
});
