import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { VIVACITY_TENANT_ID } from '@/hooks/useVivacityTeamUsers';
import type { RockLevel } from '@/types/eos';
import type { ParentCandidate } from '@/utils/rockEditor/types';
import type { StoredLink, StoredMilestone } from '@/utils/rockEditor/fromRock';

export interface EditorRock extends ParentCandidate {
  archived: boolean;
}

export interface CompanyMilestoneOption {
  id: string;
  title: string;
  status: string;
  dueDate: string | null;
}

/** Every Rock in the Vivacity tenant, lightly shaped. Shared by the editor, the blocker dependency picker and the carryover destination picker. */
export function useEditorRocks(enabled: boolean) {
  return useQuery({
    queryKey: ['eos-rock-editor-rocks', VIVACITY_TENANT_ID],
    queryFn: async (): Promise<EditorRock[]> => {
      const { data, error } = await supabase
        .from('eos_rocks')
        .select('id, title, rock_level, quarter_year, quarter_number, owner_id, archived_at, parent_rock_id, client_tenant_id')
        .eq('tenant_id', VIVACITY_TENANT_ID)
        .order('title');
      if (error) throw error;
      return (data || []).map(row => ({
        id: row.id,
        title: row.title,
        level: (row.rock_level || 'company') as RockLevel,
        quarterYear: row.quarter_year ?? 0,
        quarterNumber: row.quarter_number ?? 0,
        ownerId: row.owner_id,
        archived: !!row.archived_at,
        parentId: row.parent_rock_id,
        clientTenantId: row.client_tenant_id ?? null,
      }));
    },
    enabled,
    staleTime: 30 * 1000,
  });
}

/**
 * What the Rock editor needs to know about everything else: every Rock (to pick a
 * parent and spot duplicates), the teams, and the Company milestones an Individual
 * Rock's milestones can support.
 */
export function useRockEditorData(options: {
  enabled: boolean;
  level: RockLevel;
  parentId: string | null;
  /** Editing: the saved Rock whose milestones, links and client are needed. */
  rockId?: string | null;
  /** Editing: the saved Rock's level, which decides whether it has links to load. The form's own level is not known until it is filled. */
  savedLevel?: RockLevel | null;
  clientTenantId?: number | null;
}) {
  const { profile } = useAuth();
  const enabled = !!profile && options.enabled;

  const rocksQuery = useEditorRocks(enabled);

  const functionsQuery = useQuery({
    queryKey: ['accountability-functions-for-rocks', VIVACITY_TENANT_ID],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('accountability_functions')
        .select('id, name')
        .eq('tenant_id', VIVACITY_TENANT_ID)
        .order('sort_order', { ascending: true });
      if (error) throw error;
      return data;
    },
    enabled,
    staleTime: 5 * 60 * 1000,
  });

  const rocks = rocksQuery.data;
  /** The Company Rock an Individual Rock ultimately serves, directly or through a Team Rock. */
  const companyRootId = useMemo(() => {
    if (options.level !== 'individual' || !options.parentId || !rocks) return null;
    const parent = rocks.find(r => r.id === options.parentId);
    if (parent?.level === 'company') return parent.id;
    if (parent?.level === 'team') {
      const grand = rocks.find(r => r.id === parent.parentId);
      return grand?.level === 'company' ? grand.id : null;
    }
    return null;
  }, [options.level, options.parentId, rocks]);

  const companyMilestonesQuery = useQuery({
    queryKey: ['eos-rock-company-milestones', companyRootId],
    queryFn: async (): Promise<CompanyMilestoneOption[]> => {
      const { data, error } = await supabase
        .from('eos_rock_milestones')
        .select('id, title, status, due_date')
        .eq('rock_id', companyRootId as string)
        .order('sort_order', { ascending: true });
      if (error) throw error;
      return (data || []).map(m => ({ id: m.id, title: m.title, status: m.status, dueDate: m.due_date }));
    },
    enabled: enabled && !!companyRootId,
  });

  const rockId = options.rockId ?? null;
  const milestonesQuery = useQuery({
    queryKey: ['eos-rock-editor-milestones', rockId],
    queryFn: async (): Promise<StoredMilestone[]> => {
      const { data, error } = await supabase
        .from('eos_rock_milestones')
        .select('id, title, owner_id, due_date, priority, status, exit_criteria, evidence_url')
        .eq('rock_id', rockId as string)
        .order('sort_order', { ascending: true });
      if (error) throw error;
      return data || [];
    },
    enabled: enabled && !!rockId,
    // The form is filled from this once, so it must be what the database holds now, never a cached copy.
    staleTime: 0,
    gcTime: 0,
    refetchOnMount: 'always',
  });
  const milestoneIds = useMemo(() => (milestonesQuery.data || []).map(m => m.id), [milestonesQuery.data]);

  const needsLinks = !!rockId && (options.savedLevel ?? options.level) === 'individual' && milestoneIds.length > 0;

  const linksQuery = useQuery({
    queryKey: ['eos-rock-editor-links', rockId, milestoneIds],
    queryFn: async (): Promise<StoredLink[]> => {
      const { data, error } = await supabase
        .from('eos_rock_milestone_links')
        .select('company_milestone_id, individual_milestone_id')
        .in('individual_milestone_id', milestoneIds);
      if (error) throw error;
      return data || [];
    },
    enabled: enabled && needsLinks,
    staleTime: 0,
    gcTime: 0,
    refetchOnMount: 'always',
  });

  const clientQuery = useQuery({
    queryKey: ['eos-rock-editor-client', options.clientTenantId],
    queryFn: async () => {
      const { data, error } = await supabase.from('tenants').select('id, name').eq('id', options.clientTenantId as number).maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: enabled && options.clientTenantId != null,
    staleTime: 5 * 60 * 1000,
  });

  return {
    savedMilestones: milestonesQuery.data ?? [],
    savedLinks: linksQuery.data ?? [],
    /** Everything a saved Rock needs has arrived. */
    editDataReady: !rockId || (
      !!rocks
      && milestonesQuery.isSuccess && !milestonesQuery.isFetching
      && (!needsLinks || (linksQuery.isSuccess && !linksQuery.isFetching))
    ),
    editDataError: (milestonesQuery.error as Error | null) ?? null,
    clientName: clientQuery.data?.name ?? null,
    rocks: rocks ?? [],
    rocksLoading: rocksQuery.isLoading,
    rocksError: rocksQuery.error as Error | null,
    functions: functionsQuery.data ?? [],
    companyMilestones: companyRootId ? companyMilestonesQuery.data ?? [] : [],
    companyRootId,
  };
}
