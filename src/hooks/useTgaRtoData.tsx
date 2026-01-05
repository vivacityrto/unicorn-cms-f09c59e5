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

  const triggerSync = useCallback(async (): Promise<boolean> => {
    if (!tenantId) return false;

    try {
      setSyncing(true);

      // Call RPC to create job
      const { data, error } = await supabase.rpc('tga_trigger_sync', {
        p_tenant_id: tenantId
      });

      if (error) throw error;

      const result = data as { success: boolean; import_job_id: string; rto_number: string };

      if (!result.success) {
        throw new Error('Failed to trigger sync');
      }

      // Call edge function to run the import
      const { data: session } = await supabase.auth.getSession();
      const response = await supabase.functions.invoke('tga-rto-import', {
        body: {
          job_id: result.import_job_id,
          tenant_id: tenantId,
          rto_code: result.rto_number
        }
      });

      if (response.error) {
        throw new Error(response.error.message);
      }

      toast({
        title: 'TGA Sync Complete',
        description: 'Data has been imported from Training.gov.au'
      });

      await fetchData();
      return true;

    } catch (error: unknown) {
      console.error('Sync error:', error);
      toast({
        title: 'Sync Failed',
        description: error instanceof Error ? error.message : 'Unknown error',
        variant: 'destructive'
      });
      return false;
    } finally {
      setSyncing(false);
    }
  }, [tenantId, fetchData, toast]);

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
