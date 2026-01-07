import { useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

export interface FailedGeneration {
  id: string;
  tenant_id: number;
  tenant_name?: string;
  stage_id: number;
  stage_title?: string;
  source_document_id: number;
  document_title?: string;
  error_message: string | null;
  retry_count: number;
  last_retry_at: string | null;
  generated_at: string | null;
  created_at: string;
}

export interface FailedEmail {
  id: string;
  tenant_id: number;
  tenant_name?: string;
  stage_id: number | null;
  to_email: string;
  subject: string;
  status: string;
  error_message: string | null;
  retry_count: number;
  created_at: string;
}

export interface AppSettings {
  email_sending_enabled: boolean;
  generation_enabled: boolean;
  max_generation_retries: number;
  generation_rate_limit_per_hour: number;
}

export interface OperationsStats {
  failed_generations_7d: number;
  failed_generations_30d: number;
  failed_generations_90d: number;
  failed_emails_7d: number;
  failed_emails_30d: number;
  pending_generations: number;
  average_generation_time_ms: number | null;
}

export function useOperationsDashboard() {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [failedGenerations, setFailedGenerations] = useState<FailedGeneration[]>([]);
  const [failedEmails, setFailedEmails] = useState<FailedEmail[]>([]);
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [stats, setStats] = useState<OperationsStats | null>(null);

  const fetchFailedGenerations = useCallback(async (days: number = 7) => {
    setLoading(true);
    try {
      const cutoff = new Date();
      cutoff.setDate(cutoff.getDate() - days);

      const { data, error } = await supabase
        .from('generated_documents')
        .select('id, tenant_id, stage_id, source_document_id, error_message, retry_count, last_retry_at, generated_at, created_at')
        .eq('status', 'failed')
        .gte('created_at', cutoff.toISOString())
        .order('created_at', { ascending: false })
        .limit(100);

      if (error) throw error;

      // Enrich with tenant and document names
      const enriched = await Promise.all((data || []).map(async (item) => {
        const [tenantRes, docRes, stageRes] = await Promise.all([
          supabase.from('tenants').select('name').eq('id', item.tenant_id).single(),
          supabase.from('documents').select('title').eq('id', item.source_document_id).single(),
          supabase.from('documents_stages').select('title').eq('id', item.stage_id).single()
        ]);

        return {
          ...item,
          tenant_name: tenantRes.data?.name,
          document_title: docRes.data?.title,
          stage_title: stageRes.data?.title
        } as FailedGeneration;
      }));

      setFailedGenerations(enriched);
    } catch (error: any) {
      console.error('Failed to fetch failed generations:', error);
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  const fetchFailedEmails = useCallback(async (days: number = 7) => {
    try {
      const cutoff = new Date();
      cutoff.setDate(cutoff.getDate() - days);

      const { data, error } = await supabase
        .from('email_send_log')
        .select('id, tenant_id, stage_id, to_email, subject, status, error_message, retry_count, created_at')
        .eq('status', 'failed')
        .gte('created_at', cutoff.toISOString())
        .order('created_at', { ascending: false })
        .limit(100);

      if (error) throw error;

      // Enrich with tenant names
      const enriched = await Promise.all((data || []).map(async (item) => {
        const tenantRes = await supabase.from('tenants').select('name').eq('id', item.tenant_id).single();
        return {
          ...item,
          tenant_name: tenantRes.data?.name
        } as FailedEmail;
      }));

      setFailedEmails(enriched);
    } catch (error: any) {
      console.error('Failed to fetch failed emails:', error);
    }
  }, []);

  const fetchSettings = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from('app_settings')
        .select('email_sending_enabled, generation_enabled, max_generation_retries, generation_rate_limit_per_hour')
        .limit(1)
        .single();

      if (error) throw error;
      setSettings(data as AppSettings);
    } catch (error: any) {
      console.error('Failed to fetch settings:', error);
    }
  }, []);

  const fetchStats = useCallback(async () => {
    try {
      const now = new Date();
      const d7 = new Date(now); d7.setDate(d7.getDate() - 7);
      const d30 = new Date(now); d30.setDate(d30.getDate() - 30);
      const d90 = new Date(now); d90.setDate(d90.getDate() - 90);

      const [gen7, gen30, gen90, email7, email30, pending] = await Promise.all([
        supabase.from('generated_documents').select('id', { count: 'exact', head: true })
          .eq('status', 'failed').gte('created_at', d7.toISOString()),
        supabase.from('generated_documents').select('id', { count: 'exact', head: true })
          .eq('status', 'failed').gte('created_at', d30.toISOString()),
        supabase.from('generated_documents').select('id', { count: 'exact', head: true })
          .eq('status', 'failed').gte('created_at', d90.toISOString()),
        supabase.from('email_send_log').select('id', { count: 'exact', head: true })
          .eq('status', 'failed').gte('created_at', d7.toISOString()),
        supabase.from('email_send_log').select('id', { count: 'exact', head: true })
          .eq('status', 'failed').gte('created_at', d30.toISOString()),
        supabase.from('generated_documents').select('id', { count: 'exact', head: true })
          .eq('status', 'pending')
      ]);

      setStats({
        failed_generations_7d: gen7.count || 0,
        failed_generations_30d: gen30.count || 0,
        failed_generations_90d: gen90.count || 0,
        failed_emails_7d: email7.count || 0,
        failed_emails_30d: email30.count || 0,
        pending_generations: pending.count || 0,
        average_generation_time_ms: null
      });
    } catch (error: any) {
      console.error('Failed to fetch stats:', error);
    }
  }, []);

  const updateSettings = async (updates: Partial<AppSettings>) => {
    try {
      const { error } = await supabase
        .from('app_settings')
        .update(updates)
        .eq('id', 1);

      if (error) throw error;
      
      setSettings(prev => prev ? { ...prev, ...updates } : null);
      toast({ title: 'Settings updated' });
    } catch (error: any) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    }
  };

  const retryGeneration = async (documentId: string) => {
    try {
      const { data, error } = await supabase.rpc('retry_failed_generation', {
        p_generated_document_id: documentId
      });

      if (error) throw error;
      
      const result = data as { success: boolean; message?: string };
      if (!result.success) {
        toast({ title: 'Cannot retry', description: result.message, variant: 'destructive' });
        return false;
      }

      toast({ title: 'Retry queued' });
      return true;
    } catch (error: any) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
      return false;
    }
  };

  const retryAllFailed = async () => {
    let successCount = 0;
    let failCount = 0;

    for (const doc of failedGenerations) {
      const result = await retryGeneration(doc.id);
      if (result) successCount++;
      else failCount++;
    }

    toast({ 
      title: 'Retry complete', 
      description: `${successCount} queued, ${failCount} failed` 
    });

    await fetchFailedGenerations();
  };

  const exportFailureReport = () => {
    const headers = ['ID', 'Tenant', 'Stage', 'Document', 'Error', 'Retries', 'Created At'];
    const rows = failedGenerations.map(g => [
      g.id,
      g.tenant_name || g.tenant_id,
      g.stage_title || g.stage_id,
      g.document_title || g.source_document_id,
      g.error_message || '',
      g.retry_count,
      g.created_at
    ]);

    const csv = [headers.join(','), ...rows.map(r => r.map(c => `"${c}"`).join(','))].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `failed-generations-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return {
    loading,
    failedGenerations,
    failedEmails,
    settings,
    stats,
    fetchFailedGenerations,
    fetchFailedEmails,
    fetchSettings,
    fetchStats,
    updateSettings,
    retryGeneration,
    retryAllFailed,
    exportFailureReport
  };
}
