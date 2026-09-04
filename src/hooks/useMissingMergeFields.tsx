import { useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/use-toast';

export interface MergeFieldDefinition {
  id: number;
  tag: string;
  name: string;
  source_column: string | null;
  description: string | null;
  is_active: boolean;
}

export interface MissingField {
  code: string;
  name: string;
  source_column: string;
  inputType: 'text' | 'email' | 'tel' | 'url' | 'date' | 'textarea';
  required: boolean;
}

interface TenantData {
  [key: string]: string | null | undefined;
}

// Map source columns to appropriate input types
const getInputType = (sourceColumn: string): MissingField['inputType'] => {
  const emailColumns = ['email', 'document_contact_email'];
  const phoneColumns = ['phone', 'document_contact_phone'];
  const urlColumns = ['website', 'logo_url', 'keap_url', 'clickup_url'];
  const dateColumns = ['registration_end_date', 'audit_due'];
  
  if (emailColumns.includes(sourceColumn)) return 'email';
  if (phoneColumns.includes(sourceColumn)) return 'tel';
  if (urlColumns.includes(sourceColumn)) return 'url';
  if (dateColumns.includes(sourceColumn)) return 'date';
  
  return 'text';
};

// Fields that are considered required for document generation
const requiredFields = [
  'companyname', 'legal_name', 'rto_name', 'rtoid', 'abn'
];

export function useMissingMergeFields(tenantId: number | null) {
  const { user, profile } = useAuth();
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [missingFields, setMissingFields] = useState<MissingField[]>([]);
  const [tenantMergeData, setTenantMergeData] = useState<TenantData | null>(null);

  // Fetch merge field definitions and tenant data to compute missing fields
  const detectMissingFields = useCallback(async (documentMergeFields?: string[]) => {
    if (!tenantId) return [];
    
    setLoading(true);
    try {
      // Fetch all active merge field definitions from dd_fields
      const { data: definitions, error: defError } = await supabase
        .from('dd_fields')
        .select('*')
        .eq('is_active', true);

      if (defError) throw defError;

      // Fetch resolved values from the unified view
      const { data: viewData, error: viewError } = await supabase
        .from('v_tenant_merge_fields')
        .select('field_tag, value')
        .eq('tenant_id', tenantId);

      if (viewError) {
        console.warn('Could not fetch merge field values:', viewError);
      }

      // Build a map of tag -> value
      const valueMap: Record<string, string> = {};
      (viewData || []).forEach((row) => {
        if (row.field_tag) valueMap[row.field_tag] = row.value || '';
      });

      setTenantMergeData(valueMap);

      // Filter definitions to only those needed for the document(s)
      let relevantDefinitions = (definitions || []) as unknown as MergeFieldDefinition[];
      if (documentMergeFields && documentMergeFields.length > 0) {
        relevantDefinitions = relevantDefinitions.filter((def) => {
          const code = `{{${def.tag}}}`;
          return documentMergeFields.includes(code) || documentMergeFields.includes(def.tag);
        });
      }

      // Find missing fields
      const missing: MissingField[] = [];
      
      relevantDefinitions.forEach((def) => {
        const value = valueMap[def.tag];
        const isEmpty = !value || value === '';
        
        if (isEmpty) {
          missing.push({
            code: `{{${def.tag}}}`,
            name: def.name,
            source_column: def.source_column || def.tag,
            inputType: getInputType(def.source_column || ''),
            required: requiredFields.includes(def.source_column || '')
          });
        }
      });

      setMissingFields(missing);
      return missing;
    } catch (error) {
      console.error('Error detecting missing fields:', error);
      toast({
        title: 'Error',
        description: 'Failed to detect missing fields',
        variant: 'destructive'
      });
      return [];
    } finally {
      setLoading(false);
    }
  }, [tenantId, toast]);

  // Save client-supplied data and notify CSC
  // Retry document generation
  const retryDocumentGeneration = useCallback(async (
    documentId: number,
    stageId: number,
    packageId: number
  ) => {
    if (!tenantId) return false;

    try {
      // Get client_legacy_id for this tenant (use limit 1 to avoid 406 on duplicates)
      const { data: clientData } = await supabase
        .from('clients_legacy')
        .select('id')
        .eq('tenant_id', tenantId)
        .order('created_at', { ascending: true })
        .limit(1)
        .maybeSingle();

      if (!clientData) {
        throw new Error('Client not found for this tenant');
      }

      const { data, error } = await supabase.functions.invoke('generate-document', {
        body: {
          document_id: documentId,
          tenant_id: tenantId,
          client_legacy_id: clientData.id,
          stage_id: stageId,
          package_id: packageId
        }
      });

      if (error) throw error;

      // Log retry to audit
      await supabase
        .from('client_audit_log')
        .insert({
          tenant_id: tenantId,
          actor_user_id: user?.id,
          action: 'document.autogen_retry',
          entity_type: 'document',
          entity_id: String(documentId),
          details: {
            stage_id: stageId,
            package_id: packageId,
            result: data.success ? 'success' : 'failed'
          }
        });

      if (data.success) {
        toast({
          title: 'Success',
          description: 'Document generated successfully'
        });
        return true;
      } else {
        throw new Error(data.error || 'Generation failed');
      }
    } catch (error) {
      console.error('Error retrying document generation:', error);
      toast({
        title: 'Generation Failed',
        description: error instanceof Error ? error.message : 'Failed to generate document',
        variant: 'destructive'
      });
      return false;
    }
  }, [tenantId, user, toast]);

  const saveMergeData = useCallback(async (
    data: Record<string, string>,
    options?: {
      retryGeneration?: boolean;
      documentId?: number;
      stageId?: number;
      packageId?: number;
    }
  ) => {
    if (!tenantId || !user) {
      toast({
        title: 'Error',
        description: 'User or tenant information not available',
        variant: 'destructive'
      });
      return false;
    }

    setLoading(true);
    try {
      // Upsert tenant_merge_data
      const mergedData = { ...tenantMergeData, ...data };
      
      const { error: upsertError } = await supabase
        .from('tenant_merge_data')
        .upsert({
          tenant_id: tenantId,
          data: mergedData,
          updated_by: user.id
        }, {
          onConflict: 'tenant_id'
        });

      if (upsertError) throw upsertError;

      // Internal notification for CSC — relocated to service-role edge function
      // (frontend can no longer insert user_notifications for other users post-Phase-3 RLS).
      const fieldNames = Object.keys(data);
      try {
        await supabase.functions.invoke("notify-merge-fields-updated", {
          body: { tenant_id: tenantId, field_names: fieldNames },
        });
      } catch (notifyErr) {
        // Preserve original silent behaviour — notification failure must not block save.
        console.warn("notify-merge-fields-updated invoke failed", notifyErr);
      }

      // Log to client_audit_log
      await supabase
        .from('client_audit_log')
        .insert({
          tenant_id: tenantId,
          actor_user_id: user.id,
          action: 'merge_data.submitted',
          entity_type: 'tenant_merge_data',
          entity_id: String(tenantId),
          details: {
            fields_updated: fieldNames,
            document_id: options?.documentId,
            stage_id: options?.stageId
          }
        });

      setTenantMergeData(mergedData);

      toast({
        title: 'Success',
        description: 'Information saved successfully'
      });

      // Retry document generation if requested
      if (options?.retryGeneration && options.documentId && options.packageId) {
        return await retryDocumentGeneration(
          options.documentId,
          options.stageId || 0,
          options.packageId
        );
      }

      return true;
    } catch (error) {
      console.error('Error saving merge data:', error);
      toast({
        title: 'Error',
        description: error instanceof Error ? error.message : 'Failed to save information',
        variant: 'destructive'
      });
      return false;
    } finally {
      setLoading(false);
    }
  }, [tenantId, user, tenantMergeData, toast, retryDocumentGeneration]);

  // Get current values for missing fields (for pre-filling form)
  const getCurrentValues = useCallback(async () => {
    if (!tenantId) return {};

    try {
      const { data } = await supabase
        .from('v_tenant_merge_fields')
        .select('field_tag, value')
        .eq('tenant_id', tenantId);

      const values: Record<string, string> = {};
      (data || []).forEach((row) => {
        if (row.field_tag) values[row.field_tag] = row.value || '';
      });
      return values;
    } catch (error) {
      console.error('Error getting current values:', error);
      return {};
    }
  }, [tenantId]);

  return {
    loading,
    missingFields,
    tenantMergeData,
    detectMissingFields,
    saveMergeData,
    retryDocumentGeneration,
    getCurrentValues
  };
}
