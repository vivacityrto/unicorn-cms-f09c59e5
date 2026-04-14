import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { AuditTypeBadge } from '@/components/audit/AuditTypeBadge';
import { AuditStatusBadge } from '@/components/audit/AuditStatusBadge';
import { AuditRiskBadge } from '@/components/audit/AuditRiskBadge';
import { cn } from '@/lib/utils';
import { Check, CalendarClock, ClipboardList } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import type { ClientAudit, AuditStatus } from '@/types/clientAudits';
import type { AuditSection, AuditResponse, AuditPhase, AuditAppointment } from '@/types/auditWorkspace';
import { useAuditAppointments } from '@/hooks/useAuditSchedule';
import { format } from 'date-fns';

interface AuditSidebarProps {
  audit: ClientAudit;
  sections: AuditSection[];
  responses: AuditResponse[];
  totalQuestions: number;
  selectedSectionIndex: number;
  onSelectSection: (idx: number) => void;
  onStatusChange: (status: AuditStatus) => void;
  onNavigateToSchedule?: () => void;
  leadAuditorName?: string | null;
  leadAuditorAvatar?: string | null;
}

interface PhaseGroup {
  key: AuditPhase;
  label: string;
  sections: Array<AuditSection & { originalIndex: number }>;
}

export function AuditSidebar({
  audit,
  sections,
  responses,
  totalQuestions,
  selectedSectionIndex,
  onSelectSection,
  onStatusChange,
  onNavigateToSchedule,
  leadAuditorName,
  leadAuditorAvatar,
}: AuditSidebarProps) {
  const navigate = useNavigate();
  const { documentDeadline, openingMeeting, closingMeeting } = useAuditAppointments(audit.id);
  // Group sections by phase
  const phaseGroups: PhaseGroup[] = [
    { key: 'opening_meeting', label: 'PHASE 1 — OPENING MEETING', sections: [] },
    { key: 'document_review', label: 'PHASE 2 — DOCUMENT REVIEW', sections: [] },
    { key: 'closing_meeting', label: 'PHASE 3 — CLOSING MEETING', sections: [] },
  ];

  sections.forEach((section, idx) => {
    const phase = section.audit_phase || 'document_review';
    const group = phaseGroups.find(g => g.key === phase);
    if (group) {
      group.sections.push({ ...section, originalIndex: idx });
    }
  });

  // Progress: count only document_review questions
  const reviewSections = phaseGroups.find(g => g.key === 'document_review')?.sections || [];
  const reviewResponses = responses.filter(r => 
    reviewSections.some(s => s.id === r.section_id)
  );
  const reviewAnswered = reviewResponses.filter(r => r.rating).length;
  const reviewTotal = reviewResponses.length || totalQuestions;
  const progressPct = reviewTotal > 0 ? Math.round((reviewAnswered / reviewTotal) * 100) : 0;
  const progressColor = progressPct >= 90 ? 'bg-green-500' : progressPct >= 50 ? 'bg-blue-500' : 'bg-amber-500';

  const getSectionCompletion = (section: AuditSection) => {
    const sectionResponses = responses.filter(r => r.section_id === section.id);
    const answered = sectionResponses.filter(r => r.rating).length;
    const total = sectionResponses.length;
    if (total === 0) return { status: 'none' as const, answered: 0, total: 0 };
    if (answered === total) return { status: 'complete' as const, answered, total };
    return { status: 'partial' as const, answered, total };
  };

  const getPhaseCompletion = (group: PhaseGroup) => {
    let totalAnswered = 0;
    let totalCount = 0;
    for (const s of group.sections) {
      const comp = getSectionCompletion(s);
      totalAnswered += comp.answered;
      totalCount += comp.total;
    }
    if (totalCount === 0) return 'Not started';
    if (totalAnswered === totalCount) return 'Complete';
    return 'In progress';
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

      {/* Progress — document review only */}
      <div className="p-4 border-b space-y-2">
        <div className="flex justify-between text-xs">
          <span className="text-muted-foreground">Progress</span>
          <span className="font-medium">{reviewAnswered} of {reviewTotal}</span>
        </div>
        <Progress value={progressPct} className="h-2" indicatorClassName={progressColor} />
        <p className="text-[10px] text-muted-foreground">{reviewAnswered} of {reviewTotal} evidence items assessed</p>
      </div>

      {/* Schedule Summary */}
      <div className="p-4 border-b space-y-1.5">
        <div className="flex items-center gap-1.5 mb-1">
          <CalendarClock className="h-3.5 w-3.5 text-muted-foreground" />
          <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Schedule</span>
        </div>
        <ScheduleRow
          icon="📋" label="Evidence due"
          value={documentDeadline?.scheduled_date
            ? format(new Date(documentDeadline.scheduled_date + 'T00:00:00'), 'd MMM')
            : null}
          onSetDate={onNavigateToSchedule}
        />
        <ScheduleRow
          icon="🗣" label="Opening"
          value={openingMeeting?.scheduled_date
            ? `${format(new Date(openingMeeting.scheduled_date + 'T00:00:00'), 'd MMM')}${openingMeeting.scheduled_start_time ? ` ${openingMeeting.scheduled_start_time.slice(0, 5)}` : ''}`
            : null}
          onSetDate={onNavigateToSchedule}
        />
        <ScheduleRow
          icon="🎯" label="Closing"
          value={closingMeeting?.scheduled_date
            ? `${format(new Date(closingMeeting.scheduled_date + 'T00:00:00'), 'd MMM')}${closingMeeting.scheduled_start_time ? ` ${closingMeeting.scheduled_start_time.slice(0, 5)}` : ''}`
            : null}
          onSetDate={onNavigateToSchedule}
        />
      </div>

      {/* CHC Stage Link */}
      {audit.linked_stage_instance_id && (
        <div className="p-4 border-b">
          <button
            onClick={() => navigate(`/clients/${audit.subject_tenant_id}?tab=packages&stage=${audit.linked_stage_instance_id}`)}
            className="flex items-center gap-2 text-xs text-primary hover:underline w-full"
          >
            <ClipboardList className="h-3.5 w-3.5" />
            <div className="text-left">
              <span className="font-medium block">Linked to CHC stage</span>
              <span className="text-[10px] text-muted-foreground">View stage tasks →</span>
            </div>
          </button>
        </div>
      )}

      {/* Phase-grouped Section Nav */}
      <div className="flex-1 overflow-y-auto p-2">
        {phaseGroups.map(group => {
          if (group.sections.length === 0) return null;
          const phaseStatus = getPhaseCompletion(group);
          const isComplete = phaseStatus === 'Complete';

          return (
            <div key={group.key} className="mb-3">
              <div className="px-2 py-1.5 flex items-center justify-between">
                <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                  {group.label}
                </span>
                {isComplete ? (
                  <Check className="h-3 w-3 text-green-600" />
                ) : (
                  <span className="text-[9px] text-muted-foreground">{phaseStatus}</span>
                )}
              </div>
              {group.sections.map(section => {
                const comp = getSectionCompletion(section);
                const dotColor = comp.status === 'complete' ? 'bg-green-500'
                  : comp.status === 'partial' ? 'bg-amber-500'
                  : 'bg-muted-foreground/30';
                return (
                  <button
                    key={section.id}
                    onClick={() => onSelectSection(section.originalIndex)}
                    className={cn(
                      'w-full text-left px-2 py-1.5 rounded-md text-xs flex items-start gap-2 transition-colors',
                      section.originalIndex === selectedSectionIndex
                        ? 'bg-primary/10 text-primary font-medium'
                        : 'hover:bg-muted text-muted-foreground'
                    )}
                  >
                    <span className={cn('w-2 h-2 rounded-full mt-1 flex-shrink-0', dotColor)} />
                    <div className="min-w-0 flex-1">
                      <span className="line-clamp-2">{section.title}</span>
                      {comp.total > 0 && (
                        <span className="text-[10px] text-muted-foreground/70">{comp.answered}/{comp.total}</span>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
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

function ScheduleRow({ icon, label, value, onSetDate }: {
  icon: string; label: string; value: string | null; onSetDate?: () => void;
}) {
  return (
    <div className="flex items-center justify-between text-[11px]">
      <span className="text-muted-foreground">{icon} {label}</span>
      {value ? (
        <span className="font-medium">{value}</span>
      ) : (
        <button onClick={onSetDate} className="text-primary hover:underline text-[10px]">Set date</button>
      )}
    </div>
  );
}
