import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Info } from 'lucide-react';
import { DashboardLayout } from '@/components/DashboardLayout';
import { PageHeader } from '@/components/ui/page-header';
import { RoleInfoPanel } from '@/components/eos/RoleInfoPanel';
import { ChartBuilder } from '@/components/eos/accountability';

export default function EosAccountabilityChart() {
  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex justify-between items-start">
          <PageHeader
            title="Accountability Chart"
            description="Define functions, seats, and accountabilities for your organization"
          />
          <RoleInfoPanel />
        </div>

        {/* Governance Note */}
        <Card className="bg-muted/30 border-muted">
          <CardContent className="py-4">
            <div className="flex items-start gap-3">
              <Info className="h-5 w-5 text-muted-foreground mt-0.5" />
              <div className="text-sm text-muted-foreground">
                <p className="font-medium mb-1">EOS Accountability Chart</p>
                <p>
                  This is not an org chart. It defines <strong>functions</strong> (areas of the business), 
                  <strong> seats</strong> (roles within functions), and <strong>accountabilities</strong> (what 
                  each seat is responsible for). A person can sit in multiple seats, but each seat has exactly 
                  one primary owner.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Chart Builder */}
        <ChartBuilder />
      </div>
    </DashboardLayout>
  );
}
