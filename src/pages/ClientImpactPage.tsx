import { useParams } from 'react-router-dom';
import { DashboardLayout } from '@/components/DashboardLayout';
import { PageHeader } from '@/components/ui/page-header';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { FileText, TrendingUp } from 'lucide-react';
import { useClientImpactReports } from '@/hooks/useClientImpact';
import { ImpactReportView } from '@/components/client-impact/ImpactReportView';
import { useClientImpactReport } from '@/hooks/useClientImpact';

// Client-facing impact page - shows published reports only
export default function ClientImpactPage() {
  const { clientId } = useParams<{ clientId: string }>();
  
  const { data: reports, isLoading: reportsLoading } = useClientImpactReports(clientId);
  
  // Filter to published reports only for clients
  const publishedReports = reports?.filter(r => r.is_published) || [];
  const latestReport = publishedReports[0];
  
  const { data: reportData, isLoading: reportLoading } = useClientImpactReport(latestReport?.id || '');
  
  const isLoading = reportsLoading || (latestReport && reportLoading);
  
  if (isLoading) {
    return (
      <DashboardLayout>
        <div className="space-y-6">
          <Skeleton className="h-12 w-64" />
          <Skeleton className="h-48" />
          <Skeleton className="h-32" />
        </div>
      </DashboardLayout>
    );
  }
  
  if (!latestReport || !reportData) {
    return (
      <DashboardLayout>
        <div className="space-y-6">
          <PageHeader
            title="Impact & Outcomes"
            description="Quarterly summaries of improvements and outcomes delivered"
            icon={TrendingUp}
          />
          
          <Card>
            <CardContent className="py-12 text-center">
              <FileText className="h-12 w-12 mx-auto text-muted-foreground/50 mb-4" />
              <h3 className="font-medium text-lg mb-2">No Reports Available</h3>
              <p className="text-sm text-muted-foreground">
                Impact reports will appear here once they are published by our team.
              </p>
            </CardContent>
          </Card>
        </div>
      </DashboardLayout>
    );
  }
  
  return (
    <DashboardLayout>
      <div className="space-y-6">
        <PageHeader
          title="Impact & Outcomes"
          description="Quarterly summaries of improvements and outcomes delivered"
          icon={TrendingUp}
        />
        
        {/* Show past reports summary if more than one */}
        {publishedReports.length > 1 && (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Previous Reports</CardTitle>
              <CardDescription>
                {publishedReports.length - 1} previous report{publishedReports.length > 2 ? 's' : ''} available
              </CardDescription>
            </CardHeader>
          </Card>
        )}
        
        <ImpactReportView
          report={reportData.report}
          items={reportData.items}
          isVivacityUser={false}
        />
      </div>
    </DashboardLayout>
  );
}
