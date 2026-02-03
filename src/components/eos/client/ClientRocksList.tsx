import { useEosRocks } from '@/hooks/useEos';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Target, Armchair, AlertTriangle } from 'lucide-react';
import { EmptyState } from '@/components/ui/empty-state';
import { TableSkeleton } from '@/components/ui/loading-skeleton';
import { Progress } from '@/components/ui/progress';
import { ClientBadge } from '../ClientBadge';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';

export function ClientRocksList() {
  const { rocks, isLoading } = useEosRocks();
  const { profile } = useAuth();

  // Fetch seats for display
  const { data: seats } = useQuery({
    queryKey: ['seats-for-client-rocks', profile?.tenant_id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('accountability_seats')
        .select('id, seat_name')
        .eq('tenant_id', profile?.tenant_id!);
      
      if (error) throw error;
      return data;
    },
    enabled: !!profile?.tenant_id,
  });

  const getSeatName = (seatId: string | null | undefined) => {
    if (!seatId) return null;
    return seats?.find(s => s.id === seatId)?.seat_name || null;
  };

  if (isLoading) {
    return <TableSkeleton rows={3} />;
  }

  if (!rocks || rocks.length === 0) {
    return (
      <EmptyState
        icon={Target}
        title="No rocks assigned yet"
        description="Your company hasn't assigned any quarterly goals to you yet"
      />
    );
  }

  return (
    <div className="grid gap-4">
      {rocks.map((rock) => (
        <Card key={rock.id} className="hover:shadow-card-hover transition-shadow">
          <CardHeader>
            <div className="flex items-start justify-between">
              <div className="flex-1">
                <CardTitle className="text-lg flex items-center gap-2 flex-wrap">
                  {rock.title}
                  <ClientBadge clientId={rock.client_id} />
                </CardTitle>
                {/* Seat display */}
                <div className="flex items-center gap-2 mt-1">
                  {rock.seat_id ? (
                    <Badge variant="outline" className="gap-1 text-xs">
                      <Armchair className="w-3 h-3" />
                      {getSeatName(rock.seat_id) || 'Unknown Seat'}
                    </Badge>
                  ) : (
                    <Badge variant="outline" className="gap-1 text-xs text-amber-600 border-amber-300">
                      <AlertTriangle className="w-3 h-3" />
                      No Seat
                    </Badge>
                  )}
                </div>
                {rock.description && (
                  <p className="text-sm text-muted-foreground mt-2">
                    {rock.description}
                  </p>
                )}
              </div>
              <Badge variant={rock.status === 'complete' ? 'default' : 'secondary'}>
                {rock.status || 'In Progress'}
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Progress</span>
              <span className="font-medium">{rock.progress || 0}%</span>
            </div>
            <Progress value={rock.progress || 0} className="h-2" />
            {rock.due_date && (
              <p className="text-xs text-muted-foreground">
                Due: {new Date(rock.due_date).toLocaleDateString()}
              </p>
            )}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
