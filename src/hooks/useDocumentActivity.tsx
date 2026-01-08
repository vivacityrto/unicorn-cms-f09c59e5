import { useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Json } from '@/integrations/supabase/types';

interface LogActivityParams {
  tenantId: number;
  clientId?: number | null;
  packageId?: number | null;
  stageId?: number | null;
  documentId: number;
  activityType: 'uploaded' | 'downloaded';
  fileName?: string;
  actorRole?: 'internal' | 'tenant';
  metadata?: Json;
}

export function useDocumentActivity() {
  const logActivity = useCallback(async ({
    tenantId,
    clientId,
    packageId,
    stageId,
    documentId,
    activityType,
    fileName,
    actorRole = 'internal',
    metadata = {}
  }: LogActivityParams): Promise<boolean> => {
    try {
      const { data, error } = await supabase.rpc('rpc_log_document_activity', {
        p_tenant_id: tenantId,
        p_client_id: clientId || null,
        p_package_id: packageId || null,
        p_stage_id: stageId || null,
        p_document_id: documentId,
        p_activity_type: activityType,
        p_file_name: fileName || null,
        p_actor_role: actorRole,
        p_metadata: metadata
      });

      if (error) {
        console.error('Failed to log document activity:', error);
        return false;
      }

      const result = data as { success: boolean } | null;
      return result?.success ?? false;
    } catch (error) {
      console.error('Error logging document activity:', error);
      return false;
    }
  }, []);

  const logDownload = useCallback(async (params: Omit<LogActivityParams, 'activityType'>) => {
    return logActivity({ ...params, activityType: 'downloaded' });
  }, [logActivity]);

  const logUpload = useCallback(async (params: Omit<LogActivityParams, 'activityType'>) => {
    return logActivity({ ...params, activityType: 'uploaded' });
  }, [logActivity]);

  return { logActivity, logDownload, logUpload };
}
