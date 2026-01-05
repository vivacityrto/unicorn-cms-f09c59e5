import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/useAuth';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { 
  CheckCircle2, 
  Circle, 
  AlertCircle, 
  Clock, 
  Ban,
  Loader2 
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface StageState {
  id: number;
  stage_id: number;
  stage_title: string;
  short_name: string | null;
  stage_type: string | null;
  dashboard_group: string | null;
  status: string;
  is_required: boolean;
  sort_order: number;
  started_at: string | null;
  completed_at: string | null;
  blocked_at: string | null;
  blocked_reason: string | null;
}

interface PackageStagesManagerProps {
  tenantId: number;
  packageId: number;
  packageName: string;
}

const STATUS_OPTIONS = [
  { value: 'not_started', label: 'Not Started', icon: Circle, color: 'text-muted-foreground' },
  { value: 'in_progress', label: 'In Progress', icon: Clock, color: 'text-blue-600' },
  { value: 'blocked', label: 'Blocked', icon: AlertCircle, color: 'text-red-600' },
  { value: 'complete', label: 'Complete', icon: CheckCircle2, color: 'text-green-600' },
  { value: 'not_applicable', label: 'N/A', icon: Ban, color: 'text-muted-foreground' },
];

const GROUP_LABELS: Record<string, string> = {
  ONBOARDING: 'Onboarding',
  ONGOING_ACCESS: 'Ongoing Access',
  USAGE_SUPPORT: 'Usage & Support',
  ANNUAL_OBLIGATIONS: 'Annual Obligations',
  setup: 'Onboarding',
  entitlement: 'Ongoing Access',
  recurring: 'Usage & Support',
  review: 'Annual Obligations',
  delivery: 'Delivery',
  submission: 'Submission',
};

export function PackageStagesManager({ tenantId, packageId, packageName }: PackageStagesManagerProps) {
  const { toast } = useToast();
  const { profile } = useAuth();
  const [stages, setStages] = useState<StageState[]>([]);
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState<number | null>(null);

  useEffect(() => {
    fetchStages();
  }, [tenantId, packageId]);

  const fetchStages = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('client_package_stage_state')
        .select(`
          id,
          stage_id,
          status,
          is_required,
          sort_order,
          started_at,
          completed_at,
          blocked_at,
          blocked_reason,
          documents_stages!inner (
            title,
            short_name,
            stage_type
          )
        `)
        .eq('tenant_id', tenantId)
        .eq('package_id', packageId)
        .order('sort_order');

      if (error) throw error;

      // Transform the data
      const transformed = (data || []).map((row: any) => ({
        id: row.id,
        stage_id: row.stage_id,
        stage_title: row.documents_stages?.title || 'Unknown Stage',
        short_name: row.documents_stages?.short_name,
        stage_type: row.documents_stages?.stage_type,
        dashboard_group: null, // Will be populated from package_stages if available
        status: row.status,
        is_required: row.is_required,
        sort_order: row.sort_order,
        started_at: row.started_at,
        completed_at: row.completed_at,
        blocked_at: row.blocked_at,
        blocked_reason: row.blocked_reason,
      }));

      setStages(transformed);
    } catch (error: any) {
      console.error('Error fetching stages:', error);
      toast({ title: 'Error', description: 'Failed to load stages', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  const updateStageStatus = async (stageStateId: number, newStatus: string) => {
    setUpdating(stageStateId);
    
    try {
      const oldStage = stages.find(s => s.id === stageStateId);
      const oldStatus = oldStage?.status;

      // Build update object
      const updateData: any = {
        status: newStatus,
        updated_at: new Date().toISOString(),
        updated_by: profile?.user_uuid,
      };

      // Set timestamps based on status
      if (newStatus === 'in_progress' && oldStatus === 'not_started') {
        updateData.started_at = new Date().toISOString();
      }
      if (newStatus === 'complete') {
        updateData.completed_at = new Date().toISOString();
      }
      if (newStatus === 'blocked') {
        updateData.blocked_at = new Date().toISOString();
      }

      const { error } = await supabase
        .from('client_package_stage_state')
        .update(updateData)
        .eq('id', stageStateId);

      if (error) throw error;

      // Log to audit
      await supabase.from('client_audit_log').insert({
        tenant_id: tenantId,
        actor_user_id: profile?.user_uuid,
        action: 'stage_status_changed',
        entity_type: 'client_package_stage_state',
        entity_id: stageStateId.toString(),
        before_data: { status: oldStatus },
        after_data: { status: newStatus },
        details: { package_id: packageId, stage_id: oldStage?.stage_id }
      });

      toast({ title: 'Stage Updated', description: `Status changed to ${newStatus}` });
      fetchStages();
    } catch (error: any) {
      console.error('Error updating stage:', error);
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    } finally {
      setUpdating(null);
    }
  };

  // Group stages by dashboard_group or stage_type
  const groupedStages = stages.reduce((acc, stage) => {
    const group = stage.dashboard_group || stage.stage_type || 'Other';
    if (!acc[group]) acc[group] = [];
    acc[group].push(stage);
    return acc;
  }, {} as Record<string, StageState[]>);

  if (loading) {
    return (
      <div className="space-y-3">
        {[1, 2, 3].map(i => (
          <Skeleton key={i} className="h-12 w-full" />
        ))}
      </div>
    );
  }

  if (stages.length === 0) {
    return (
      <div className="text-center py-6 text-muted-foreground">
        <p>No stages configured for this package.</p>
        <p className="text-sm mt-1">Stage tracking will be available once stages are assigned.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {Object.entries(groupedStages).map(([group, groupStages]) => (
        <div key={group} className="space-y-2">
          <h4 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
            {GROUP_LABELS[group] || group}
          </h4>
          <div className="space-y-2">
            {groupStages.map((stage) => {
              const statusOption = STATUS_OPTIONS.find(s => s.value === stage.status) || STATUS_OPTIONS[0];
              const StatusIcon = statusOption.icon;

              return (
                <div 
                  key={stage.id} 
                  className={cn(
                    "flex items-center justify-between gap-4 p-3 rounded-lg border bg-card",
                    stage.status === 'blocked' && "border-red-200 bg-red-50/50",
                    stage.status === 'complete' && "border-green-200 bg-green-50/50"
                  )}
                >
                  <div className="flex items-center gap-3 flex-1 min-w-0">
                    <StatusIcon className={cn("h-5 w-5 shrink-0", statusOption.color)} />
                    <div className="min-w-0">
                      <p className="font-medium truncate">{stage.stage_title}</p>
                      {stage.short_name && (
                        <p className="text-xs text-muted-foreground">{stage.short_name}</p>
                      )}
                    </div>
                  </div>
                  
                  <div className="flex items-center gap-3 shrink-0">
                    {!stage.is_required && (
                      <Badge variant="outline" className="text-xs">Optional</Badge>
                    )}
                    
                    <Select
                      value={stage.status}
                      onValueChange={(value) => updateStageStatus(stage.id, value)}
                      disabled={updating === stage.id}
                    >
                      <SelectTrigger className="w-[140px]">
                        {updating === stage.id ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <SelectValue />
                        )}
                      </SelectTrigger>
                      <SelectContent>
                        {STATUS_OPTIONS.map((option) => (
                          <SelectItem key={option.value} value={option.value}>
                            <div className="flex items-center gap-2">
                              <option.icon className={cn("h-4 w-4", option.color)} />
                              {option.label}
                            </div>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
