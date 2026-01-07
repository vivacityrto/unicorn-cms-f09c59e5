import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { CheckCircle2, AlertTriangle, XCircle, Loader2 } from 'lucide-react';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';

type QualityStatus = 'pass' | 'warn' | 'fail' | 'loading' | 'unknown';

interface StageQualityIndicatorProps {
  stageId: number;
  stageType: string;
  isArchived: boolean;
}

/**
 * Lightweight quality indicator for stage list view.
 * Computes a simplified quality status based on key checks.
 */
export function StageQualityIndicator({ 
  stageId, 
  stageType,
  isArchived 
}: StageQualityIndicatorProps) {
  const [status, setStatus] = useState<QualityStatus>('loading');
  const [message, setMessage] = useState('');

  useEffect(() => {
    computeQuickQuality();
  }, [stageId, stageType, isArchived]);

  const computeQuickQuality = async () => {
    if (isArchived) {
      setStatus('fail');
      setMessage('Stage is archived');
      return;
    }

    try {
      // Quick aggregated checks - single query for team tasks
      const { count: teamTaskCount } = await supabase
        .from('package_staff_tasks')
        .select('*', { count: 'exact', head: true })
        .eq('stage_id', stageId);

      // Check for client tasks if onboarding/offboarding
      let clientTaskFail = false;
      if (['onboarding', 'offboarding'].includes(stageType)) {
        const { count: clientTaskCount } = await supabase
          .from('package_client_tasks')
          .select('*', { count: 'exact', head: true })
          .eq('stage_id', stageId);
        
        if (!clientTaskCount || clientTaskCount === 0) {
          clientTaskFail = true;
        }
      }

      // Check for tenant-visible docs if delivery/documentation
      let docsFail = false;
      if (['delivery', 'documentation'].includes(stageType)) {
        const { data: docs } = await supabase
          .from('package_stage_documents')
          .select('visibility')
          .eq('stage_id', stageId);
        
        const tenantVisibleDocs = docs?.filter(d => d.visibility !== 'team_only').length || 0;
        if (tenantVisibleDocs === 0) {
          docsFail = true;
        }
      }

      // Determine overall status
      const hasTeamTasks = teamTaskCount && teamTaskCount > 0;

      if (!hasTeamTasks || clientTaskFail || docsFail) {
        const issues: string[] = [];
        if (!hasTeamTasks) issues.push('No team tasks');
        if (clientTaskFail) issues.push('No client tasks');
        if (docsFail) issues.push('No tenant documents');
        
        setStatus('fail');
        setMessage(issues.join(', '));
      } else {
        // Check for warnings - draft emails
        const { data: emails } = await supabase
          .from('package_stage_emails')
          .select(`
            email_templates!inner (status)
          `)
          .eq('stage_id', stageId);

        const draftEmails = emails?.filter((e: any) => e.email_templates?.status === 'draft').length || 0;

        if (draftEmails > 0) {
          setStatus('warn');
          setMessage(`${draftEmails} draft email${draftEmails !== 1 ? 's' : ''}`);
        } else {
          setStatus('pass');
          setMessage('All checks passed');
        }
      }
    } catch (error) {
      console.error('Quick quality check failed:', error);
      setStatus('unknown');
      setMessage('Unable to check quality');
    }
  };

  const renderIcon = () => {
    switch (status) {
      case 'loading':
        return <Loader2 className="h-4 w-4 text-muted-foreground animate-spin" />;
      case 'pass':
        return <CheckCircle2 className="h-4 w-4 text-emerald-500" />;
      case 'warn':
        return <AlertTriangle className="h-4 w-4 text-amber-500" />;
      case 'fail':
        return <XCircle className="h-4 w-4 text-red-500" />;
      default:
        return <span className="text-muted-foreground">-</span>;
    }
  };

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger className="flex items-center justify-center w-full">
          {renderIcon()}
        </TooltipTrigger>
        <TooltipContent>
          <p className="text-sm">{message || 'Stage quality check'}</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
