import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

export interface TGASummary {
  id: string;
  tenant_id: number;
  rto_code: string;
  legal_name: string | null;
  trading_name: string | null;
  organisation_type: string | null;
  abn: string | null;
  status: string | null;
  registration_start_date: string | null;
  registration_end_date: string | null;
  fetched_at: string;
}

export interface TGAContact {
  id: string;
  contact_type: string | null;
  name: string | null;
  position: string | null;
  phone: string | null;
  email: string | null;
}

export interface TGAAddress {
  id: string;
  address_type: string;
  address_line_1: string | null;
  address_line_2: string | null;
  suburb: string | null;
  state: string | null;
  postcode: string | null;
  country: string | null;
  phone: string | null;
  email: string | null;
  website: string | null;
}

export interface TGADeliveryLocation {
  id: string;
  location_name: string | null;
  address_line_1: string | null;
  suburb: string | null;
  state: string | null;
  postcode: string | null;
}

export interface TGAQualification {
  id: string;
  qualification_code: string;
  qualification_title: string | null;
  training_package_code: string | null;
  status: string | null;
  is_current: boolean;
}

export interface TGASkillset {
  id: string;
  skillset_code: string;
  skillset_title: string | null;
  training_package_code: string | null;
  status: string | null;
  is_current: boolean;
}

export interface TGAUnit {
  id: string;
  unit_code: string;
  unit_title: string | null;
  training_package_code: string | null;
  status: string | null;
  is_current: boolean;
}

export interface TGACourse {
  id: string;
  course_code: string;
  course_title: string | null;
  status: string | null;
  is_current: boolean;
}

export interface TGAImportJob {
  id: string;
  status: string;
  job_type: string;
  started_at: string | null;
  completed_at: string | null;
  qualifications_count: number;
  skillsets_count: number;
  units_count: number;
  courses_count: number;
  error_message: string | null;
}

export function useTgaRtoData(tenantId: number | null, rtoCode: string | null) {
  const [summary, setSummary] = useState<TGASummary | null>(null);
  const [contacts, setContacts] = useState<TGAContact[]>([]);
  const [addresses, setAddresses] = useState<TGAAddress[]>([]);
  const [deliveryLocations, setDeliveryLocations] = useState<TGADeliveryLocation[]>([]);
  const [qualifications, setQualifications] = useState<TGAQualification[]>([]);
  const [skillsets, setSkillsets] = useState<TGASkillset[]>([]);
  const [units, setUnits] = useState<TGAUnit[]>([]);
  const [courses, setCourses] = useState<TGACourse[]>([]);
  const [latestJob, setLatestJob] = useState<TGAImportJob | null>(null);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const { toast } = useToast();

  const fetchData = useCallback(async () => {
    if (!tenantId || !rtoCode) {
      setLoading(false);
      return;
    }

    try {
      setLoading(true);

      const [
        summaryRes,
        contactsRes,
        addressesRes,
        locationsRes,
        qualsRes,
        skillsRes,
        unitsRes,
        coursesRes,
        jobRes
      ] = await Promise.all([
        supabase.from('tga_rto_summary').select('*').eq('tenant_id', tenantId).eq('rto_code', rtoCode).maybeSingle(),
        supabase.from('tga_rto_contacts').select('*').eq('tenant_id', tenantId).eq('rto_code', rtoCode),
        supabase.from('tga_rto_addresses').select('*').eq('tenant_id', tenantId).eq('rto_code', rtoCode),
        supabase.from('tga_rto_delivery_locations').select('*').eq('tenant_id', tenantId).eq('rto_code', rtoCode),
        supabase.from('tga_scope_qualifications').select('*').eq('tenant_id', tenantId).eq('rto_code', rtoCode).order('qualification_code'),
        supabase.from('tga_scope_skillsets').select('*').eq('tenant_id', tenantId).eq('rto_code', rtoCode).order('skillset_code'),
        supabase.from('tga_scope_units').select('*').eq('tenant_id', tenantId).eq('rto_code', rtoCode).order('unit_code'),
        supabase.from('tga_scope_courses').select('*').eq('tenant_id', tenantId).eq('rto_code', rtoCode).order('course_code'),
        supabase.from('tga_rto_import_jobs').select('*').eq('tenant_id', tenantId).eq('rto_code', rtoCode).order('created_at', { ascending: false }).limit(1).maybeSingle()
      ]);

      setSummary(summaryRes.data);
      setContacts(contactsRes.data || []);
      setAddresses(addressesRes.data || []);
      setDeliveryLocations(locationsRes.data || []);
      setQualifications(qualsRes.data || []);
      setSkillsets(skillsRes.data || []);
      setUnits(unitsRes.data || []);
      setCourses(coursesRes.data || []);
      setLatestJob(jobRes.data);

    } catch (error: unknown) {
      console.error('Error fetching TGA data:', error);
    } finally {
      setLoading(false);
    }
  }, [tenantId, rtoCode]);

  const triggerSync = useCallback(async (): Promise<{ success: boolean; error?: string; correlationId?: string; stage?: string }> => {
    if (!tenantId || !rtoCode) {
      return { success: false, error: 'Missing tenant or RTO code' };
    }

    try {
      setSyncing(true);

      // Call RPC to create job
      const { data, error } = await supabase.rpc('tga_trigger_sync', {
        p_tenant_id: tenantId
      });

      if (error) {
        console.error('RPC error:', error);
        toast({
          title: 'Sync Failed',
          description: error.message,
          variant: 'destructive'
        });
        return { success: false, error: error.message };
      }

      const result = data as { success: boolean; import_job_id: string; rto_number: string };

      if (!result.success) {
        toast({
          title: 'Sync Failed',
          description: 'Failed to trigger sync job',
          variant: 'destructive'
        });
        return { success: false, error: 'Failed to trigger sync job' };
      }

      // Call edge function to run the import
      const { data: session } = await supabase.auth.getSession();
      const response = await supabase.functions.invoke('tga-rto-import', {
        body: {
          job_id: result.import_job_id,
          tenant_id: tenantId,
          rto_code: result.rto_number
        },
        headers: {
          Authorization: `Bearer ${session?.session?.access_token}`
        }
      });

      // Handle edge function transport error
      if (response.error) {
        console.error('Edge function error:', response.error);
        
        // Try to extract structured error from response
        const errorData = response.data || {};
        const stage = errorData.stage || 'unknown';
        const correlationId = errorData.correlation_id;
        const message = errorData.message || response.error.message || 'Edge function error';
        const hint = errorData.details?.hint;
        
        toast({
          title: 'Import Failed',
          description: (
            <div className="space-y-1">
              <p>{message}</p>
              {stage !== 'unknown' && <p className="text-xs text-muted-foreground">Stage: {stage}</p>}
              {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
              {correlationId && (
                <button 
                  onClick={() => {
                    navigator.clipboard.writeText(correlationId);
                  }}
                  className="text-xs underline text-muted-foreground hover:text-foreground"
                >
                  Copy ref: {correlationId}
                </button>
              )}
            </div>
          ) as unknown as string,
          variant: 'destructive'
        });
        return { success: false, error: message, correlationId, stage };
      }

      // Check if the edge function returned a structured error (ok: false)
      if (response.data?.ok === false) {
        const { stage, message, correlation_id, error_code, details } = response.data;
        console.error('Import error:', message, `stage=${stage}`, correlation_id ? `(${correlation_id})` : '');
        
        toast({
          title: 'Import Failed',
          description: (
            <div className="space-y-1">
              <p>{message}</p>
              {stage && <p className="text-xs text-muted-foreground">Stage: {stage}</p>}
              {error_code && <p className="text-xs text-muted-foreground">Error: {error_code}</p>}
              {details?.hint && <p className="text-xs text-muted-foreground">{details.hint}</p>}
              {correlation_id && (
                <button 
                  onClick={() => {
                    navigator.clipboard.writeText(correlation_id);
                  }}
                  className="text-xs underline text-muted-foreground hover:text-foreground"
                >
                  Copy ref: {correlation_id}
                </button>
              )}
            </div>
          ) as unknown as string,
          variant: 'destructive'
        });
        return { success: false, error: message, correlationId: correlation_id, stage };
      }

      // Legacy error check (error field without ok field)
      if (response.data?.error && response.data?.ok === undefined) {
        const errorMsg = response.data.message || response.data.error;
        const corrId = response.data.correlation_id;
        console.error('Import error:', errorMsg, corrId ? `(${corrId})` : '');
        toast({
          title: 'Import Failed',
          description: corrId ? `${errorMsg} (Ref: ${corrId})` : errorMsg,
          variant: 'destructive'
        });
        return { success: false, error: errorMsg, correlationId: corrId };
      }

      // Success!
      const imported = response.data?.imported;
      const summaryText = imported 
        ? `Imported ${imported.qualifications || 0} qualifications, ${imported.contacts || 0} contacts`
        : 'Data has been imported from Training.gov.au';
      
      toast({
        title: 'TGA Sync Complete',
        description: summaryText
      });

      await fetchData();
      return { success: true };

    } catch (error: unknown) {
      console.error('Sync error:', error);
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';
      toast({
        title: 'Sync Failed',
        description: errorMsg,
        variant: 'destructive'
      });
      return { success: false, error: errorMsg };
    } finally {
      setSyncing(false);
    }
  }, [tenantId, rtoCode, fetchData, toast]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const hasData = summary !== null || qualifications.length > 0;

  return {
    summary,
    contacts,
    addresses,
    deliveryLocations,
    qualifications,
    skillsets,
    units,
    courses,
    latestJob,
    loading,
    syncing,
    hasData,
    triggerSync,
    refresh: fetchData
  };
}
