import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { AuditTypeBadge } from '@/components/audit/AuditTypeBadge';
import { AuditStatusBadge } from '@/components/audit/AuditStatusBadge';
import { AuditRiskBadge } from '@/components/audit/AuditRiskBadge';
import { cn } from '@/lib/utils';
import type { ClientAudit, AuditStatus } from '@/types/clientAudits';
import type { AuditSection, AuditResponse } from '@/types/auditWorkspace';

interface AuditSidebarProps {
  audit: ClientAudit;
  sections: AuditSection[];
  responses: AuditResponse[];
  totalQuestions: number;
  selectedSectionIndex: number;
  onSelectSection: (idx: number) => void;
  onStatusChange: (status: AuditStatus) => void;
  leadAuditorName?: string | null;
  leadAuditorAvatar?: string | null;
}

export function AuditSidebar({
  audit,
  sections,
  responses,
  totalQuestions,
  selectedSectionIndex,
  onSelectSection,
  onStatusChange,
  leadAuditorName,
  leadAuditorAvatar,
}: AuditSidebarProps) {
  const answeredCount = responses.filter(r => r.rating).length;
  const progressPct = totalQuestions > 0 ? Math.round((answeredCount / totalQuestions) * 100) : 0;
  const progressColor = progressPct >= 90 ? 'bg-green-500' : progressPct >= 50 ? 'bg-blue-500' : 'bg-amber-500';

  const getSectionCompletion = (section: AuditSection) => {
    const sectionResponses = responses.filter(r => r.section_id === section.id);
    const answered = sectionResponses.filter(r => r.rating).length;
    const total = sectionResponses.length;
    if (total === 0) return 'none';
    if (answered === total) return 'complete';
    return 'partial';
  };

  const statusOptions: { value: AuditStatus; label: string }[] = [
    { value: 'draft', label: 'Draft' },
    { value: 'in_progress', label: 'In Progress' },
    { value: 'review', label: 'In Review' },
    { value: 'complete', label: 'Complete' },
    { value: 'archived', label: 'Archived' },
  ];

  return (
    <div className="w-[280px] flex-shrink-0 border-r bg-muted/30 flex flex-col h-full">
      {/* Audit Identity */}
      <div className="p-4 border-b space-y-3">
        <div className="flex flex-wrap gap-1.5">
          <AuditTypeBadge type={audit.audit_type} />
          <AuditStatusBadge status={audit.status} />
        </div>
        <div>
          <p className="font-semibold text-sm truncate">{audit.title || 'Untitled Audit'}</p>
          <p className="text-xs text-muted-foreground">{audit.snapshot_rto_number || ''}</p>
        </div>
        {leadAuditorName && (
          <div className="flex items-center gap-2">
            <Avatar className="h-6 w-6">
              <AvatarImage src={leadAuditorAvatar || ''} />
              <AvatarFallback className="text-[10px]">
                {leadAuditorName.split(' ').map(n => n[0]).join('')}
              </AvatarFallback>
            </Avatar>
            <span className="text-xs text-muted-foreground">{leadAuditorName}</span>
          </div>
        )}
        <p className="text-xs text-muted-foreground">
          {audit.conducted_at
            ? new Date(audit.conducted_at).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' })
            : 'Draft'}
        </p>
      </div>

      {/* Progress */}
      <div className="p-4 border-b space-y-2">
        <div className="flex justify-between text-xs">
          <span className="text-muted-foreground">Progress</span>
          <span className="font-medium">{answeredCount} of {totalQuestions}</span>
        </div>
        <Progress value={progressPct} className="h-2" indicatorClassName={progressColor} />
        <p className="text-[10px] text-muted-foreground">{progressPct}% complete</p>
      </div>

      {/* Section Nav */}
      <div className="flex-1 overflow-y-auto p-2">
        <p className="px-2 py-1 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Sections</p>
        {sections.map((section, idx) => {
          const completion = getSectionCompletion(section);
          const dotColor = completion === 'complete' ? 'bg-green-500' : completion === 'partial' ? 'bg-amber-500' : 'bg-gray-300';
          return (
            <button
              key={section.id}
              onClick={() => onSelectSection(idx)}
              className={cn(
                'w-full text-left px-2 py-2 rounded-md text-xs flex items-start gap-2 transition-colors',
                idx === selectedSectionIndex
                  ? 'bg-primary/10 text-primary font-medium'
                  : 'hover:bg-muted text-muted-foreground'
              )}
            >
              <span className={cn('w-2 h-2 rounded-full mt-1 flex-shrink-0', dotColor)} />
              <span className="line-clamp-2">{section.title}</span>
            </button>
          );
        })}
      </div>

      {/* Footer */}
      <div className="p-4 border-t space-y-3">
        {audit.risk_rating && <AuditRiskBadge risk={audit.risk_rating} />}
        {audit.score_pct !== null && (
          <p className="text-xs font-medium">Score: {audit.score_pct}%</p>
        )}
        <Select
          value={audit.status}
          onValueChange={(v) => onStatusChange(v as AuditStatus)}
        >
          <SelectTrigger className="h-8 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {statusOptions.map(o => (
              <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}
