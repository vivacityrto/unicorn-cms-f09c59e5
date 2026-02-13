import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';

export interface StageEmail {
  id: number;
  email_id: number;
  subject: string;
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
        .select('id, email_id, subject, "to", is_sent, sent_date')
        .eq('stageinstance_id', stageInstanceId)
        .order('sent_date', { ascending: false });

      if (error) throw error;

      setTotalCount(data?.length || 0);
      const result: StageEmail[] = (data || []).slice(0, 10).map(e => ({
        id: e.id,
        email_id: e.email_id,
        subject: e.subject || 'No subject',
        to: e.to || '',
        is_sent: e.is_sent ?? false,
        sent_date: e.sent_date,
      }));

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
