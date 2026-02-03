import { useParams, useNavigate } from 'react-router-dom';
import { DashboardLayout } from '@/components/DashboardLayout';
import { PageHeader } from '@/components/ui/page-header';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { ArrowLeft, FileText } from 'lucide-react';
import { useClientImpactReport, usePublishImpactReport } from '@/hooks/useClientImpact';
import { ImpactReportView } from '@/components/client-impact/ImpactReportView';
import { useRBAC } from '@/hooks/useRBAC';

export default function EosClientImpactDetail() {
  const { reportId } = useParams<{ reportId: string }>();
  const navigate = useNavigate();
  const { isVivacityTeam } = useRBAC();
  
  const { data, isLoading } = useClientImpactReport(reportId || '');
  const publishReport = usePublishImpactReport();
  
  const handlePublish = () => {
    if (reportId) {
      publishReport.mutate(reportId);
    }
  };
  
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
  
  if (!data) {
    return (
      <DashboardLayout>
        <div className="text-center py-12">
          <FileText className="h-12 w-12 mx-auto text-muted-foreground/50 mb-4" />
          <h3 className="font-medium text-lg mb-2">Report Not Found</h3>
          <p className="text-sm text-muted-foreground mb-4">
            This impact report could not be found.
          </p>
          <Button onClick={() => navigate('/eos/client-impact')}>
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to Reports
          </Button>
        </div>
      </DashboardLayout>
    );
  }
  
  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex items-center gap-4">
          <Button 
            variant="ghost" 
            size="sm"
            onClick={() => navigate('/eos/client-impact')}
            className="gap-2"
          >
            <ArrowLeft className="h-4 w-4" />
            Back
          </Button>
        </div>
        
        <ImpactReportView
          report={data.report}
          items={data.items}
          onPublish={handlePublish}
          isPublishing={publishReport.isPending}
          isVivacityUser={isVivacityTeam}
        />
      </div>
    </DashboardLayout>
  );
}
