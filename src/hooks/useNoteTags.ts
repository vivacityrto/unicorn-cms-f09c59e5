import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface NoteTag {
  id: number;
  code: string;
  label: string;
  description: string | null;
  is_active: boolean;
  sort_order: number;
}

export function useNoteTags() {
  const { data: tags = [], isLoading: loading } = useQuery({
    queryKey: ['dd_note_tags'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('dd_note_tags' as any)
        .select('*')
        .eq('is_active', true)
        .order('sort_order', { ascending: true })
        .order('label', { ascending: true });
      if (error) throw error;
      return (data || []) as unknown as NoteTag[];
    },
  });

  return { tags, loading };
}
