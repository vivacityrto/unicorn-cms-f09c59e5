import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Search, ArrowRight, CalendarClock } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { format } from 'date-fns';
import { AUDIT_STATUS_LABELS } from '@/types/clientAudits';
import type { AuditStatus } from '@/types/clientAudits';

interface AuditProgressCardProps {
  linkedAuditId: string;
}

export function AuditProgressCard({ linkedAuditId }: AuditProgressCardProps) {
  const navigate = useNavigate();

  const { data: audit, isLoading } = useQuery({
    queryKey: ['linked-audit-progress', linkedAuditId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('client_audits' as any)
        .select('id, title, status, score_pct, opening_meeting_at, score_total, score_max')
        .eq('id', linkedAuditId)
        .single();
      if (error) throw error;
      return data as any;
    },
  });

  if (isLoading || !audit) return null;

  const status = audit.status as AuditStatus;
  const statusLabel = AUDIT_STATUS_LABELS[status] || status;
  const scorePct = audit.score_pct ?? 0;
  const assessed = audit.score_total ?? 0;
  const maxScore = audit.score_max ?? 0;

  return (
    <Card className="border-primary/30 bg-primary/5 mb-3">
      <CardContent className="p-4 space-y-3">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-2">
            <Search className="h-4 w-4 text-primary" />
            <span className="text-sm font-semibold">Audit in progress</span>
          </div>
          <Badge variant="outline" className="text-xs">{statusLabel}</Badge>
        </div>

        <p className="text-xs text-muted-foreground truncate">{audit.title}</p>

        {maxScore > 0 && (
          <div className="space-y-1">
            <div className="flex justify-between text-xs">
              <span className="text-muted-foreground">Progress</span>
              <span className="font-medium">{assessed} of {maxScore} assessed ({scorePct}%)</span>
            </div>
            <Progress value={scorePct} className="h-2" />
          </div>
        )}

        {audit.opening_meeting_at && (
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <CalendarClock className="h-3.5 w-3.5" />
            <span>Opening meeting: {format(new Date(audit.opening_meeting_at), 'd MMM yyyy')}</span>
          </div>
        )}

        <Button
          variant="outline"
          size="sm"
          className="w-full text-xs"
          onClick={() => navigate(`/audits/${linkedAuditId}`)}
        >
          Open Audit Workspace
          <ArrowRight className="h-3.5 w-3.5 ml-1" />
        </Button>
      </CardContent>
    </Card>
  );
}
