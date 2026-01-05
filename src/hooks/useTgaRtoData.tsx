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

      // Call edge function to run the import (use fetch so we can read body text on non-2xx)
      const { data: session } = await supabase.auth.getSession();
      const accessToken = session?.session?.access_token;

      if (!accessToken) {
        toast({
          title: 'Import Failed',
          description: 'Missing session token',
          variant: 'destructive'
        });
        return { success: false, error: 'Missing session token' };
      }

      const FUNCTION_URL = 'https://yxkgdalkbrriasiyyrwk.supabase.co/functions/v1/tga-rto-import';
      const ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inl4a2dkYWxrYnJyaWFzaXl5cndrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDc2MjQwMzEsImV4cCI6MjA2MzIwMDAzMX0.bBFTaO-6Afko1koQqx-PWdzl2mu5qmE0xWNTvneqyqY';

      const res = await fetch(FUNCTION_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          apikey: ANON_KEY,
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({
          job_id: result.import_job_id,
          tenant_id: tenantId,
          rto_code: result.rto_number,
        }),
      });

      const text = await res.text();
      let parsed: any = null;
      try {
        parsed = text ? JSON.parse(text) : null;
      } catch {
        parsed = null;
      }

       if (!res.ok) {
         const stage = parsed?.stage as string | undefined;
         const correlationId = parsed?.correlation_id as string | undefined;

         const message =
           stage === 'soap.endpoint_not_found'
             ? 'TGA endpoint misconfigured. Contact support.'
             : parsed?.message || parsed?.error || res.statusText || 'Request failed';

         const snippet = !parsed && text ? text.slice(0, 300) : undefined;

         toast({
           title: 'Import Failed',
           description: (
             <div className="space-y-1">
               <p>{message}</p>
               {stage && <p className="text-xs text-muted-foreground">Stage: {stage}</p>}
               {correlationId && (
                 <button
                   onClick={() => navigator.clipboard.writeText(correlationId)}
                   className="text-xs underline text-muted-foreground hover:text-foreground"
                 >
                   Copy ref: {correlationId}
                 </button>
               )}
               {snippet && <p className="text-xs text-muted-foreground">{snippet}</p>}
             </div>
           ),
           variant: 'destructive'
         });

         return { success: false, error: message, correlationId, stage };
       }

      if (parsed?.ok === false) {
        const message = parsed.message || 'Import failed';
        const stage = parsed.stage;
        const correlationId = parsed.correlation_id;
        toast({
          title: 'Import Failed',
          description: (
            <div className="space-y-1">
              <p>{message}</p>
              {stage && <p className="text-xs text-muted-foreground">Stage: {stage}</p>}
              {correlationId && (
                <button
                  onClick={() => navigator.clipboard.writeText(correlationId)}
                  className="text-xs underline text-muted-foreground hover:text-foreground"
                >
                  Copy ref: {correlationId}
                </button>
              )}
            </div>
          ),
          variant: 'destructive'
        });
        return { success: false, error: message, correlationId, stage };
      }

      // Success!
      const imported = parsed?.imported;
      const summaryText = imported
        ? `Imported: org ${imported.summary || 0}, contacts ${imported.contacts || 0}, quals ${imported.qualifications || 0}, units ${imported.units || 0}`
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
