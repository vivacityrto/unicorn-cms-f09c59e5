import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

interface WorkSubType {
  code: string;
  label: string;
}

const fetchWorkSubTypes = async (): Promise<WorkSubType[]> => {
  const { data, error } = await supabase
    .from('dd_work_sub_type' as any)
    .select('code, label')
    .eq('is_active', true);
  if (error) throw error;
  return (data || []) as unknown as WorkSubType[];
};

export function useWorkSubTypeLabels() {
  const { data = [] } = useQuery({
    queryKey: ['work-sub-type-labels'],
    queryFn: fetchWorkSubTypes,
    staleTime: 5 * 60 * 1000,
  });

  const labelMap = new Map(data.map(d => [d.code, d.label]));

  const getLabel = (code: string | null | undefined): string | null => {
    if (!code) return null;
    return labelMap.get(code) || code;
  };

  return { getLabel };
}
