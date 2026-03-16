import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface SuggestDropdownItem {
  id: string;
  code: string;
  label: string;
  description: string | null;
  sort_order: number;
  is_active: boolean;
}

const fetchDropdown = async (table: string): Promise<SuggestDropdownItem[]> => {
  const { data, error } = await supabase
    .from(table as any)
    .select('id, code, label, description, sort_order, is_active')
    .eq('is_active', true)
    .order('sort_order', { ascending: true });
  if (error) throw error;
  return (data || []) as unknown as SuggestDropdownItem[];
};

export function useSuggestDropdowns() {
  const itemTypes = useQuery({
    queryKey: ['suggest-dropdown', 'dd_suggest_item_type'],
    queryFn: () => fetchDropdown('dd_suggest_item_type'),
    staleTime: 5 * 60 * 1000,
  });

  const statuses = useQuery({
    queryKey: ['suggest-dropdown', 'dd_suggest_status'],
    queryFn: () => fetchDropdown('dd_suggest_status'),
    staleTime: 5 * 60 * 1000,
  });

  const priorities = useQuery({
    queryKey: ['suggest-dropdown', 'dd_suggest_priority'],
    queryFn: () => fetchDropdown('dd_suggest_priority'),
    staleTime: 5 * 60 * 1000,
  });

  const impactRatings = useQuery({
    queryKey: ['suggest-dropdown', 'dd_suggest_impact_rating'],
    queryFn: () => fetchDropdown('dd_suggest_impact_rating'),
    staleTime: 5 * 60 * 1000,
  });

  const releaseStatuses = useQuery({
    queryKey: ['suggest-dropdown', 'dd_suggest_release_status'],
    queryFn: () => fetchDropdown('dd_suggest_release_status'),
    staleTime: 5 * 60 * 1000,
  });

  const categories = useQuery({
    queryKey: ['suggest-dropdown', 'dd_suggest_category'],
    queryFn: () => fetchDropdown('dd_suggest_category'),
    staleTime: 5 * 60 * 1000,
  });

  const packageTypes = useQuery({
    queryKey: ['suggest-dropdown', 'dd_package_type'],
    queryFn: () => fetchDropdown('dd_package_type'),
    staleTime: 5 * 60 * 1000,
  });

  const progressModes = useQuery({
    queryKey: ['suggest-dropdown', 'dd_progress_mode'],
    queryFn: () => fetchDropdown('dd_progress_mode'),
    staleTime: 5 * 60 * 1000,
  });

  const workSubTypes = useQuery({
    queryKey: ['suggest-dropdown', 'dd_work_sub_type'],
    queryFn: () => fetchDropdown('dd_work_sub_type'),
    staleTime: 5 * 60 * 1000,
  });

  return {
    itemTypes: itemTypes.data ?? [],
    statuses: statuses.data ?? [],
    priorities: priorities.data ?? [],
    impactRatings: impactRatings.data ?? [],
    releaseStatuses: releaseStatuses.data ?? [],
    categories: categories.data ?? [],
    packageTypes: packageTypes.data ?? [],
    progressModes: progressModes.data ?? [],
    workSubTypes: workSubTypes.data ?? [],
    isLoading: itemTypes.isLoading || statuses.isLoading || priorities.isLoading ||
      impactRatings.isLoading || releaseStatuses.isLoading || categories.isLoading ||
      packageTypes.isLoading || progressModes.isLoading || workSubTypes.isLoading,
  };
}
