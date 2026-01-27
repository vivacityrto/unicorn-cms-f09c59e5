import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

/**
 * Unified hook for fetching all EOS dropdown options from database views.
 * This ensures all dropdowns use valid enum values from a single source of truth.
 */

// Query keys for cache management
const QUERY_KEYS = {
  statusOptions: ['eos-options', 'status'],
  categoryOptions: ['eos-options', 'category'],
  impactOptions: ['eos-options', 'impact'],
  typeOptions: ['eos-options', 'type'],
  quarterOptions: ['eos-options', 'quarter'],
} as const;

// Common query config - enum values don't change during runtime
const STABLE_QUERY_CONFIG = {
  staleTime: Infinity,
  gcTime: Infinity,
} as const;

/**
 * Fetch status options from eos_issue_status enum
 */
export function useEosStatusOptions() {
  return useQuery({
    queryKey: QUERY_KEYS.statusOptions,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('eos_issue_status_options')
        .select('value');
      
      if (error) throw error;
      return (data ?? []).map(row => row.value as string);
    },
    ...STABLE_QUERY_CONFIG,
  });
}

/**
 * Fetch category options from eos_issue_category_options view
 */
export function useEosCategoryOptions() {
  return useQuery({
    queryKey: QUERY_KEYS.categoryOptions,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('eos_issue_category_options')
        .select('value');
      
      if (error) throw error;
      return (data ?? []).map(row => row.value as string);
    },
    ...STABLE_QUERY_CONFIG,
  });
}

/**
 * Fetch impact options from eos_issue_impact_options view
 */
export function useEosImpactOptions() {
  return useQuery({
    queryKey: QUERY_KEYS.impactOptions,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('eos_issue_impact_options')
        .select('value');
      
      if (error) throw error;
      return (data ?? []).map(row => row.value as string);
    },
    ...STABLE_QUERY_CONFIG,
  });
}

/**
 * Fetch type options (risk/opportunity) from eos_issue_type_options view
 */
export function useEosTypeOptions() {
  return useQuery({
    queryKey: QUERY_KEYS.typeOptions,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('eos_issue_type_options')
        .select('value');
      
      if (error) throw error;
      return (data ?? []).map(row => row.value as string);
    },
    ...STABLE_QUERY_CONFIG,
  });
}

/**
 * Fetch quarter options (1-4) from eos_quarter_options view
 */
export function useEosQuarterOptions() {
  return useQuery({
    queryKey: QUERY_KEYS.quarterOptions,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('eos_quarter_options')
        .select('value');
      
      if (error) throw error;
      return (data ?? []).map(row => row.value as number);
    },
    ...STABLE_QUERY_CONFIG,
  });
}

/**
 * Generate year options dynamically (current year -1 to +5)
 * This is client-side only since years are just integers
 */
export function useEosYearOptions() {
  const currentYear = new Date().getFullYear();
  const years: number[] = [];
  
  for (let i = -1; i <= 5; i++) {
    years.push(currentYear + i);
  }
  
  return { data: years, isLoading: false, error: null };
}

/**
 * Priority options (stored as integers, displayed as labels)
 * These are fixed values: 1=Low, 2=Medium, 3=High
 */
export function useEosPriorityOptions() {
  return {
    data: [
      { value: 1, label: 'Low' },
      { value: 2, label: 'Medium' },
      { value: 3, label: 'High' },
    ],
    isLoading: false,
    error: null,
  };
}

/**
 * Combined hook to load all EOS options at once
 */
export function useAllEosOptions() {
  const status = useEosStatusOptions();
  const category = useEosCategoryOptions();
  const impact = useEosImpactOptions();
  const type = useEosTypeOptions();
  const quarter = useEosQuarterOptions();
  const year = useEosYearOptions();
  const priority = useEosPriorityOptions();

  return {
    status,
    category,
    impact,
    type,
    quarter,
    year,
    priority,
    isLoading: status.isLoading || category.isLoading || impact.isLoading || 
               type.isLoading || quarter.isLoading,
    isError: status.isError || category.isError || impact.isError || 
             type.isError || quarter.isError,
  };
}
