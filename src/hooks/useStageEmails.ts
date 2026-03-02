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
  sender_name: string | null;
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
        .select('id, email_id, subject, "to", is_sent, sent_date, content, sender_uuid')
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

      // Fetch sender names for sent emails
      const senderUuids = [...new Set((data || []).map((e: any) => e.sender_uuid).filter(Boolean))] as string[];
      const { data: senderUsers } = senderUuids.length > 0
        ? await supabase.from('users').select('user_uuid, first_name, last_name').in('user_uuid', senderUuids)
        : { data: [] };
      const senderMap = new Map((senderUsers || []).map((u: any) => [u.user_uuid, `${u.first_name || ''} ${u.last_name || ''}`.trim()]));

      const result: StageEmail[] = (data || []).slice(0, 10).map((e: any) => {
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
          sender_name: senderMap.get(e.sender_uuid) || null,
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
