import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const read = (p: string) => readFileSync(p, 'utf8');

/**
 * The staff header is pinned. A bar further down the page that also pins itself to the very top (top-0) ends up behind
 * it or fighting it for the same spot. Page-level bars must pin below the header using --topbar-h, which the header sets.
 */
describe('sticky bars sit under the pinned staff header', () => {
  it('the staff header publishes its current height', () => {
    expect(read('src/components/layout/TopBar.tsx')).toMatch(/setProperty\(\s*"--topbar-h"/);
  });

  it.each([
    'src/components/client/TenantTimeTrackerBar.tsx',
    'src/components/portfolio/PortfolioFilterBar.tsx',
    'src/pages/MembershipDashboard.tsx',
  ])('%s pins below the header, not at the top', (file) => {
    const src = read(file);
    expect(src).toContain('sticky top-[var(--topbar-h,0px)]');
    expect(src).not.toMatch(/sticky top-0 z-20/);
  });
});
