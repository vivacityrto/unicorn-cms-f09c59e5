import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Users, Construction } from 'lucide-react';
import { DashboardLayout } from '@/components/DashboardLayout';

export default function EosAccountabilityChart() {
  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Header */}
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-3">
            <Users className="w-8 h-8 text-primary" />
            Accountability Chart
          </h1>
          <p className="text-muted-foreground mt-2">
            Define roles, responsibilities, and reporting relationships
          </p>
        </div>

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
