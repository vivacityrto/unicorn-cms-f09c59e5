import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { VIVACITY_TENANT_ID } from '@/hooks/useVivacityTeamUsers';
import type { RockLevel } from '@/types/eos';
import type { ParentCandidate } from '@/utils/rockEditor/types';
import type { StoredLink, StoredMilestone } from '@/utils/rockEditor/fromRock';
import { linkTargetRocksFor, type LinkTargetRock } from '@/utils/rockLinking';

export interface EditorRock extends ParentCandidate {
  archived: boolean;
}

/** A milestone of a Team or Company Rock that a milestone below it can support. */
export interface CompanyMilestoneOption {
  id: string;
  title: string;
  status: string;
  dueDate: string | null;
}

/** One Rock above the Rock being edited, with the milestones of its that can be supported. */
export interface LinkOptionGroup {
  rock: LinkTargetRock;
  milestones: CompanyMilestoneOption[];
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
 * parent and spot duplicates), the teams, and the Team and Company milestones an Individual
 * Rock's milestones can support (a Team Rock's can support Company milestones).
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
  /** The Rocks above this one whose milestones its own can support: its Team Rock and/or Company Rock. */
  const linkRocks = useMemo(() => {
    if ((options.level !== 'individual' && options.level !== 'team') || !options.parentId || !rocks) return [];
    const byId = new Map(rocks.map(r => [r.id, { id: r.id, title: r.title, level: r.level, parentId: r.parentId }]));
    const result = linkTargetRocksFor({ id: options.rockId ?? 'new', title: '', level: options.level, parentId: options.parentId }, byId);
    return result.status === 'ok' ? result.rocks : [];
  }, [options.level, options.parentId, options.rockId, rocks]);
  const linkRockKey = linkRocks.map(r => r.id).join(',');

  const linkMilestonesQuery = useQuery({
    queryKey: ['eos-rock-link-options', linkRockKey],
    queryFn: async (): Promise<Array<CompanyMilestoneOption & { rockId: string }>> => {
      const { data, error } = await supabase
        .from('eos_rock_milestones')
        .select('id, rock_id, title, status, due_date')
        .in('rock_id', linkRocks.map(r => r.id))
        .order('sort_order', { ascending: true });
      if (error) throw error;
      return (data || []).map(m => ({ id: m.id, rockId: m.rock_id, title: m.title, status: m.status, dueDate: m.due_date }));
    },
    enabled: enabled && linkRocks.length > 0,
  });
  const linkOptions = useMemo<LinkOptionGroup[]>(
    () => linkRocks.map(rock => ({ rock, milestones: (linkMilestonesQuery.data ?? []).filter(m => m.rockId === rock.id) })),
    [linkRocks, linkMilestonesQuery.data],
  );

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

  const savedLevel = options.savedLevel ?? options.level;
  const needsLinks = !!rockId && (savedLevel === 'individual' || savedLevel === 'team') && milestoneIds.length > 0;

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
    linkOptions,
  };
}
