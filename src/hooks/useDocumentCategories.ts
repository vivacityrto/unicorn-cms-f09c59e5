import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface DocumentCategory {
  label: string;
  value: string;
  is_active: boolean;
  sort_order: number;
}

export function useDocumentCategories() {
  const query = useQuery({
    queryKey: ['dd-document-categories'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('dd_document_categories')
        .select('label, value, is_active, sort_order')
        .eq('is_active', true)
        .order('sort_order');
      if (error) throw error;
      return (data || []) as DocumentCategory[];
    },
    staleTime: 5 * 60_000,
  });

  const valueLabelMap = useMemo(
    () => new Map(query.data?.map((c) => [c.value, c.label]) || []),
    [query.data],
  );

  return { categories: query.data || [], valueLabelMap, isLoading: query.isLoading };
}
