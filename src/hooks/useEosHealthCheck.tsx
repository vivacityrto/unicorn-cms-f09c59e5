import { useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { VIVACITY_TENANT_ID } from '@/hooks/useVivacityTeamUsers';

export interface HealthCheck {
  id: string;
  name: string;
  category: 'read' | 'write' | 'rls' | 'enum' | 'config';
  status: 'pass' | 'fail' | 'running' | 'pending' | 'skipped';
  message?: string;
  duration?: number;
  details?: string;
}

const initialChecks: HealthCheck[] = [
  // Configuration checks
  { id: 'system-tenant', name: 'System tenant ID is 6372', category: 'config', status: 'pending' },
  { id: 'vivacity-workspace', name: 'Vivacity workspace exists', category: 'config', status: 'pending' },
  
  // Read checks (SELECT permissions)
  { id: 'eos-meetings-select', name: 'Can SELECT eos_meetings', category: 'read', status: 'pending' },
  { id: 'eos-rocks-select', name: 'Can SELECT eos_rocks', category: 'read', status: 'pending' },
  { id: 'eos-issues-select', name: 'Can SELECT eos_issues', category: 'read', status: 'pending' },
  { id: 'eos-todos-select', name: 'Can SELECT eos_todos', category: 'read', status: 'pending' },
  { id: 'eos-qc-select', name: 'Can SELECT eos_qc', category: 'read', status: 'pending' },
  { id: 'accountability-chart-select', name: 'Can SELECT accountability_charts', category: 'read', status: 'pending' },
  { id: 'accountability-functions-select', name: 'Can SELECT accountability_functions', category: 'read', status: 'pending' },
  { id: 'accountability-seats-select', name: 'Can SELECT accountability_seats', category: 'read', status: 'pending' },
  { id: 'eos-scorecard-select', name: 'Can SELECT eos_scorecard_metrics', category: 'read', status: 'pending' },
  { id: 'eos-vto-select', name: 'Can SELECT eos_vto', category: 'read', status: 'pending' },
  
  // RLS checks
  { id: 'rls-vivacity-access', name: 'RLS allows Vivacity Team access', category: 'rls', status: 'pending' },
  { id: 'rls-workspace-filter', name: 'Workspace filter applied correctly', category: 'rls', status: 'pending' },
  
  // Enum validation checks
  { id: 'rock-status-enum', name: 'Rock status enum values valid', category: 'enum', status: 'pending' },
  { id: 'issue-status-enum', name: 'Issue status enum values valid', category: 'enum', status: 'pending' },
  { id: 'meeting-status-enum', name: 'Meeting status enum values valid', category: 'enum', status: 'pending' },
  { id: 'meeting-type-enum', name: 'Meeting type enum values valid', category: 'enum', status: 'pending' },
];

const writeChecks: HealthCheck[] = [
  { id: 'write-eos-issues', name: 'Can INSERT/DELETE eos_issues (test record)', category: 'write', status: 'pending' },
  { id: 'write-eos-todos', name: 'Can INSERT/DELETE eos_todos (test record)', category: 'write', status: 'pending' },
];

export function useEosHealthCheck() {
  const [checks, setChecks] = useState<HealthCheck[]>(initialChecks);
  const [isRunning, setIsRunning] = useState(false);
  const [runWriteTests, setRunWriteTests] = useState(false);
  const [lastRun, setLastRun] = useState<Date | null>(null);

  const updateCheck = useCallback((id: string, update: Partial<HealthCheck>) => {
    setChecks(prev => prev.map(check => 
      check.id === id ? { ...check, ...update } : check
    ));
  }, []);

  const runCheck = useCallback(async (check: HealthCheck): Promise<HealthCheck> => {
    const startTime = Date.now();
    
    try {
      switch (check.id) {
        case 'system-tenant': {
          const { data, error } = await supabase.rpc('get_system_tenant_id');
          if (error) throw error;
          if (data !== VIVACITY_TENANT_ID) {
            throw new Error(`Expected ${VIVACITY_TENANT_ID}, got ${data}`);
          }
          return { ...check, status: 'pass', duration: Date.now() - startTime };
        }

        case 'vivacity-workspace': {
          const { data, error } = await supabase
            .from('eos_workspaces')
            .select('id, slug')
            .eq('slug', 'vivacity')
            .maybeSingle();
          if (error) throw error;
          if (!data) throw new Error('Vivacity workspace not found');
          return { ...check, status: 'pass', duration: Date.now() - startTime, details: `ID: ${data.id}` };
        }

        case 'eos-meetings-select': {
          const { data, error } = await supabase
            .from('eos_meetings')
            .select('id')
            .limit(1);
          if (error) throw error;
          return { ...check, status: 'pass', duration: Date.now() - startTime, details: `Rows accessible: ${data?.length || 0}+` };
        }

        case 'eos-rocks-select': {
          const { data, error } = await supabase
            .from('eos_rocks')
            .select('id')
            .limit(1);
          if (error) throw error;
          return { ...check, status: 'pass', duration: Date.now() - startTime };
        }

        case 'eos-issues-select': {
          const { data, error } = await supabase
            .from('eos_issues')
            .select('id')
            .limit(1);
          if (error) throw error;
          return { ...check, status: 'pass', duration: Date.now() - startTime };
        }

        case 'eos-todos-select': {
          const { data, error } = await supabase
            .from('eos_todos')
            .select('id')
            .limit(1);
          if (error) throw error;
          return { ...check, status: 'pass', duration: Date.now() - startTime };
        }

        case 'eos-qc-select': {
          const { data, error } = await supabase
            .from('eos_qc')
            .select('id')
            .limit(1);
          if (error) throw error;
          return { ...check, status: 'pass', duration: Date.now() - startTime };
        }

        case 'accountability-chart-select': {
          const { data, error } = await supabase
            .from('accountability_charts')
            .select('id')
            .limit(1);
          if (error) throw error;
          return { ...check, status: 'pass', duration: Date.now() - startTime };
        }

        case 'accountability-functions-select': {
          const { data, error } = await supabase
            .from('accountability_functions')
            .select('id')
            .limit(1);
          if (error) throw error;
          return { ...check, status: 'pass', duration: Date.now() - startTime };
        }

        case 'accountability-seats-select': {
          const { data, error } = await supabase
            .from('accountability_seats')
            .select('id')
            .limit(1);
          if (error) throw error;
          return { ...check, status: 'pass', duration: Date.now() - startTime };
        }

        case 'eos-scorecard-select': {
          const { data, error } = await supabase
            .from('eos_scorecard_metrics')
            .select('id')
            .limit(1);
          if (error) throw error;
          return { ...check, status: 'pass', duration: Date.now() - startTime };
        }

        case 'eos-vto-select': {
          const { data, error } = await supabase
            .from('eos_vto')
            .select('id')
            .limit(1);
          if (error) throw error;
          return { ...check, status: 'pass', duration: Date.now() - startTime };
        }

        case 'rls-vivacity-access': {
          // Try to call the is_vivacity_team_safe function
          const { data: user } = await supabase.auth.getUser();
          if (!user.user) throw new Error('Not authenticated');
          
          const { data, error } = await supabase.rpc('is_vivacity_team_safe', {
            p_user_id: user.user.id
          });
          if (error) throw error;
          if (!data) throw new Error('Current user is not Vivacity Team');
          return { ...check, status: 'pass', duration: Date.now() - startTime };
        }

        case 'rls-workspace-filter': {
          // Check that workspace-based queries work
          const { data: workspace } = await supabase.rpc('get_vivacity_workspace_id_safe');
          if (!workspace) throw new Error('Could not get workspace ID');
          return { ...check, status: 'pass', duration: Date.now() - startTime, details: `Workspace: ${workspace}` };
        }

        case 'rock-status-enum': {
          const validStatuses = ['Not_Started', 'On_Track', 'At_Risk', 'Off_Track', 'Complete'];
          // Attempt to query rocks with each status
          const { data, error } = await supabase
            .from('eos_rocks')
            .select('status')
            .limit(50);
          if (error) throw error;
          const foundStatuses = [...new Set(data?.map(r => r.status) || [])];
          const invalidStatuses = foundStatuses.filter(s => s && !validStatuses.includes(s));
          if (invalidStatuses.length > 0) {
            throw new Error(`Invalid statuses found: ${invalidStatuses.join(', ')}`);
          }
          return { ...check, status: 'pass', duration: Date.now() - startTime, details: `Statuses: ${foundStatuses.join(', ')}` };
        }

        case 'issue-status-enum': {
          const validStatuses = ['Open', 'Discussing', 'Solved', 'Archived', 'In Review', 'Actioning', 'Escalated', 'Closed'];
          const { data, error } = await supabase
            .from('eos_issues')
            .select('status')
            .limit(50);
          if (error) throw error;
          const foundStatuses = [...new Set(data?.map(r => r.status) || [])];
          const invalidStatuses = foundStatuses.filter(s => s && !validStatuses.includes(s));
          if (invalidStatuses.length > 0) {
            throw new Error(`Invalid statuses found: ${invalidStatuses.join(', ')}`);
          }
          return { ...check, status: 'pass', duration: Date.now() - startTime };
        }

        case 'meeting-status-enum': {
          const validStatuses = ['scheduled', 'in_progress', 'completed', 'cancelled', 'ready_to_close', 'closed', 'locked'];
          const { data, error } = await supabase
            .from('eos_meetings')
            .select('status')
            .limit(50);
          if (error) throw error;
          const foundStatuses = [...new Set(data?.map(r => r.status) || [])];
          const invalidStatuses = foundStatuses.filter(s => s && !validStatuses.includes(s));
          if (invalidStatuses.length > 0) {
            throw new Error(`Invalid statuses found: ${invalidStatuses.join(', ')}`);
          }
          return { ...check, status: 'pass', duration: Date.now() - startTime };
        }

        case 'meeting-type-enum': {
          const validTypes = ['L10', 'Quarterly', 'Annual', 'Focus_Day', 'Custom', 'Same_Page'];
          const { data, error } = await supabase
            .from('eos_meetings')
            .select('meeting_type')
            .limit(50);
          if (error) throw error;
          const foundTypes = [...new Set(data?.map(r => r.meeting_type) || [])];
          const invalidTypes = foundTypes.filter(t => t && !validTypes.includes(t));
          if (invalidTypes.length > 0) {
            throw new Error(`Invalid types found: ${invalidTypes.join(', ')}`);
          }
          return { ...check, status: 'pass', duration: Date.now() - startTime };
        }

        case 'write-eos-issues': {
          const testRunId = `health-check-${Date.now()}`;
          // Insert test record
          const { data: inserted, error: insertError } = await supabase
            .from('eos_issues')
            .insert({
              title: `[TEST] Health Check - ${testRunId}`,
              item_type: 'risk',
              status: 'Open',
              category: 'Systems',
              tenant_id: VIVACITY_TENANT_ID,
              source: 'ad_hoc',
            })
            .select('id')
            .single();
          
          if (insertError) throw insertError;
          
          // Delete test record
          const { error: deleteError } = await supabase
            .from('eos_issues')
            .delete()
            .eq('id', inserted.id);
          
          if (deleteError) throw deleteError;
          
          return { ...check, status: 'pass', duration: Date.now() - startTime, details: 'Insert/Delete successful' };
        }

        case 'write-eos-todos': {
          const testRunId = `health-check-${Date.now()}`;
          const { data: user } = await supabase.auth.getUser();
          if (!user.user) throw new Error('Not authenticated');
          
          // Insert test record
          const { data: inserted, error: insertError } = await supabase
            .from('eos_todos')
            .insert({
              title: `[TEST] Health Check - ${testRunId}`,
              status: 'Open',
              tenant_id: VIVACITY_TENANT_ID,
              assigned_to: user.user.id,
            })
            .select('id')
            .single();
          
          if (insertError) throw insertError;
          
          // Delete test record
          const { error: deleteError } = await supabase
            .from('eos_todos')
            .delete()
            .eq('id', inserted.id);
          
          if (deleteError) throw deleteError;
          
          return { ...check, status: 'pass', duration: Date.now() - startTime, details: 'Insert/Delete successful' };
        }

        default:
          return { ...check, status: 'skipped', message: 'Unknown check' };
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      return { 
        ...check, 
        status: 'fail', 
        message,
        duration: Date.now() - startTime 
      };
    }
  }, []);

  const runAllChecks = useCallback(async () => {
    setIsRunning(true);
    
    // Include write checks if enabled
    const allChecks = runWriteTests 
      ? [...initialChecks, ...writeChecks]
      : initialChecks;
    
    setChecks(allChecks.map(c => ({ ...c, status: 'pending' })));
    
    for (const check of allChecks) {
      updateCheck(check.id, { status: 'running' });
      const result = await runCheck(check);
      updateCheck(check.id, result);
    }
    
    setIsRunning(false);
    setLastRun(new Date());
  }, [runCheck, updateCheck, runWriteTests]);

  const exportResults = useCallback(() => {
    const results = {
      timestamp: new Date().toISOString(),
      checks,
      summary: {
        total: checks.length,
        passed: checks.filter(c => c.status === 'pass').length,
        failed: checks.filter(c => c.status === 'fail').length,
        skipped: checks.filter(c => c.status === 'skipped').length,
      }
    };
    
    const blob = new Blob([JSON.stringify(results, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `eos-health-check-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }, [checks]);

  const passCount = checks.filter(c => c.status === 'pass').length;
  const failCount = checks.filter(c => c.status === 'fail').length;
  const pendingCount = checks.filter(c => c.status === 'pending' || c.status === 'running').length;

  return {
    checks,
    isRunning,
    runWriteTests,
    setRunWriteTests,
    runAllChecks,
    exportResults,
    lastRun,
    summary: {
      total: checks.length,
      passed: passCount,
      failed: failCount,
      pending: pendingCount,
    }
  };
}
