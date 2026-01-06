import { useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/use-toast';

export interface MergeFieldDefinition {
  id: string;
  code: string;
  name: string;
  source_column: string;
  description: string | null;
  is_system: boolean;
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
      // Fetch all active merge field definitions
      const { data: definitions, error: defError } = await supabase
        .from('merge_field_definitions')
        .select('*')
        .eq('is_active', true);

      if (defError) throw defError;

      // Get client_legacy data linked to this tenant
      const { data: clientData, error: clientError } = await supabase
        .from('clients_legacy')
        .select('*')
        .eq('tenant_id', tenantId)
        .single();

      if (clientError && clientError.code !== 'PGRST116') {
        console.warn('Could not fetch client data:', clientError);
      }

      // Get any existing tenant_merge_data
      const { data: mergeData, error: mergeError } = await (supabase
        .from('tenant_merge_data' as any)
        .select('*')
        .eq('tenant_id', tenantId)
        .single() as any);

      if (mergeError && mergeError.code !== 'PGRST116') {
        console.warn('Could not fetch merge data:', mergeError);
      }

      const existingMergeData = mergeData?.data || {};
      setTenantMergeData(existingMergeData);

      // Combine data sources - merge data takes priority over client data
      const combinedData: TenantData = { ...clientData, ...existingMergeData };

      // Filter definitions to only those needed for the document(s)
      let relevantDefinitions = definitions || [];
      if (documentMergeFields && documentMergeFields.length > 0) {
        relevantDefinitions = (definitions || []).filter((def: MergeFieldDefinition) =>
          documentMergeFields.includes(def.code)
        );
      }

      // Find missing fields
      const missing: MissingField[] = [];
      
      (relevantDefinitions as MergeFieldDefinition[]).forEach((def) => {
        const value = combinedData[def.source_column];
        const isEmpty = value === null || value === undefined || value === '';
        
        if (isEmpty) {
          missing.push({
            code: def.code,
            name: def.name,
            source_column: def.source_column,
            inputType: getInputType(def.source_column),
            required: requiredFields.includes(def.source_column)
          });
        }
      });

      setMissingFields(missing);
      return missing;
    } catch (error: any) {
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
      
      const { error: upsertError } = await (supabase
        .from('tenant_merge_data' as any)
        .upsert({
          tenant_id: tenantId,
          data: mergedData,
          updated_by: user.id
        }, {
          onConflict: 'tenant_id'
        }) as any);

      if (upsertError) throw upsertError;

      // Get tenant name for notification
      const { data: tenantData } = await supabase
        .from('tenants')
        .select('name')
        .eq('id', tenantId)
        .single();

      // Get assigned CSC user for this tenant
      const { data: clientData } = await supabase
        .from('clients_legacy')
        .select('manager')
        .eq('tenant_id', tenantId)
        .single();

      // Get CSC user ID if manager is set
      let cscUserId: string | null = null;
      if (clientData?.manager) {
        const { data: cscUser } = await supabase
          .from('users')
          .select('user_uuid')
          .or(`email.eq.${clientData.manager},full_name.eq.${clientData.manager}`)
          .single();
        cscUserId = cscUser?.user_uuid || null;
      }

      // Create internal notification for CSC
      const fieldNames = Object.keys(data);
      const notificationTitle = `${tenantData?.name || 'Client'} updated merge field information`;
      const notificationMessage = `Fields updated: ${fieldNames.join(', ')}`;

      // Use user_notifications table for internal notifications
      if (cscUserId) {
        await supabase
          .from('user_notifications')
          .insert({
            user_id: cscUserId,
            tenant_id: tenantId,
            type: 'merge_data_updated',
            title: notificationTitle,
            message: notificationMessage,
            link: `/clients/${tenantId}`,
            is_read: false,
            created_by: user.id
          });
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
    } catch (error: any) {
      console.error('Error saving merge data:', error);
      toast({
        title: 'Error',
        description: error.message || 'Failed to save information',
        variant: 'destructive'
      });
      return false;
    } finally {
      setLoading(false);
    }
  }, [tenantId, user, tenantMergeData, toast]);

  // Retry document generation
  const retryDocumentGeneration = useCallback(async (
    documentId: number,
    stageId: number,
    packageId: number
  ) => {
    if (!tenantId) return false;

    try {
      // Get client_legacy_id for this tenant
      const { data: clientData } = await supabase
        .from('clients_legacy')
        .select('id')
        .eq('tenant_id', tenantId)
        .single();

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
    } catch (error: any) {
      console.error('Error retrying document generation:', error);
      toast({
        title: 'Generation Failed',
        description: error.message || 'Failed to generate document',
        variant: 'destructive'
      });
      return false;
    }
  }, [tenantId, user, toast]);

  // Get current values for missing fields (for pre-filling form)
  const getCurrentValues = useCallback(async () => {
    if (!tenantId) return {};

    try {
      // Get client_legacy data
      const { data: clientData } = await supabase
        .from('clients_legacy')
        .select('*')
        .eq('tenant_id', tenantId)
        .single();

      // Get tenant_merge_data
      const { data: mergeData } = await (supabase
        .from('tenant_merge_data' as any)
        .select('data')
        .eq('tenant_id', tenantId)
        .single() as any);

      return { ...clientData, ...(mergeData?.data || {}) };
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
