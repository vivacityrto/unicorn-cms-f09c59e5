import { useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, ClipboardCheck } from 'lucide-react';
import { format, isPast } from 'date-fns';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Skeleton } from '@/components/ui/skeleton';
import { AuditTypeBadge } from '@/components/audit/AuditTypeBadge';
import { AuditStatusBadge } from '@/components/audit/AuditStatusBadge';
import { AuditRiskBadge } from '@/components/audit/AuditRiskBadge';
import { NewAuditModal } from '@/components/audit/NewAuditModal';
import { AuditScheduleAlert } from '@/components/client/AuditScheduleAlert';
import { useClientAudits } from '@/hooks/useClientAudits';
import type { AuditDashboardRow } from '@/types/clientAudits';
import { cn } from '@/lib/utils';
import { HistoricalReferencesSection } from '@/components/audit/references/HistoricalReferencesSection';

interface ClientAuditsTabProps {
  tenantId: number;
  tenantName: string;
}

export function ClientAuditsTab({ tenantId, tenantName }: ClientAuditsTabProps) {
  const navigate = useNavigate();
  const { data: audits = [], isLoading } = useClientAudits(tenantId);
  const [modalOpen, setModalOpen] = useState(false);
  const [preselectedAuditType, setPreselectedAuditType] = useState<import('@/types/clientAudits').AuditType | undefined>(undefined);

  const handleStartCHC = useCallback((auditType?: import('@/types/clientAudits').AuditType) => {
    setPreselectedAuditType(auditType);
    setModalOpen(true);
  }, []);

  const completedAudits = audits.filter(a => a.status === 'complete');

  return (
    <div className="space-y-6">
      {/* Schedule Alert */}
      <AuditScheduleAlert tenantId={tenantId} onStartCHC={handleStartCHC} />

      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Audits & Assessments</h2>
        <Button onClick={() => setModalOpen(true)}>
          <Plus className="h-4 w-4 mr-2" />
          Start New Audit
        </Button>
      </div>

      {/* Audit cards */}
      {isLoading ? (
        <div className="space-y-3">
          {[...Array(3)].map((_, i) => <Skeleton key={i} className="h-24 w-full" />)}
        </div>
      ) : audits.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12 text-center">
          <ClipboardCheck className="h-10 w-10 text-muted-foreground/40 mb-3" />
          <p className="font-medium text-muted-foreground">No audits yet for this client</p>
          <p className="text-sm text-muted-foreground/60 mt-1">Click 'Start New Audit' to begin.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {audits.map(row => (
            <AuditCard key={row.id} row={row} onClick={() => navigate(`/audits/${row.id}`)} />
          ))}
        </div>
      )}

      {/* Completed audit history */}
      {completedAudits.length > 0 && (
        <div className="space-y-3">
          <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Audit History</h3>
          <div className="border rounded-lg divide-y">
            {completedAudits.map(a => (
              <div key={a.id} className="flex items-center gap-4 px-4 py-3 text-sm">
                <span className="text-muted-foreground w-24">
                  {a.conducted_at ? format(new Date(a.conducted_at), 'd MMM yyyy') : '—'}
                </span>
                <AuditTypeBadge type={a.audit_type} />
                <AuditRiskBadge risk={a.risk_rating} />
                {a.score_pct != null && <span className="font-medium">{a.score_pct}%</span>}
                <span className="text-muted-foreground ml-auto">{a.lead_auditor_name || 'Unassigned'}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Historical Reference Audits */}
      <div className="border-t pt-6">
        <HistoricalReferencesSection tenantId={tenantId} />
      </div>

      <NewAuditModal
        open={modalOpen}
        onOpenChange={(open) => {
          setModalOpen(open);
          if (!open) setPreselectedAuditType(undefined);
        }}
        preselectedTenantId={tenantId}
        preselectedTenantName={tenantName}
        preselectedAuditType={preselectedAuditType}
      />
    </div>
  );
}

function AuditCard({ row, onClick }: { row: AuditDashboardRow; onClick: () => void }) {
  return (
    <Card className="cursor-pointer hover:shadow-md transition-shadow" onClick={onClick}>
      <CardContent className="p-4 space-y-2">
        <div className="flex items-center gap-2 flex-wrap">
          <AuditTypeBadge type={row.audit_type} />
          <AuditStatusBadge status={row.status} />
          <AuditRiskBadge risk={row.risk_rating} />
          <span className="text-sm text-muted-foreground ml-auto">
            {row.conducted_at ? format(new Date(row.conducted_at), 'd MMM yyyy') : 'Draft'}
          </span>
        </div>
        <p className="font-medium">{row.title || 'Untitled Audit'}</p>
        <div className="flex items-center gap-4 text-sm text-muted-foreground">
          {row.lead_auditor_name && (
            <div className="flex items-center gap-1.5">
              <Avatar className="h-5 w-5">
                <AvatarFallback className="text-[9px]">
                  {row.lead_auditor_name.split(' ').map(n => n[0]).join('').slice(0, 2)}
                </AvatarFallback>
              </Avatar>
              {row.lead_auditor_name}
            </div>
          )}
          <span>Findings: {row.finding_count}</span>
          <span className={cn(row.open_action_count > 0 && 'text-orange-600 font-medium')}>
            Open actions: {row.open_action_count}
          </span>
        </div>
        {row.next_audit_due && (
          <p className={cn('text-xs', isPast(new Date(row.next_audit_due)) ? 'text-red-600 font-medium' : 'text-muted-foreground')}>
            Next due: {format(new Date(row.next_audit_due), 'd MMM yyyy')}
          </p>
        )}
      </CardContent>
    </Card>
  );
}
