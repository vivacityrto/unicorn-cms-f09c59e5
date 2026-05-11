import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

// Mock all option hooks to avoid network/Supabase calls
vi.mock('@/hooks/useEos', () => ({
  useEosRocks: () => ({ rocks: [] }),
}));

vi.mock('@/hooks/useEosOptions', () => ({
  useEosStatusOptions: () => ({ data: [] }),
  useEosCategoryOptions: () => ({ data: [] }),
  useEosImpactOptions: () => ({ data: [] }),
  useEosTypeOptions: () => ({ data: ['risk', 'opportunity'] }),
  useEosQuarterOptions: () => ({ data: [] }),
  useEosYearOptions: () => ({ data: [] }),
  useEosStatusTransitions: () => ({ data: undefined }),
  getAllowedStatusTransitions: () => [],
}));

import { RiskOpportunityForm } from '@/components/eos/RiskOpportunityForm';

describe('RiskOpportunityForm — input retention under parent re-renders', () => {
  it('keeps typed Title value when parent re-renders with a new initialValues object reference', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    const onCancel = vi.fn();

    const { rerender } = render(
      <RiskOpportunityForm
        initialValues={{ title: '' }}
        onSubmit={onSubmit}
        onCancel={onCancel}
      />,
    );

    const titleInput = screen.getByPlaceholderText(/short, specific statement/i) as HTMLInputElement;
    await user.type(titleInput, 'Hello');
    expect(titleInput.value).toBe('Hello');

    // Simulate parent re-render passing a NEW object reference with same content
    // (this is what CreateIssueDialog does via inline object literal, and what
    // presence-driven re-renders in LiveMeetingView trigger every 5–30s).
    rerender(
      <RiskOpportunityForm
        initialValues={{ title: '' }}
        onSubmit={onSubmit}
        onCancel={onCancel}
      />,
    );

    expect(titleInput.value).toBe('Hello');
  });
});
