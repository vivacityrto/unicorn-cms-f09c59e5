/**
 * PortfolioHealthWidget – Unicorn 2.0 Phase 9
 *
 * The legacy stage-health source is known to be semantically invalid while
 * its replacement is being designed. Keep the executive surface visible, but
 * do not query or render the old health labels as if they were trustworthy.
 */

import { Activity } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { LegacyStageHealthUnavailable } from '@/components/client-health/LegacyStageHealthUnavailable';

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
        <LegacyStageHealthUnavailable />
      </CardContent>
    </Card>
  );
}
