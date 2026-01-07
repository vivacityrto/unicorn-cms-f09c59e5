import { useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

export interface StageRelease {
  id: string;
  tenant_id: number;
  package_id: number | null;
  stage_id: number;
  release_type: 'documents' | 'pack';
  status: 'draft' | 'ready' | 'released' | 'cancelled';
  summary: string | null;
  pack_download_url: string | null;
  email_sent_at: string | null;
  email_template_id: string | null;
  released_at: string | null;
  released_by: string | null;
  created_at: string;
  created_by: string | null;
  stage?: {
    id: number;
    title: string;
  };
  items?: StageReleaseItem[];
}

export interface StageReleaseItem {
  id: string;
  stage_release_id: string;
  document_id: number;
  document_version_id: string | null;
  generated_document_id: string | null;
  is_visible_to_tenant: boolean;
  include_in_pack: boolean;
  generation_status: 'pending' | 'running' | 'success' | 'failed' | 'skipped';
  created_at: string;
  document?: {
    id: number;
    title: string;
    format: string | null;
  };
  generated_document?: {
    id: string;
    file_path: string;
    file_name: string;
    status: string;
  };
}

export interface ReleaseReadinessResult {
  can_release: boolean;
  requires_override: boolean;
  override_phrase?: string;
  summary: {
    pass: number;
    warn: number;
    fail: number;
  };
  items: Array<{
    document_id: number;
    document_name: string;
    status: 'pass' | 'warn' | 'fail';
    issues: string[];
  }>;
}

export function useStageReleases(tenantId?: number) {
  const { toast } = useToast();
  const [releases, setReleases] = useState<StageRelease[]>([]);
  const [loading, setLoading] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [releasing, setReleasing] = useState(false);

  const fetchReleases = useCallback(async (stageId?: number, packageId?: number) => {
    if (!tenantId) return;
    setLoading(true);
    try {
      let query = supabase
        .from('stage_releases')
        .select(`
          *,
          stage:documents_stages(id, title)
        `)
        .eq('tenant_id', tenantId)
        .order('created_at', { ascending: false });

      if (stageId) query = query.eq('stage_id', stageId);
      if (packageId) query = query.eq('package_id', packageId);

      const { data, error } = await query;
      if (error) throw error;
      setReleases(data as StageRelease[] ?? []);
    } catch (error: any) {
      console.error('Failed to fetch releases:', error);
    } finally {
      setLoading(false);
    }
  }, [tenantId]);

  const createRelease = async (
    stageId: number,
    packageId: number | null,
    documentIds: number[]
  ): Promise<StageRelease | null> => {
    try {
      // Use the RPC for server-side validation and creation
      const { data, error } = await supabase.rpc('create_stage_release', {
        p_tenant_id: tenantId,
        p_package_id: packageId,
        p_stage_id: stageId,
        p_document_ids: documentIds
      });

      if (error) throw error;
      
      const result = data as unknown as { success: boolean; release_id?: string; error?: string } | null;
      if (!result?.success) throw new Error(result?.error || 'Failed to create release');

      return { id: result.release_id } as StageRelease;
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message || 'Failed to create release',
        variant: 'destructive'
      });
      return null;
    }
  };

  const generateDocuments = async (releaseId: string): Promise<boolean> => {
    setGenerating(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('Not authenticated');

      // Check rate limit first using RPC
      const { data: limitData, error: limitError } = await supabase.rpc('check_rate_limit', {
        p_tenant_id: tenantId,
        p_action_type: 'document_generation'
      });

      if (limitError) throw limitError;
      
      const limitCheck = limitData as unknown as { allowed: boolean; retry_after_minutes?: number } | null;
      if (!limitCheck?.allowed) {
        throw new Error(`Rate limit exceeded. Try again after ${limitCheck?.retry_after_minutes || 60} minutes.`);
      }

      // Increment rate limit counter
      await supabase.rpc('increment_rate_limit', {
        p_tenant_id: tenantId,
        p_action_type: 'document_generation'
      });

      const response = await supabase.functions.invoke('generate-release-documents', {
        body: { release_id: releaseId }
      });

      if (response.error) throw response.error;

      toast({
        title: 'Generation Started',
        description: 'Documents are being generated. Please wait...'
      });

      return true;
    } catch (error: any) {
      toast({
        title: 'Generation Failed',
        description: error.message || 'Failed to generate documents',
        variant: 'destructive'
      });
      return false;
    } finally {
      setGenerating(false);
    }
  };

  const checkReleaseReadiness = async (releaseId: string): Promise<ReleaseReadinessResult> => {
    try {
      // Fetch release items with their generation status
      const { data: itemsRaw, error } = await supabase
        .from('stage_release_items')
        .select('id, stage_release_id, document_id, document_version_id, generated_document_id, is_visible_to_tenant, include_in_pack, generation_status')
        .eq('stage_release_id', releaseId);

      if (error) throw error;

      const results: ReleaseReadinessResult = {
        can_release: true,
        requires_override: false,
        override_phrase: 'RELEASE ANYWAY',
        summary: { pass: 0, warn: 0, fail: 0 },
        items: []
      };

      for (const item of itemsRaw || []) {
        const issues: string[] = [];
        let status: 'pass' | 'warn' | 'fail' = 'pass';

        // Fetch document info separately
        const { data: docData } = await supabase
          .from('documents')
          .select('id, title, format, merge_fields, dropdown_sources')
          .eq('id', item.document_id)
          .single();

        // Fetch generated document info if exists
        let genDoc: { id: string; status: string; error_message: string | null } | null = null;
        if (item.generated_document_id) {
          const { data: genDocData } = await supabase
            .from('generated_documents')
            .select('id, status, error_message')
            .eq('id', item.generated_document_id)
            .single();
          genDoc = genDocData;
        }

        // Check generation status for auto-generated docs
        if (item.generated_document_id && genDoc) {
          const genStatus = genDoc.status;
          if (genStatus === 'failed') {
            issues.push(`Generation failed: ${genDoc.error_message || 'Unknown error'}`);
            status = 'fail';
          } else if (genStatus !== 'success' && genStatus !== 'generated') {
            issues.push(`Generation not complete (status: ${genStatus})`);
            status = 'fail';
          }
        }

        // Check merge fields
        const mergeFields = docData?.merge_fields as { required?: string[] } | null;
        if (mergeFields?.required && mergeFields.required.length > 0) {
          // This is a warning - merge fields exist but we can't verify all values
          if (status !== 'fail') {
            issues.push(`Has ${mergeFields.required.length} merge field(s) - verify values are correct`);
            if (status === 'pass') status = 'warn';
          }
        }

        // Check data sources for Excel
        const dropdownSources = docData?.dropdown_sources as { required?: string[] } | null;
        if (dropdownSources?.required && dropdownSources.required.length > 0 && tenantId) {
          // Check if all data sources are configured - use filter to avoid deep type instantiation
          const { data: sourcesData } = await supabase
            .from('document_data_sources')
            .select('name')
            .match({ document_id: item.document_id, tenant_id: tenantId });

          const sources = sourcesData as { name: string }[] | null;
          const configuredNames = new Set((sources ?? []).map((s) => s.name));
          const missing = (dropdownSources.required ?? []).filter((r) => !configuredNames.has(r));

          if (missing.length > 0) {
            issues.push(`Missing data sources: ${missing.join(', ')}`);
            status = 'fail';
          }
        }

        results.items.push({
          document_id: item.document_id,
          document_name: docData?.title || `Document #${item.document_id}`,
          status,
          issues
        });

        if (status === 'pass') results.summary.pass++;
        else if (status === 'warn') results.summary.warn++;
        else results.summary.fail++;
      }

      results.can_release = results.summary.fail === 0;
      results.requires_override = results.summary.fail > 0;

      return results;
    } catch (error: any) {
      console.error('Readiness check failed:', error);
      return {
        can_release: false,
        requires_override: true,
        summary: { pass: 0, warn: 0, fail: 1 },
        items: [{
          document_id: 0,
          document_name: 'Error',
          status: 'fail',
          issues: [error.message || 'Failed to check readiness']
        }]
      };
    }
  };

  const executeRelease = async (
    releaseId: string, 
    sendEmail: boolean = true,
    emailTemplateId?: string,
    confirmOverride: boolean = false,
    confirmPhrase?: string
  ): Promise<boolean> => {
    setReleasing(true);
    try {
      // Use the RPC for server-side validation and release
      const { data, error } = await supabase.rpc('release_to_tenant', {
        p_stage_release_id: releaseId,
        p_confirm_override: confirmOverride,
        p_confirm_phrase: confirmPhrase || null
      });

      if (error) throw error;
      
      const result = data as unknown as { success: boolean; error?: string } | null;
      if (!result?.success) throw new Error(result?.error || 'Failed to release');

      // If email should be sent, trigger the email function
      if (sendEmail && emailTemplateId) {
        const { data: release } = await supabase
          .from('stage_releases')
          .select('tenant_id, stage_id, package_id')
          .eq('id', releaseId)
          .single();

        if (release) {
          const emailResponse = await supabase.functions.invoke('send-stage-email', {
            body: {
              tenant_id: release.tenant_id,
              package_id: release.package_id,
              stage_id: release.stage_id,
              email_template_id: emailTemplateId,
              recipient_type: 'tenant',
              stage_release_id: releaseId
            }
          });

          if (!emailResponse.error) {
            await supabase
              .from('stage_releases')
              .update({
                email_sent_at: new Date().toISOString(),
                email_template_id: emailTemplateId
              })
              .eq('id', releaseId);
          }
        }
      }

      toast({
        title: 'Released',
        description: sendEmail 
          ? 'Documents released and notification email sent'
          : 'Documents released successfully'
      });

      return true;
    } catch (error: any) {
      toast({
        title: 'Release Failed',
        description: error.message || 'Failed to release documents',
        variant: 'destructive'
      });
      return false;
    } finally {
      setReleasing(false);
    }
  };

  const pollGenerationStatus = useCallback(async (releaseId: string): Promise<{
    complete: boolean;
    success: number;
    failed: number;
    pending: number;
  }> => {
    const { data: items } = await (supabase
      .from('stage_release_items')
      .select('generation_status') as any)
      .eq('stage_release_id', releaseId);

    const statuses = items || [];
    const success = statuses.filter(i => i.generation_status === 'success').length;
    const failed = statuses.filter(i => i.generation_status === 'failed').length;
    const pending = statuses.filter(i => 
      i.generation_status === 'pending' || i.generation_status === 'running'
    ).length;

    return {
      complete: pending === 0,
      success,
      failed,
      pending
    };
  }, []);

  return {
    releases,
    loading,
    generating,
    releasing,
    fetchReleases,
    createRelease,
    generateDocuments,
    checkReleaseReadiness,
    executeRelease,
    pollGenerationStatus
  };
}
