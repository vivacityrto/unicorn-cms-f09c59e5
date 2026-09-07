/**
 * PortfolioHealthWidget – Unicorn 2.0 Phase 9
 *
 * Executive dashboard widget: Portfolio Health Overview.
 *
 * Containment note (Phase 2.6 Packet P3-A / H0.0, 2026-09-07): the
 * healthy/at-risk/critical breakdown this widget used to compute was driven
 * entirely by `stage_health_snapshots`, a metric documented as
 * known-defective (all 337,272 observed rows have `progress_percentage = 0`
 * regardless of actual stage state — see
 * docs/kb/reference/client-health-activity-analytics-plan-2026-09-03.md).
 * The nightly cron that populated it has been paused (Carl's explicit
 * decision, superseded by the new client-health plan), so the data will
 * only get staler from here. Rather than keep showing a
 * confidently-formatted but wrong percentage breakdown, this widget now
 * shows an explicit unavailable state and does not query the table at all.
 * Do not re-enable this without a replacement metric backed by real
 * activity data.
 */

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Activity } from 'lucide-react';

export function PortfolioHealthWidget() {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium flex items-center gap-2">
          <Activity className="h-4 w-4" />
          Portfolio Health
        </CardTitle>
      </CardHeader>
      <CardContent>
        <p className="text-xs text-muted-foreground">
          Portfolio Health is unavailable — data repair in progress. The
          underlying metric was found unreliable and is being replaced.
        </p>
      </CardContent>
    </Card>
  );
}
