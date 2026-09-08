import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import {
  LEGACY_STAGE_HEALTH_MESSAGE,
  LegacyStageHealthUnavailable,
} from '@/components/client-health/LegacyStageHealthUnavailable';

describe('LegacyStageHealthUnavailable', () => {
  it('communicates that legacy stage health is unavailable during repair', () => {
    render(<LegacyStageHealthUnavailable />);

    expect(screen.getByRole('status', { name: LEGACY_STAGE_HEALTH_MESSAGE })).toHaveTextContent(
      LEGACY_STAGE_HEALTH_MESSAGE,
    );
  });

  it('supports a compact read-only indicator for tables and drawers', () => {
    render(<LegacyStageHealthUnavailable compact />);

    expect(screen.getByRole('status')).toHaveTextContent(LEGACY_STAGE_HEALTH_MESSAGE);
  });
});
