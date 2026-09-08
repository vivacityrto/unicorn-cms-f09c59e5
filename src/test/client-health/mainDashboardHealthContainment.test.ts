import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const mainDashboard = readFileSync(
  join(process.cwd(), 'src/pages/MainDashboard.tsx'),
  'utf8',
);

describe('MainDashboard legacy health containment', () => {
  it('does not query the retired stage-health contracts', () => {
    expect(mainDashboard).not.toContain('v_dashboard_attention_ranked');
    expect(mainDashboard).not.toContain('rpc_portfolio_client_health');
  });

  it('keeps the client-health panel explicitly unavailable', () => {
    expect(mainDashboard).toContain('<LegacyStageHealthUnavailable />');
    expect(mainDashboard).toContain('Unavailable');
  });
});
