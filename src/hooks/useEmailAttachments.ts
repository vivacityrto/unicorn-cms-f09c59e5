import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface EmailAttachment {
  documentId: number;
  title: string;
  format: string | null;
  filePath: string | null;
  originalFilename: string | null;
}

export function useEmailAttachments(emailTemplateId?: number) {
  const query = useQuery({
    queryKey: ['email-attachments', emailTemplateId],
    enabled: !!emailTemplateId,
    queryFn: async (): Promise<EmailAttachment[]> => {
      const { data: links, error } = await supabase
        .from('email_attachments')
        .select('document_id, order_number, created_at')
        .eq('email_id', emailTemplateId!)
        .order('order_number', { ascending: true, nullsFirst: false })
        .order('created_at', { ascending: true });
      if (error) throw error;
      const docIds = [...new Set((links || []).map((l: any) => l.document_id))];
      if (docIds.length === 0) return [];

      const [{ data: docs }, { data: files }] = await Promise.all([
        supabase.from('documents').select('id, title, format').in('id', docIds),
        supabase
          .from('document_files')
          .select('document_id, file_path, original_filename, created_at')
          .in('document_id', docIds)
          .order('created_at', { ascending: false }),
      ]);

      const docMap = new Map((docs || []).map((d: any) => [d.id, d]));
      const fileMap = new Map<number, any>();
      (files || []).forEach((f: any) => {
        if (!fileMap.has(f.document_id)) fileMap.set(f.document_id, f);
      });

      return (links || [])
        .map((l: any) => {
          const d = docMap.get(l.document_id);
          if (!d) return null;
          const f = fileMap.get(l.document_id);
          return {
            documentId: d.id,
            title: d.title,
            format: d.format ?? null,
            filePath: f?.file_path ?? null,
            originalFilename: f?.original_filename ?? null,
          };
        })
        .filter(Boolean) as EmailAttachment[];
    },
  });

  return { attachments: query.data || [], loading: query.isLoading };
}
