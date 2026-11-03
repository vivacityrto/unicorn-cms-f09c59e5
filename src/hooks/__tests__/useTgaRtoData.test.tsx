/* @vitest-environment jsdom */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';

vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast: vi.fn() }) }));

const rpc = vi.fn();

vi.mock('@/integrations/supabase/client', () => ({
  supabase: { rpc: (...args: unknown[]) => rpc(...args) },
}));

import { useTgaRtoData } from '@/hooks/useTgaRtoData';

const linkedRtoData = {
  legal_name: 'Example Training Pty Ltd',
  trading_name: null,
  abn: null,
  status: 'Current',
  registration_start: null,
  registration_end: null,
  phone: null,
  email: null,
  website: null,
  address: null,
};

beforeEach(() => {
  rpc.mockReset();
});

describe('useTgaRtoData summary.fetched_at', () => {
  it('keeps the recorded sync time when the RPC supplies last_sync_at', async () => {
    rpc.mockResolvedValue({
      data: { linked: true, link_status: 'linked', rto_number: '12345', last_sync_at: '2026-10-01T02:03:04Z', rto_data: linkedRtoData },
      error: null,
    });

    const { result } = renderHook(() => useTgaRtoData(1, '12345', 'client-1'));
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.summary?.fetched_at).toBe('2026-10-01T02:03:04Z');
  });

  it('leaves fetched_at null, never the current time, when last_sync_at is missing', async () => {
    rpc.mockResolvedValue({
      data: { linked: true, link_status: 'linked', rto_number: '12345', rto_data: linkedRtoData },
      error: null,
    });

    const { result } = renderHook(() => useTgaRtoData(1, '12345', 'client-1'));
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.summary).not.toBeNull();
    expect(result.current.summary?.fetched_at).toBeNull();
  });
});
