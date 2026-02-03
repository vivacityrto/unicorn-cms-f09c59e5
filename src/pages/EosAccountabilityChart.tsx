import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Users, Construction, Info } from 'lucide-react';
import { DashboardLayout } from '@/components/DashboardLayout';
import { RoleInfoPanel } from '@/components/eos/RoleInfoPanel';

export default function EosAccountabilityChart() {
  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex justify-between items-start">
          <div>
            <h1 className="text-3xl font-bold flex items-center gap-3">
              <Users className="w-8 h-8 text-primary" />
              Accountability Chart
            </h1>
            <p className="text-muted-foreground mt-2">
              Define roles, responsibilities, and reporting relationships
            </p>
          </div>
          <RoleInfoPanel />
        </div>

        {/* Governance Note */}
        <Card className="bg-muted/30 border-muted">
          <CardContent className="py-4">
            <div className="flex items-start gap-3">
              <Info className="h-5 w-5 text-muted-foreground mt-0.5" />
              <div className="text-sm text-muted-foreground">
                <p className="font-medium mb-1">Governance Rules</p>
                <p>
                  Only Admin roles can modify the Accountability Chart. This ensures organisational 
                  structure changes go through proper approval channels.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Placeholder Content */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Construction className="w-5 h-5" />
              Coming Soon
            </CardTitle>
          </CardHeader>
          <CardContent className="text-center py-12">
            <Users className="w-16 h-16 text-muted-foreground mx-auto mb-4" />
            <h3 className="text-lg font-semibold mb-2">Accountability Chart</h3>
            <p className="text-muted-foreground max-w-md mx-auto">
              The Accountability Chart will visualize your organization's structure,
              showing who is accountable for each major function and how roles connect.
            </p>
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}
