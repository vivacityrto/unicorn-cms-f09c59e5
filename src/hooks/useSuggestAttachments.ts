import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/use-toast';

export interface SuggestAttachment {
  id: string;
  tenant_id: number;
  suggest_item_id: string;
  file_name: string;
  file_path: string;
  file_size_bytes: number | null;
  mime_type: string | null;
  attachment_kind: string;
  created_at: string;
  created_by: string;
}

export function useSuggestAttachments(itemId: string | undefined) {
  return useQuery({
    queryKey: ['suggest-attachments', itemId],
    queryFn: async (): Promise<SuggestAttachment[]> => {
      const { data, error } = await supabase
        .from('suggest_attachments' as any)
        .select('*')
        .eq('suggest_item_id', itemId!)
        .order('created_at', { ascending: true });
      if (error) throw error;
      return (data || []) as unknown as SuggestAttachment[];
    },
    enabled: !!itemId,
  });
}

export function useUploadSuggestAttachment() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      file,
      itemId,
      tenantId,
      userId,
    }: {
      file: File;
      itemId: string;
      tenantId: number;
      userId: string;
    }) => {
      const filePath = `${tenantId}/${itemId}/${Date.now()}_${file.name}`;
      
      const { error: uploadError } = await supabase.storage
        .from('suggest-attachments')
        .upload(filePath, file);
      if (uploadError) throw uploadError;

      const { error: dbError } = await supabase
        .from('suggest_attachments' as any)
        .insert({
          tenant_id: tenantId,
          suggest_item_id: itemId,
          file_name: file.name,
          file_path: filePath,
          file_size_bytes: file.size,
          mime_type: file.type || null,
          attachment_kind: file.type?.startsWith('image/') ? 'image' : 'file',
          created_by: userId,
        });
      if (dbError) throw dbError;
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['suggest-attachments', variables.itemId] });
    },
    onError: (err: Error) => {
      toast({ title: 'Upload failed', description: err.message, variant: 'destructive' });
    },
  });
}

export async function getAttachmentSignedUrl(filePath: string): Promise<string | null> {
  const { data, error } = await supabase.storage
    .from('suggest-attachments')
    .createSignedUrl(filePath, 3600);
  if (error) return null;
  return data.signedUrl;
}
