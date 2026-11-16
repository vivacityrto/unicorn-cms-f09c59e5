import { useParams } from 'react-router-dom';
import { usePermissionDetailed } from '@/hooks/usePermission';
import { supabase } from '@/integrations/supabase/client';
import { PlanningSurveyReview } from '@/components/eos/planning-surveys/PlanningSurveyReview';

const gateway = {
  async review(campaignId: string) {
    const { data, error } = await supabase.functions.invoke('planning-survey-review', { body: { campaignId, action: 'review' } });
    if (error) throw new Error('Review unavailable');
    return data;
  },
  async close(campaignId: string) {
    const { data, error } = await supabase.functions.invoke('planning-survey-review', { body: { campaignId, action: 'close' } });
    if (error || data?.closed !== true) throw new Error('Closure unconfirmed');
  },
};
export default function EosPlanningSurveyReview() {
  const { id } = useParams();
  const permission = usePermissionDetailed('eos.configurations.manage', 'full');
  if (import.meta.env.VITE_PLANNING_SURVEY_REVIEW_ENABLED !== 'true') return <p>Strategic planning survey review is not enabled.</p>;
  if (permission.isLoading) return <p>Checking review access…</p>;
  if (!permission.granted || !id || !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)) return <p>Review unavailable.</p>;
  return <PlanningSurveyReview campaignId={id} gateway={gateway} />;
}
