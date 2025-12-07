import { useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { DashboardLayout } from '@/components/DashboardLayout';
import { useAuditDetails, useAudits } from '@/hooks/useAudits';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ArrowLeft } from 'lucide-react';
import { ActionCreateForm } from '@/components/audit/ActionCreateForm';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export default function AuditActions() {
  const { id } = useParams<{ id: string }>();
  const auditId = id ? parseInt(id) : undefined;
  const { auditReport, isLoading } = useAuditDetails(auditId);
  const { profile } = useAuth();

  const { data: tenantUsers } = useQuery({
    queryKey: ['tenant-users', profile?.tenant_id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('users')
        .select('user_uuid, first_name, last_name, email')
        .eq('tenant_id', profile!.tenant_id!)
        .order('first_name');
      
      if (error) throw error;
      return data;
    },
    enabled: !!profile?.tenant_id,
  });

  if (isLoading) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center h-96">
          <p className="text-muted-foreground">Loading actions...</p>
        </div>
      </DashboardLayout>
    );
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'done':
        return 'default';
      case 'in_progress':
        return 'secondary';
      default:
        return 'outline';
    }
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link to={`/audits/${auditId}/findings`}>
              <Button variant="ghost" size="sm">
                <ArrowLeft className="h-4 w-4 mr-2" />
                Back to Findings
              </Button>
            </Link>
            <div>
              <h1 className="text-2xl font-bold">Audit Actions</h1>
              <p className="text-sm text-muted-foreground">
                {auditReport?.audit.audit_title}
              </p>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-6">
          <div className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Create New Action</CardTitle>
              </CardHeader>
              <CardContent>
                <ActionCreateForm
                  findings={auditReport?.findings || []}
                  tenantUsers={tenantUsers || []}
                />
              </CardContent>
            </Card>
          </div>

          <div className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Existing Actions</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {auditReport?.actions && auditReport.actions.length > 0 ? (
                    auditReport.actions.map((action: any) => (
                      <Card key={action.action_id}>
                        <CardContent className="p-4">
                          <div className="space-y-2">
                            <div className="flex items-start justify-between">
                              <p className="font-medium">{action.description}</p>
                              <Badge variant={getStatusColor(action.status)}>
                                {action.status.replace('_', ' ')}
                              </Badge>
                            </div>
                            <div className="text-sm text-muted-foreground">
                              <p>Due: {new Date(action.due_date).toLocaleDateString()}</p>
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    ))
                  ) : (
                    <p className="text-sm text-muted-foreground text-center py-8">
                      No actions created yet
                    </p>
                  )}
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}
