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
  acn: string | null;
  status: string | null;
  web_address: string | null;
  initial_registration_date: string | null;
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
  address_line_2: string | null;
  suburb: string | null;
  state: string | null;
  postcode: string | null;
  country: string | null;
}

export interface TGAQualification {
  id: string;
  qualification_code: string;
  qualification_title: string | null;
  training_package_code: string | null;
  status: string | null;
  status_label: string | null;
  is_current: boolean;
  start_date: string | null;
  end_date: string | null;
  extent_label: string | null;
}

export interface TGASkillset {
  id: string;
  skillset_code: string;
  skillset_title: string | null;
  training_package_code: string | null;
  status: string | null;
  status_label: string | null;
  is_current: boolean;
  start_date: string | null;
  end_date: string | null;
  extent_label: string | null;
}

export interface TGAUnit {
  id: string;
  unit_code: string;
  unit_title: string | null;
  training_package_code: string | null;
  status: string | null;
  status_label: string | null;
  is_current: boolean;
  start_date: string | null;
  end_date: string | null;
  extent_label: string | null;
}

export interface TGACourse {
  id: string;
  course_code: string;
  course_title: string | null;
  status: string | null;
  status_label: string | null;
  is_current: boolean;
  start_date: string | null;
  end_date: string | null;
  extent_label: string | null;
}

export interface TGATrainingPackage {
  id: string;
  package_code: string;
  package_title: string | null;
  status: string | null;
  status_label: string | null;
  is_current: boolean;
  start_date: string | null;
  end_date: string | null;
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
  const [trainingPackages, setTrainingPackages] = useState<TGATrainingPackage[]>([]);
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
              acn: null,
              status: typedData.rto_data.status,
              web_address: typedData.rto_data.website,
              initial_registration_date: null,
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
                  status_label: item.status || null,
                  is_current: item.status === 'current',
                  start_date: null,
                  end_date: null,
                  extent_label: null,
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
                  status_label: item.status || null,
                  is_current: item.status === 'current',
                  start_date: null,
                  end_date: null,
                  extent_label: null,
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
                  status_label: item.status || null,
                  is_current: item.status === 'current',
                  start_date: null,
                  end_date: null,
                  extent_label: null,
                }));
              setSkillsets(skillItems);

              const courseItems = typedData.scope_items
                .filter(item => item.type === 'accredited_course' || item.type === 'short_course')
                .map((item, idx) => ({
                  id: `course-${idx}`,
                  course_code: item.code,
                  course_title: item.title,
                  status: item.status,
                  status_label: item.status || null,
                  is_current: item.status === 'current',
                  start_date: null,
                  end_date: null,
                  extent_label: null,
                }));
              setCourses(courseItems);
            }
          }
        }
      } else {
        // Fetch from NEW unified table (tenant_rto_scope) + legacy summary/contacts tables
        const [
          summaryRes,
          contactsRes,
          addressesRes,
          locationsRes,
          scopeRes,
          jobRes
        ] = await Promise.all([
          supabase.from('tga_rto_summary').select('*').eq('tenant_id', tenantId).eq('rto_code', rtoCode).maybeSingle(),
          supabase.from('tga_rto_contacts').select('*').eq('tenant_id', tenantId).eq('rto_code', rtoCode),
          supabase.from('tga_rto_addresses').select('*').eq('tenant_id', tenantId).eq('rto_code', rtoCode),
          supabase.from('tga_rto_delivery_locations').select('*').eq('tenant_id', tenantId).eq('rto_code', rtoCode),
          // NEW: Fetch from unified tenant_rto_scope table
          supabase.from('tenant_rto_scope').select('*').eq('tenant_id', tenantId).order('code'),
          supabase.from('tga_rest_sync_jobs').select('*').eq('tenant_id', tenantId).eq('rto_id', rtoCode).order('created_at', { ascending: false }).limit(1).maybeSingle()
        ]);

        setSummary(summaryRes.data as TGASummary | null);
        setContacts((contactsRes.data || []) as TGAContact[]);
        setAddresses((addressesRes.data || []) as TGAAddress[]);
        setDeliveryLocations((locationsRes.data || []) as TGADeliveryLocation[]);
        
        // Map unified scope data to legacy format
        const scopeItems = scopeRes.data || [];
        // Show items based on TGA status, not endDate (endDate is metadata, not expiry)
        const isOnScope = (item: any) => {
          const status = (item.status || '').toLowerCase();
          return status === 'current' || status === 'superseded';
        };
        
        const quals = scopeItems
          .filter((item: any) => item.scope_type === 'qualification' && isOnScope(item))
          .map((item: any) => ({
            id: item.id,
            qualification_code: item.code,
            qualification_title: item.title,
            training_package_code: item.tga_data?.trainingPackageCode || null,
            status: item.status,
            status_label: item.tga_data?.statusLabel || item.status || null,
            is_current: item.status === 'Current' || item.status === 'current',
            start_date: item.tga_data?.startDate || null,
            end_date: item.tga_data?.endDate || null,
            extent_label: item.tga_data?.extentLabel || null,
          }));
        setQualifications(quals);

        const unitItems = scopeItems
          .filter((item: any) => item.scope_type === 'unit' && isOnScope(item))
          .map((item: any) => ({
            id: item.id,
            unit_code: item.code,
            unit_title: item.title,
            training_package_code: item.tga_data?.trainingPackageCode || null,
            status: item.status,
            status_label: item.tga_data?.statusLabel || item.status || null,
            is_current: item.status === 'Current' || item.status === 'current',
            start_date: item.tga_data?.startDate || null,
            end_date: item.tga_data?.endDate || null,
            extent_label: item.tga_data?.extentLabel || null,
          }));
        setUnits(unitItems);

        const skillItems = scopeItems
          .filter((item: any) => item.scope_type === 'skillset' && isOnScope(item))
          .map((item: any) => ({
            id: item.id,
            skillset_code: item.code,
            skillset_title: item.title,
            training_package_code: item.tga_data?.trainingPackageCode || null,
            status: item.status,
            status_label: item.tga_data?.statusLabel || item.status || null,
            is_current: item.status === 'Current' || item.status === 'current',
            start_date: item.tga_data?.startDate || null,
            end_date: item.tga_data?.endDate || null,
            extent_label: item.tga_data?.extentLabel || null,
          }));
        setSkillsets(skillItems);

        const courseItems = scopeItems
          .filter((item: any) => item.scope_type === 'accreditedCourse' && isOnScope(item))
          .map((item: any) => ({
            id: item.id,
            course_code: item.code,
            course_title: item.title,
            status: item.status,
            status_label: item.tga_data?.statusLabel || item.status || null,
            is_current: item.status === 'Current' || item.status === 'current',
            start_date: item.tga_data?.startDate || null,
            end_date: item.tga_data?.endDate || null,
            extent_label: item.tga_data?.extentLabel || null,
          }));
        setCourses(courseItems);

        const tpItems = scopeItems
          .filter((item: any) => item.scope_type === 'trainingPackage' && isOnScope(item))
          .map((item: any) => ({
            id: item.id,
            package_code: item.code,
            package_title: item.title,
            status: item.status,
            status_label: item.tga_data?.statusLabel || item.status || null,
            is_current: item.status === 'Current' || item.status === 'current',
            start_date: item.tga_data?.startDate || null,
            end_date: item.tga_data?.endDate || null,
          }));
        setTrainingPackages(tpItems);
        
        // Map job to legacy format
        if (jobRes.data) {
          const job = jobRes.data as any;
          const payload = job.payload || {};
          setLatestJob({
            id: job.id,
            status: job.status,
            job_type: 'rest_sync',
            started_at: payload.started_at || job.created_at,
            completed_at: payload.completed_at || job.updated_at,
            qualifications_count: payload.scope_counts?.qualification || 0,
            skillsets_count: payload.scope_counts?.skillSet || 0,
            units_count: payload.scope_counts?.unit || 0,
            courses_count: payload.scope_counts?.accreditedCourse || 0,
            error_message: job.last_error,
          });
        } else {
          setLatestJob(null);
        }
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

    // Check tenant status first
    const { data: tenantData } = await supabase
      .from('tenants')
      .select('id, status, metadata')
      .eq('id', tenantId)
      .single();

    if (!tenantData) {
      return { success: false, error: `Tenant ${tenantId} not found` };
    }

    if (tenantData.status === 'inactive') {
      const metadata = tenantData.metadata as Record<string, unknown> | null;
      if (metadata?.merged_into) {
        return { 
          success: false, 
          error: `This tenant was merged into tenant ${metadata.merged_into}. Please use that tenant instead.` 
        };
      }
      return { success: false, error: 'This tenant is inactive' };
    }

    // Get rto_number from tenant_profile if not passed
    let effectiveRtoCode = rtoCode;
    if (!effectiveRtoCode) {
      const { data: profile } = await supabase
        .from('tenant_profile')
        .select('rto_number')
        .eq('tenant_id', tenantId)
        .single();
      
      effectiveRtoCode = profile?.rto_number || null;
    }

    if (!effectiveRtoCode) {
      return { success: false, error: `Tenant ${tenantId} has no RTO number configured. Set it in tenant profile first.` };
    }

    try {
      setSyncing(true);

      // Call the REST-based sync function (writes to tenant_rto_scope)
      const { data: liveData, error: fnError } = await supabase.functions.invoke('tga-rto-sync', {
        body: {
          tenantId: tenantId,
          rtoId: effectiveRtoCode,
        },
      });

      if (fnError) {
        toast({
          title: 'Sync Failed',
          description: fnError.message || 'Edge function error',
          variant: 'destructive'
        });
        return { success: false, error: fnError.message };
      }

      if (liveData?.success) {
        const counts = liveData.counts || {};
        const countParts = [
          counts.qualification && `${counts.qualification} quals`,
          counts.skillSet && `${counts.skillSet} skill sets`,
          counts.unit && `${counts.unit} units`,
          counts.accreditedCourse && `${counts.accreditedCourse} courses`,
        ].filter(Boolean).join(', ');
        
        toast({
          title: 'TGA Sync Complete',
          description: countParts || `Synced data for RTO ${effectiveRtoCode}`,
        });
        await fetchData();
        return { success: true, correlationId: liveData.job_id };
      } else {
        toast({
          title: 'Sync Failed',
          description: liveData?.error || 'Failed to sync from TGA',
          variant: 'destructive'
        });
        return { success: false, error: liveData?.error };
      }
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
    trainingPackages,
    latestJob,
    loading,
    syncing,
    hasData,
    triggerSync,
    refresh: fetchData
  };
}
