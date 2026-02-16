/**
 * RegulatorUpdatesPanel – Unicorn 2.0
 *
 * Shows recent regulator watchlist changes on the Executive Dashboard.
 * SuperAdmin only.
 */
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Loader2, Globe, ExternalLink, RefreshCw, CheckCircle2, Clock, AlertTriangle } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { toast } from '@/hooks/use-toast';
import { useState } from 'react';
import { useAuth } from '@/hooks/useAuth';

interface RegulatorJob {
  id: string;
  status: string;
  created_at: string;
  input_json: { name?: string; url?: string; watchlist_entry_id?: string } | null;
  research_findings: Array<{
    id: string;
    summary_md: string;
    review_status: string;
  }>;
}

export function RegulatorUpdatesPanel() {
  const { session } = useAuth();
  const [isRunning, setIsRunning] = useState(false);

  const { data: jobs, isLoading, refetch } = useQuery({
    queryKey: ['regulator-watch-jobs'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('research_jobs')
        .select(`
          id, status, created_at, input_json,
          research_findings (id, summary_md, review_status)
        `)
        .eq('job_type', 'regulator_watch')
        .order('created_at', { ascending: false })
        .limit(10);

      if (error) throw error;
      return (data || []) as unknown as RegulatorJob[];
    },
  });

  const { data: watchlist } = useQuery({
    queryKey: ['regulator-watchlist'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('regulator_watchlist')
        .select('id, name, url, last_checked_at, is_active')
        .eq('is_active', true)
        .order('name');

      if (error) throw error;
      return data || [];
    },
  });

  const pendingReviewCount = jobs?.reduce((count, job) => {
    return count + (job.research_findings?.filter(f => f.review_status === 'draft').length || 0);
  }, 0) || 0;

  const handleManualCheck = async () => {
    setIsRunning(true);
    try {
      const { data, error } = await supabase.functions.invoke('regulator-watch-check', {
        headers: session?.access_token
          ? { Authorization: `Bearer ${session.access_token}` }
          : undefined,
      });

      if (error) throw error;

      const changed = data?.changed || 0;
      toast({
        title: 'Regulator check complete',
        description: `Checked ${data?.checked || 0} sources. ${changed} change${changed !== 1 ? 's' : ''} detected.`,
      });
      refetch();
    } catch (err) {
      console.error('Manual check error:', err);
      toast({
        title: 'Check failed',
        description: String(err),
        variant: 'destructive',
      });
    } finally {
      setIsRunning(false);
    }
  };

  const reviewStatusBadge = (status: string) => {
    switch (status) {
      case 'approved':
        return <Badge variant="default" className="gap-1 text-[10px]"><CheckCircle2 className="h-3 w-3" /> Reviewed</Badge>;
      case 'rejected':
        return <Badge variant="destructive" className="gap-1 text-[10px]"><AlertTriangle className="h-3 w-3" /> Rejected</Badge>;
      default:
        return <Badge variant="secondary" className="gap-1 text-[10px]"><Clock className="h-3 w-3" /> Draft</Badge>;
    }
  };

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            <Globe className="h-4 w-4 text-primary" />
            Regulator Updates
            {pendingReviewCount > 0 && (
              <Badge variant="destructive" className="text-[10px] px-1.5 py-0">
                {pendingReviewCount}
              </Badge>
            )}
          </CardTitle>
          <Button
            variant="ghost"
            size="sm"
            onClick={handleManualCheck}
            disabled={isRunning}
            className="h-7 text-xs gap-1"
          >
            {isRunning ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : (
              <RefreshCw className="h-3 w-3" />
            )}
            Check Now
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-2">
        {isLoading ? (
          <div className="flex items-center justify-center py-4">
            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
          </div>
        ) : jobs && jobs.length > 0 ? (
          <div className="space-y-2 max-h-48 overflow-y-auto">
            {jobs.map((job) => {
              const input = job.input_json as { name?: string; url?: string } | null;
              const finding = job.research_findings?.[0];
              return (
                <div
                  key={job.id}
                  className="flex items-start justify-between gap-2 p-2 rounded-md bg-muted/50 text-xs"
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span className="font-medium truncate">{input?.name || 'Unknown source'}</span>
                      {finding && reviewStatusBadge(finding.review_status)}
                    </div>
                    {finding?.summary_md && (
                      <p className="text-muted-foreground mt-0.5 line-clamp-2">
                        {finding.summary_md.slice(0, 150)}…
                      </p>
                    )}
                    <span className="text-muted-foreground text-[10px]">
                      {formatDistanceToNow(new Date(job.created_at), { addSuffix: true })}
                    </span>
                  </div>
                  {input?.url && (
                    <a
                      href={input.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-primary hover:text-primary/80 shrink-0 mt-0.5"
                    >
                      <ExternalLink className="h-3.5 w-3.5" />
                    </a>
                  )}
                </div>
              );
            })}
          </div>
        ) : (
          <div className="text-center py-3">
            <p className="text-xs text-muted-foreground">No regulator changes detected yet.</p>
            <p className="text-[10px] text-muted-foreground mt-1">
              Monitoring {watchlist?.length || 0} source{(watchlist?.length || 0) !== 1 ? 's' : ''}
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
