import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

// Types for the new TGA data model
export interface TGARtoData {
  legal_name: string | null;
  trading_name: string | null;
  abn: string | null;
  status: string | null;
  registration_start: string | null;
  registration_end: string | null;
  phone: string | null;
  email: string | null;
  website: string | null;
  address: Record<string, unknown> | null;
}

export interface TGASnapshot {
  scope_total: number;
  quals_total: number;
  units_total: number;
  skill_sets_total: number;
  last_sync_at: string | null;
  import_id: string | null;
}

export interface TGAScopeItem {
  code: string;
  type: string;
  title: string | null;
  status: string | null;
}

export interface TGAClientData {
  linked: boolean;
  link_status: string;
  rto_number?: string;
  last_sync_at?: string;
  last_sync_status?: string;
  rto_data?: TGARtoData;
  snapshot?: TGASnapshot;
  scope_items?: TGAScopeItem[];
}

// Legacy types for backwards compatibility
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

export function useTgaRtoData(tenantId: number | null, rtoCode: string | null, clientId?: string | null) {
  const [clientData, setClientData] = useState<TGAClientData | null>(null);
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
    if (!clientId && (!tenantId || !rtoCode)) {
      setLoading(false);
      return;
    }

    try {
      setLoading(true);

      // If we have a clientId, use the new RPC function
      if (clientId) {
        const { data, error } = await supabase.rpc('tga_get_client_data', {
          p_client_id: clientId
        });

        if (error) {
          console.error('Error fetching TGA data via RPC:', error);
        } else if (data) {
          const typedData = data as unknown as TGAClientData;
          setClientData(typedData);
          
          // Map to legacy format for backwards compatibility
          if (typedData.linked && typedData.rto_data) {
            setSummary({
              id: clientId,
              tenant_id: tenantId || 0,
              rto_code: typedData.rto_number || rtoCode || '',
              legal_name: typedData.rto_data.legal_name,
              trading_name: typedData.rto_data.trading_name,
              organisation_type: null,
              abn: typedData.rto_data.abn,
              status: typedData.rto_data.status,
              registration_start_date: typedData.rto_data.registration_start,
              registration_end_date: typedData.rto_data.registration_end,
              fetched_at: typedData.last_sync_at || new Date().toISOString(),
            });

            // Map scope items to qualifications/units/skillsets
            if (typedData.scope_items) {
              const quals = typedData.scope_items
                .filter(item => item.type === 'qualification')
                .map((item, idx) => ({
                  id: `qual-${idx}`,
                  qualification_code: item.code,
                  qualification_title: item.title,
                  training_package_code: null,
                  status: item.status,
                  is_current: item.status === 'current',
                }));
              setQualifications(quals);

              const unitItems = typedData.scope_items
                .filter(item => item.type === 'unit')
                .map((item, idx) => ({
                  id: `unit-${idx}`,
                  unit_code: item.code,
                  unit_title: item.title,
                  training_package_code: null,
                  status: item.status,
                  is_current: item.status === 'current',
                }));
              setUnits(unitItems);

              const skillItems = typedData.scope_items
                .filter(item => item.type === 'skill_set')
                .map((item, idx) => ({
                  id: `skill-${idx}`,
                  skillset_code: item.code,
                  skillset_title: item.title,
                  training_package_code: null,
                  status: item.status,
                  is_current: item.status === 'current',
                }));
              setSkillsets(skillItems);

              const courseItems = typedData.scope_items
                .filter(item => item.type === 'accredited_course' || item.type === 'short_course')
                .map((item, idx) => ({
                  id: `course-${idx}`,
                  course_code: item.code,
                  course_title: item.title,
                  status: item.status,
                  is_current: item.status === 'current',
                }));
              setCourses(courseItems);
            }
          }
        }
      } else {
        // Fallback to legacy table queries for backwards compatibility
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

        setSummary(summaryRes.data as TGASummary | null);
        setContacts((contactsRes.data || []) as TGAContact[]);
        setAddresses((addressesRes.data || []) as TGAAddress[]);
        setDeliveryLocations((locationsRes.data || []) as TGADeliveryLocation[]);
        setQualifications((qualsRes.data || []) as TGAQualification[]);
        setSkillsets((skillsRes.data || []) as TGASkillset[]);
        setUnits((unitsRes.data || []) as TGAUnit[]);
        setCourses((coursesRes.data || []) as TGACourse[]);
        setLatestJob(jobRes.data as TGAImportJob | null);
      }
    } catch (error: unknown) {
      console.error('Error fetching TGA data:', error);
    } finally {
      setLoading(false);
    }
  }, [tenantId, rtoCode, clientId]);

  const triggerSync = useCallback(async (): Promise<{ success: boolean; error?: string; correlationId?: string; stage?: string }> => {
    if (!tenantId) {
      return { success: false, error: 'Missing tenant ID' };
    }

    try {
      setSyncing(true);

      // Get client_id for this tenant first (use limit 1 to avoid 406 on duplicates)
      const { data: clientData } = await supabase
        .from('clients_legacy')
        .select('id')
        .eq('tenant_id', tenantId)
        .order('created_at', { ascending: true })
        .limit(1)
        .maybeSingle();

      // If we have a client and rto code, call the live sync edge function directly
      // This bypasses the RPC which relies on pre-imported dataset
      if (clientData?.id && rtoCode) {
        console.log('Calling tga-sync edge function for live SOAP sync...', { 
          client_id: clientData.id, 
          rto_number: rtoCode, 
          tenant_id: tenantId 
        });

        // Use supabase.functions.invoke with action in body (not header) to avoid CORS issues
        const { data: liveData, error: fnError } = await supabase.functions.invoke('tga-sync', {
          body: {
            action: 'sync-client',
            client_id: clientData.id,
            rto_number: rtoCode,
            tenant_id: tenantId.toString(),
          },
        });

        if (fnError) {
          console.error('Edge function error:', fnError);
          toast({
            title: 'Sync Failed',
            description: fnError.message || 'Edge function error',
            variant: 'destructive'
          });
          return { success: false, error: fnError.message };
        }

        console.log('Live sync response:', liveData);

        if (liveData?.success) {
          toast({
            title: 'TGA Sync Complete',
            description: `Synced live data for RTO ${rtoCode}: ${liveData.rto_data?.legal_name || liveData.rto_data?.legalName || 'Success'}`,
          });
          await fetchData();
          return { success: true };
        } else {
          toast({
            title: 'Sync Failed',
            description: liveData?.error || 'Failed to sync from TGA',
            variant: 'destructive'
          });
          return { success: false, error: liveData?.error };
        }
      }

      // Fallback: try the RPC function for local dataset sync
      const { data, error } = await supabase.rpc('tga_sync_tenant', {
        p_tenant_id: tenantId,
        p_rto_number: rtoCode
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

      const result = data as unknown as { 
        success: boolean; 
        error?: string;
        rto_number?: string;
        rto_data?: TGARtoData;
        scope_counts?: {
          total: number;
          qualifications: number;
          units: number;
          skill_sets: number;
        };
      };

      if (!result.success) {
        toast({
          title: 'Sync Failed',
          description: result.error || 'Failed to sync TGA data',
          variant: 'destructive'
        });
        return { success: false, error: result.error };
      }

      // Success!
      const counts = result.scope_counts;
      const summaryText = counts
        ? `Synced: ${counts.qualifications} quals, ${counts.units} units, ${counts.skill_sets} skill sets`
        : 'Data has been synced from TGA dataset';

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

  const hasData = summary !== null || qualifications.length > 0 || (clientData?.linked && clientData?.snapshot);

  return {
    clientData,
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
