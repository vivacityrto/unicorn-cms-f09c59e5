import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Inbox, Clock, AlertCircle, X } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';

interface TimeInboxStats {
  recent_count: number;
  overdue_count: number;
  total_drafts: number;
  is_dismissed?: boolean;
}

export function TimeInboxWidget() {
  const { user } = useAuth();
  const [stats, setStats] = useState<TimeInboxStats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    
    const fetchStats = async () => {
      const { data } = await supabase.rpc('rpc_get_time_inbox_stats');
      if (data) setStats(data as unknown as TimeInboxStats);
      setLoading(false);
    };
    
    fetchStats();
  }, [user]);

  if (loading || !stats || stats.total_drafts === 0) return null;

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base flex items-center gap-2">
          <Inbox className="h-4 w-4" />
          Time Inbox
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="text-center">
              <p className="text-2xl font-bold">{stats.recent_count}</p>
              <p className="text-xs text-muted-foreground">Recent</p>
            </div>
            {stats.overdue_count > 0 && (
              <div className="text-center">
                <p className="text-2xl font-bold text-destructive">{stats.overdue_count}</p>
                <p className="text-xs text-muted-foreground">Overdue</p>
              </div>
            )}
          </div>
        </div>
        <Button asChild size="sm" className="w-full">
          <Link to="/time-inbox">Review Drafts</Link>
        </Button>
      </CardContent>
    </Card>
  );
}

export function TimeInboxBanner() {
  const { user } = useAuth();
  const [stats, setStats] = useState<TimeInboxStats | null>(null);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    if (!user) return;
    
    const fetchStats = async () => {
      const { data } = await supabase.rpc('rpc_get_time_inbox_stats');
      if (data) {
        const s = data as unknown as TimeInboxStats;
        setStats(s);
        setDismissed(s.is_dismissed ?? false);
      }
    };
    
    fetchStats();
  }, [user]);

  const handleDismiss = async () => {
    const { error } = await supabase.rpc('rpc_dismiss_time_inbox_banner');
    if (!error) {
      setDismissed(true);
    }
  };

  if (!stats || stats.overdue_count === 0 || dismissed) return null;

  return (
    <div className="bg-amber-500/10 border-b border-amber-500/20 px-4 py-2">
      <div className="flex items-center justify-between max-w-screen-2xl mx-auto">
        <div className="flex items-center gap-2 text-sm text-amber-700 dark:text-amber-400">
          <AlertCircle className="h-4 w-4" />
          <span>You have {stats.overdue_count} unposted time draft{stats.overdue_count !== 1 ? 's' : ''} older than 2 days</span>
        </div>
        <div className="flex items-center gap-2">
          <Button asChild size="sm" variant="outline" className="text-amber-700 border-amber-500/50 hover:bg-amber-500/10">
            <Link to="/time-inbox">Review Now</Link>
          </Button>
          <Button 
            size="sm" 
            variant="ghost" 
            className="text-amber-700 hover:bg-amber-500/10 h-8 w-8 p-0"
            onClick={handleDismiss}
            title="Dismiss for today"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}