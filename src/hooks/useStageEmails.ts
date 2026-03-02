import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';

export interface StageEmail {
  id: number;
  email_id: number;
  subject: string;
  description: string | null;
  content: string | null;
  to: string;
  is_sent: boolean;
  sent_date: string | null;
}

interface UseStageEmailsOptions {
  stageInstanceId: number;
}

export function useStageEmails({ stageInstanceId }: UseStageEmailsOptions) {
  const [emails, setEmails] = useState<StageEmail[]>([]);
  const [loading, setLoading] = useState(true);
  const [totalCount, setTotalCount] = useState(0);

  useEffect(() => {
    fetchEmails();
  }, [stageInstanceId]);

  const fetchEmails = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('email_instances')
        .select('id, email_id, subject, "to", is_sent, sent_date, content')
        .eq('stageinstance_id', stageInstanceId)
        .order('sent_date', { ascending: false });

      if (error) throw error;

      // Fetch descriptions and default content from emails table
      const emailIds = [...new Set((data || []).map(e => e.email_id).filter(Boolean))] as number[];
      const { data: emailMeta } = emailIds.length > 0
        ? await supabase.from('emails').select('id, description, content, subject, to').in('id', emailIds)
        : { data: [] };
      const metaMap = new Map((emailMeta || []).map((e: any) => [e.id, e]));

      setTotalCount(data?.length || 0);
      const result: StageEmail[] = (data || []).slice(0, 10).map(e => {
        const meta = metaMap.get(e.email_id);
        return {
          id: e.id,
          email_id: e.email_id,
          subject: e.subject || meta?.subject || 'No subject',
          description: meta?.description || null,
          content: e.content || meta?.content || null,
          to: e.to || meta?.to || '',
          is_sent: e.is_sent ?? false,
          sent_date: e.sent_date,
        };
      });

      setEmails(result);
    } catch (err) {
      console.error('Error fetching stage emails:', err);
      setEmails([]);
    } finally {
      setLoading(false);
    }
  };

  return { emails, loading, totalCount, refetch: fetchEmails };
}
