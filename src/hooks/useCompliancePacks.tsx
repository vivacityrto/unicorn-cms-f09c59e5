import { useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

export interface CompliancePackExport {
  id: string;
  requested_by: string | null;
  tenant_id: number;
  stage_release_id: string | null;
  package_id: number | null;
  export_scope: string;
  status: 'queued' | 'running' | 'success' | 'failed';
  storage_path: string | null;
  file_name: string | null;
  file_size_bytes: number | null;
  error: string | null;
  contents_summary: {
    documents?: { name: string; type: string; status: string }[];
    emails?: { recipient: string; sent_at: string; status: string }[];
    audit_events?: number;
    tasks?: { client: number; team: number };
  } | null;
  created_at: string;
  completed_at: string | null;
  tenant?: { id: number; name: string };
  stage_release?: { id: string; stage_id: number; status: string };
}

export function useCompliancePacks() {
  const { toast } = useToast();
  const [exports, setExports] = useState<CompliancePackExport[]>([]);
  const [loading, setLoading] = useState(false);
  const [exporting, setExporting] = useState(false);

  const fetchExports = useCallback(async (tenantId?: number) => {
    setLoading(true);
    try {
      let query = supabase
        .from('compliance_pack_exports')
        .select(`
          *,
          tenant:tenants(id, name),
          stage_release:stage_releases(id, stage_id, status)
        `)
        .order('created_at', { ascending: false })
        .limit(50);

      if (tenantId) {
        query = query.eq('tenant_id', tenantId);
      }

      const { data, error } = await query;
      if (error) throw error;
      setExports((data || []) as unknown as CompliancePackExport[]);
    } catch (error: any) {
      console.error('Failed to fetch exports:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  const createExport = async (
    tenantId: number,
    stageReleaseId: string
  ): Promise<string | null> => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      // Create export record
      const { data: exportRecord, error } = await supabase
        .from('compliance_pack_exports')
        .insert({
          tenant_id: tenantId,
          stage_release_id: stageReleaseId,
          export_scope: 'stage_release',
          requested_by: user.id,
          status: 'queued'
        })
        .select()
        .single();

      if (error) throw error;

      // Audit log
      await supabase.from('client_audit_log').insert({
        tenant_id: tenantId,
        action: 'compliance_pack.requested',
        entity_type: 'compliance_pack_export',
        entity_id: exportRecord.id,
        actor_user_id: user.id,
        details: { stage_release_id: stageReleaseId }
      });

      return exportRecord.id;
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message || 'Failed to create export',
        variant: 'destructive'
      });
      return null;
    }
  };

  const startExport = async (exportId: string): Promise<boolean> => {
    setExporting(true);
    try {
      const response = await supabase.functions.invoke('export-compliance-pack', {
        body: { export_id: exportId }
      });

      if (response.error) throw response.error;

      toast({
        title: 'Export Complete',
        description: 'Compliance pack is ready for download'
      });

      return true;
    } catch (error: any) {
      toast({
        title: 'Export Failed',
        description: error.message || 'Failed to generate compliance pack',
        variant: 'destructive'
      });
      return false;
    } finally {
      setExporting(false);
    }
  };

  const getDownloadUrl = async (storagePath: string): Promise<string | null> => {
    try {
      const { data, error } = await supabase.storage
        .from('compliance-packs')
        .createSignedUrl(storagePath, 3600); // 1 hour expiry

      if (error) throw error;
      return data.signedUrl;
    } catch (error: any) {
      toast({
        title: 'Error',
        description: 'Failed to get download link',
        variant: 'destructive'
      });
      return null;
    }
  };

  const pollExportStatus = useCallback(async (exportId: string): Promise<CompliancePackExport | null> => {
    const { data, error } = await supabase
      .from('compliance_pack_exports')
      .select('*')
      .eq('id', exportId)
      .single();

    if (error) return null;
    return data as unknown as CompliancePackExport;
  }, []);

  return {
    exports,
    loading,
    exporting,
    fetchExports,
    createExport,
    startExport,
    getDownloadUrl,
    pollExportStatus
  };
}
