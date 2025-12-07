import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Megaphone, ThumbsUp, AlertTriangle } from 'lucide-react';
import { EmptyState } from '@/components/ui/empty-state';
import { TableSkeleton } from '@/components/ui/loading-skeleton';
import { format } from 'date-fns';
import type { UserProfile } from '@/types/eos';

interface Headline {
  id: string;
  headline: string;
  is_good_news: boolean;
  created_at: string;
  meeting_id: string;
}

export function ClientHeadlinesList() {
  const { profile } = useAuth();
  const clientId = (profile as UserProfile)?.client_id;

  const { data: headlines, isLoading } = useQuery({
    queryKey: ['client-headlines', clientId],
    queryFn: async () => {
      if (!clientId) return [];
      
      const { data, error } = await supabase
        .from('eos_headlines')
        .select(`
          *,
          eos_meetings!inner(client_id)
        `)
        .eq('eos_meetings.client_id', clientId)
        .order('created_at', { ascending: false })
        .limit(50);
      
      if (error) throw error;
      return data as unknown as Headline[];
    },
    enabled: !!clientId,
  });

  if (isLoading) {
    return <TableSkeleton rows={3} />;
  }

  if (!headlines || headlines.length === 0) {
    return (
      <EmptyState
        icon={Megaphone}
        title="No headlines yet"
        description="Headlines from your meetings will appear here"
      />
    );
  }

  return (
    <div className="grid gap-3">
      {headlines.map((headline) => (
        <Card 
          key={headline.id} 
          className={`border-l-4 ${
            headline.is_good_news 
              ? 'border-l-green-500 bg-green-50/50' 
              : 'border-l-yellow-500 bg-yellow-50/50'
          }`}
        >
          <CardContent className="p-4">
            <div className="flex items-start gap-3">
              <div className={`p-2 rounded-lg ${
                headline.is_good_news ? 'bg-green-100' : 'bg-yellow-100'
              }`}>
                {headline.is_good_news ? (
                  <ThumbsUp className="h-4 w-4 text-green-600" />
                ) : (
                  <AlertTriangle className="h-4 w-4 text-yellow-600" />
                )}
              </div>
              <div className="flex-1">
                <p className="text-sm font-medium">{headline.headline}</p>
                <p className="text-xs text-muted-foreground mt-1">
                  {format(new Date(headline.created_at), 'MMM d, yyyy')}
                </p>
              </div>
              <Badge variant={headline.is_good_news ? 'default' : 'secondary'}>
                {headline.is_good_news ? 'Good News' : 'Update'}
              </Badge>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
