import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { DashboardLayout } from '@/components/DashboardLayout';
import { PageHeader } from '@/components/ui/page-header';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { FileText, Plus, BarChart3, Users, RefreshCw } from 'lucide-react';
import { useClientImpactReports, useGenerateImpactReport } from '@/hooks/useClientImpact';
import { ImpactReportCard } from '@/components/client-impact/ImpactReportCard';
import { Skeleton } from '@/components/ui/skeleton';

export default function EosClientImpact() {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<'all' | 'published' | 'draft'>('all');
  
  const { data: reports, isLoading } = useClientImpactReports();
  const generateReport = useGenerateImpactReport();
  
  const filteredReports = reports?.filter(r => {
    if (activeTab === 'published') return r.is_published;
    if (activeTab === 'draft') return !r.is_published;
    return true;
  }) || [];
  
  const handleViewReport = (id: string) => {
    navigate(`/eos/client-impact/${id}`);
  };
  
  const handleGenerateReport = () => {
    generateReport.mutate({});
  };
  
  return (
    <DashboardLayout>
      <div className="space-y-6">
        <PageHeader
          title="Client Impact Reporting"
          description="Quarterly summaries of outcomes and improvements delivered to clients"
          icon={FileText}
          actions={
            <Button onClick={handleGenerateReport} disabled={generateReport.isPending} className="gap-2">
              {generateReport.isPending ? (
                <>
                  <RefreshCw className="h-4 w-4 animate-spin" />
                  Generating...
                </>
              ) : (
                <>
                  <Plus className="h-4 w-4" />
                  Generate Report
                </>
              )}
            </Button>
          }
        />
        
        {/* Stats Overview */}
        <div className="grid gap-4 md:grid-cols-3">
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Total Reports</CardDescription>
              <CardTitle className="text-2xl">{reports?.length || 0}</CardTitle>
            </CardHeader>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Published</CardDescription>
              <CardTitle className="text-2xl">
                {reports?.filter(r => r.is_published).length || 0}
              </CardTitle>
            </CardHeader>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Drafts</CardDescription>
              <CardTitle className="text-2xl">
                {reports?.filter(r => !r.is_published).length || 0}
              </CardTitle>
            </CardHeader>
          </Card>
        </div>
        
        {/* Reports List */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle>Impact Reports</CardTitle>
                <CardDescription>
                  View and manage quarterly impact summaries
                </CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as typeof activeTab)}>
              <TabsList className="mb-4">
                <TabsTrigger value="all">All Reports</TabsTrigger>
                <TabsTrigger value="published">Published</TabsTrigger>
                <TabsTrigger value="draft">Drafts</TabsTrigger>
              </TabsList>
              
              <TabsContent value={activeTab} className="mt-0">
                {isLoading ? (
                  <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                    {[1, 2, 3].map(i => (
                      <Skeleton key={i} className="h-48" />
                    ))}
                  </div>
                ) : filteredReports.length > 0 ? (
                  <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                    {filteredReports.map(report => (
                      <ImpactReportCard 
                        key={report.id} 
                        report={report} 
                        onView={handleViewReport}
                      />
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-12">
                    <FileText className="h-12 w-12 mx-auto text-muted-foreground/50 mb-4" />
                    <h3 className="font-medium text-lg mb-2">No Reports Found</h3>
                    <p className="text-sm text-muted-foreground mb-4">
                      {activeTab === 'all' 
                        ? 'Generate your first impact report to summarise EOS outcomes for clients.'
                        : `No ${activeTab} reports yet.`
                      }
                    </p>
                    {activeTab === 'all' && (
                      <Button onClick={handleGenerateReport} disabled={generateReport.isPending}>
                        <Plus className="h-4 w-4 mr-2" />
                        Generate Report
                      </Button>
                    )}
                  </div>
                )}
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}
