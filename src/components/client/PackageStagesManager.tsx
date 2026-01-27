import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/useAuth';
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

interface StageInstance {
  id: number;
  stage_id: number;
  stage_name: string;
  shortname: string | null;
  status: number; // Legacy status: 0=not_started, 1=in_progress, 2=blocked, 3=complete
  completion_date: string | null;
  paid: boolean;
  released_client_tasks: boolean;
}

interface PackageStagesManagerProps {
  tenantId: number;
  packageId: number;
  packageName: string;
}

// Legacy status mapping (unicorn1 uses integers)
const STATUS_MAP: Record<number, string> = {
  0: 'not_started',
  1: 'in_progress',
  2: 'blocked',
  3: 'complete',
};

const STATUS_OPTIONS = [
  { value: 0, label: 'Not Started', icon: Circle, color: 'text-muted-foreground' },
  { value: 1, label: 'In Progress', icon: Clock, color: 'text-blue-600' },
  { value: 2, label: 'Blocked', icon: AlertCircle, color: 'text-red-600' },
  { value: 3, label: 'Complete', icon: CheckCircle2, color: 'text-green-600' },
];

export function PackageStagesManager({ tenantId, packageId, packageName }: PackageStagesManagerProps) {
  const { toast } = useToast();
  const { profile } = useAuth();
  const [stages, setStages] = useState<StageInstance[]>([]);
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState<number | null>(null);
  const [packageInstanceId, setPackageInstanceId] = useState<number | null>(null);

  useEffect(() => {
    fetchStages();
  }, [tenantId, packageId]);

  const fetchStages = async () => {
    setLoading(true);
    try {
      // First, find the package_instance for this tenant + package
      const { data: instanceData, error: instanceError } = await supabase
        .from('package_instances')
        .select('id')
        .eq('tenant_id', tenantId)
        .eq('package_id', packageId)
        .eq('is_complete', false)
        .limit(1)
        .maybeSingle();

      if (instanceError) throw instanceError;

      if (!instanceData) {
        setStages([]);
        setLoading(false);
        return;
      }

      setPackageInstanceId(instanceData.id);

      // Fetch stage_instances for this package_instance
      const { data: stageData, error: stageError } = await supabase
        .from('stage_instances')
        .select('id, stage_id, status, completion_date, paid, released_client_tasks')
        .eq('package_instance_id', instanceData.id)
        .order('stage_id');

      if (stageError) throw stageError;

      if (!stageData || stageData.length === 0) {
        setStages([]);
        setLoading(false);
        return;
      }

      // Get unique stage IDs and fetch stage metadata from public.stages
      const stageIds = [...new Set(stageData.map(s => s.stage_id))];
      const { data: stagesMetadata, error: metaError } = await supabase
        .from('stages')
        .select('id, name, shortname')
        .in('id', stageIds);

      if (metaError) throw metaError;

      // Create a lookup map for stage metadata
      const stageMap = new Map(stagesMetadata?.map(s => [s.id, s]) || []);

      // Transform the data
      const transformed: StageInstance[] = stageData.map((row) => {
        const meta = stageMap.get(row.stage_id);
        return {
          id: row.id,
          stage_id: row.stage_id,
          stage_name: meta?.name || `Stage ${row.stage_id}`,
          shortname: meta?.shortname || null,
          status: row.status ?? 0,
          completion_date: row.completion_date,
          paid: row.paid ?? false,
          released_client_tasks: row.released_client_tasks ?? false,
        };
      });

      setStages(transformed);
    } catch (error: any) {
      console.error('Error fetching stage instances:', error);
      toast({ title: 'Error', description: 'Failed to load phases', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  const updateStageStatus = async (stageInstanceId: number, newStatus: number) => {
    setUpdating(stageInstanceId);
    
    try {
      const oldStage = stages.find(s => s.id === stageInstanceId);
      const oldStatus = oldStage?.status;

      // Build update object
      const updateData: Record<string, any> = {
        status: newStatus,
      };

      // Set completion_date if completing
      if (newStatus === 3 && oldStatus !== 3) {
        updateData.completion_date = new Date().toISOString().split('T')[0];
      }

      const { error } = await supabase
        .from('stage_instances')
        .update(updateData)
        .eq('id', stageInstanceId);

      if (error) throw error;

      // Log to audit
      await supabase.from('client_audit_log').insert({
        tenant_id: tenantId,
        actor_user_id: profile?.user_uuid,
        action: 'stage_status_changed',
        entity_type: 'stage_instances',
        entity_id: stageInstanceId.toString(),
        before_data: { status: oldStatus },
        after_data: { status: newStatus },
        details: { package_id: packageId, stage_id: oldStage?.stage_id }
      });

      toast({ title: 'Phase Updated', description: `Status changed to ${STATUS_OPTIONS.find(s => s.value === newStatus)?.label}` });
      fetchStages();
    } catch (error: any) {
      console.error('Error updating stage instance:', error);
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    } finally {
      setUpdating(null);
    }
  };

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
        <p>No phases configured for this package instance.</p>
        <p className="text-sm mt-1">Phase tracking will be available once phases are assigned.</p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {stages.map((stage) => {
        const statusOption = STATUS_OPTIONS.find(s => s.value === stage.status) || STATUS_OPTIONS[0];
        const StatusIcon = statusOption.icon;

        return (
          <div 
            key={stage.id} 
            className={cn(
              "flex items-center justify-between gap-4 p-3 rounded-lg border bg-card",
              stage.status === 2 && "border-red-200 bg-red-50/50",
              stage.status === 3 && "border-green-200 bg-green-50/50"
            )}
          >
            <div className="flex items-center gap-3 flex-1 min-w-0">
              <StatusIcon className={cn("h-5 w-5 shrink-0", statusOption.color)} />
              <div className="min-w-0">
                <p className="font-medium truncate">{stage.stage_name}</p>
                {stage.shortname && (
                  <p className="text-xs text-muted-foreground">{stage.shortname}</p>
                )}
              </div>
            </div>
            
            <div className="flex items-center gap-3 shrink-0">
              {stage.paid && (
                <Badge variant="outline" className="text-xs bg-green-50 text-green-700 border-green-200">Paid</Badge>
              )}
              {stage.released_client_tasks && (
                <Badge variant="outline" className="text-xs">Tasks Released</Badge>
              )}
              
              <Select
                value={stage.status.toString()}
                onValueChange={(value) => updateStageStatus(stage.id, parseInt(value))}
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
                    <SelectItem key={option.value} value={option.value.toString()}>
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
  );
}
