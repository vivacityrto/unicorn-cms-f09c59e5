import { useState } from 'react';
import { DashboardLayout } from '@/components/DashboardLayout';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Plus, Users, Calendar, CheckCircle, Clock } from 'lucide-react';
import { useQuarterlyConversations } from '@/hooks/useQuarterlyConversations';
import { useAuth } from '@/hooks/useAuth';
import { useRBAC } from '@/hooks/useRBAC';
import { useNavigate } from 'react-router-dom';
import { QCScheduler } from '@/components/eos/qc/QCScheduler';
import { PermissionTooltip } from '@/components/eos/PermissionTooltip';
import { format } from 'date-fns';
import type { QCStatus } from '@/types/qc';

export default function EosQC() {
  return (
    <DashboardLayout>
      <QCContent />
    </DashboardLayout>
  );
}

const QCContent = () => {
  const { conversations, isLoading } = useQuarterlyConversations();
  const { profile } = useAuth();
  const { canScheduleQC, canViewAllQC } = useRBAC();
  const navigate = useNavigate();
  const [schedulerOpen, setSchedulerOpen] = useState(false);
  // Default to 'my-reviews' for General Users (who can't see 'all')
  const [activeTab, setActiveTab] = useState<string>(canViewAllQC() ? 'all' : 'my-reviews');

  const getStatusBadge = (status: QCStatus) => {
    const statusConfig = {
      scheduled: { label: 'Scheduled', variant: 'secondary' as const },
      in_progress: { label: 'In Progress', variant: 'default' as const },
      completed: { label: 'Completed', variant: 'outline' as const },
      cancelled: { label: 'Cancelled', variant: 'destructive' as const },
    };
    const config = statusConfig[status];
    return <Badge variant={config.variant}>{config.label}</Badge>;
  };

  // Filter conversations based on user role
  // SuperAdmin (canViewAllQC) sees all; General User sees only their own
  const filteredConversations = conversations?.filter((qc) => {
    // First filter by role-based access
    if (!canViewAllQC()) {
      // General User can only see QCs where they are reviewee or manager
      const isReviewee = qc.reviewee_id === profile?.user_uuid;
      const isManager = qc.manager_ids.includes(profile?.user_uuid || '');
      if (!isReviewee && !isManager) return false;
    }

    // Then apply tab filter
    if (activeTab === 'all') return true;
    if (activeTab === 'my-reviews') return qc.reviewee_id === profile?.user_uuid;
    if (activeTab === 'managing') return qc.manager_ids.includes(profile?.user_uuid || '');
    return true;
  });

  if (isLoading) {
    return <div className="p-8">Loading conversations...</div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-start">
        <div>
          <h1 className="text-3xl font-bold">Quarterly Conversations</h1>
          <p className="text-muted-foreground mt-2">
            One-on-one strategic alignment sessions between managers and team members
          </p>
        </div>
        <PermissionTooltip permission="qc:schedule" action="schedule Quarterly Conversations">
          <Button 
            onClick={() => setSchedulerOpen(true)}
            disabled={!canScheduleQC()}
          >
            <Plus className="h-4 w-4 mr-2" />
            Schedule QC
          </Button>
        </PermissionTooltip>
      </div>

      <QCScheduler 
        open={schedulerOpen}
        onOpenChange={setSchedulerOpen}
        onScheduled={() => setSchedulerOpen(false)}
      />

      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total QCs</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{conversations?.length || 0}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Scheduled</CardTitle>
            <Calendar className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {conversations?.filter(c => c.status === 'scheduled').length || 0}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Completed</CardTitle>
            <CheckCircle className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {conversations?.filter(c => c.status === 'completed').length || 0}
            </div>
          </CardContent>
        </Card>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          {canViewAllQC() && <TabsTrigger value="all">All Conversations</TabsTrigger>}
          <TabsTrigger value="my-reviews">My Reviews</TabsTrigger>
          <TabsTrigger value="managing">Managing</TabsTrigger>
        </TabsList>

        <TabsContent value={activeTab} className="mt-6 space-y-4">
          {filteredConversations && filteredConversations.length > 0 ? (
            filteredConversations.map((qc) => (
              <Card key={qc.id} className="hover:shadow-md transition-shadow">
                <CardHeader>
                  <div className="flex justify-between items-start">
                    <div className="space-y-1">
                      <CardTitle className="flex items-center gap-2">
                        Quarter: {format(new Date(qc.quarter_start), 'MMM yyyy')}
                        {getStatusBadge(qc.status)}
                      </CardTitle>
                      <CardDescription>
                        {qc.scheduled_at && (
                          <span className="flex items-center gap-1">
                            <Clock className="h-3 w-3" />
                            Scheduled: {format(new Date(qc.scheduled_at), 'PPP')}
                          </span>
                        )}
                      </CardDescription>
                    </div>
                    <Button
                      onClick={() => navigate(`/eos/qc/${qc.id}`)}
                      variant={qc.status === 'completed' ? 'outline' : 'default'}
                    >
                      {qc.status === 'completed' ? 'View Summary' : 'Continue'}
                    </Button>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="text-sm text-muted-foreground space-y-1">
                    <div>Reviewee: {qc.reviewee_id}</div>
                    <div>Managers: {qc.manager_ids.length} assigned</div>
                    {qc.completed_at && (
                      <div>Completed: {format(new Date(qc.completed_at), 'PPP')}</div>
                    )}
                  </div>
                </CardContent>
              </Card>
            ))
          ) : (
            <Card>
              <CardContent className="pt-6 text-center py-12">
                <Users className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                <p className="text-lg font-medium mb-2">No conversations yet</p>
                <p className="text-sm text-muted-foreground mb-4">
                  {canScheduleQC() 
                    ? "Schedule your first Quarterly Conversation to get started"
                    : "No Quarterly Conversations have been scheduled for you yet."}
                </p>
                <PermissionTooltip permission="qc:schedule" action="schedule Quarterly Conversations">
                  <Button 
                    onClick={() => setSchedulerOpen(true)}
                    disabled={!canScheduleQC()}
                  >
                    <Plus className="h-4 w-4 mr-2" />
                    Schedule First QC
                  </Button>
                </PermissionTooltip>
              </CardContent>
            </Card>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
};
