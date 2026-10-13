import { describe, expect, it } from 'vitest';
import { clientStatusLabel, clientStatusOptions, matchesClientStatus } from './clientStatus';

describe('clientStatusLabel', () => {
  it('prefers the configured description, then a tidied value', () => {
    expect(clientStatusLabel('cancelled', [{ value: 'cancelled', description: 'Cancelled' }])).toBe('Cancelled');
    expect(clientStatusLabel('on_hold')).toBe('On hold');
    expect(clientStatusLabel('In Arears')).toBe('In Arears');
    expect(clientStatusLabel(null)).toBe('Unknown');
  });
});

describe('clientStatusOptions', () => {
  it('lists only statuses present, Active first even when no row is active, then A-Z', () => {
    const options = clientStatusOptions(
      [{ tenant_status: 'cancelled' }, { tenant_status: 'inactive' }, { tenant_status: 'cancelled' }, { tenant_status: null }],
    );
    expect(options.map((o) => o.value)).toEqual(['active', 'cancelled', 'inactive']);
  });
});

describe('matchesClientStatus', () => {
  it('matches the chosen status, and everything for "all"', () => {
    expect(matchesClientStatus('active', 'active')).toBe(true);
    expect(matchesClientStatus('cancelled', 'active')).toBe(false);
    expect(matchesClientStatus(null, 'active')).toBe(false);
    expect(matchesClientStatus('cancelled', 'all')).toBe(true);
  });
});
