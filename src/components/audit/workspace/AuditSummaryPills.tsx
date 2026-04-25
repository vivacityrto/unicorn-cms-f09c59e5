import { AlertTriangle, Info } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import type { ClientAudit, AuditRisk } from '@/types/clientAudits';
import type { AuditSection, AuditResponse } from '@/types/auditWorkspace';
import { AUDIT_RISK_LABELS } from '@/types/clientAudits';

const RISK_PILL: Record<AuditRisk, string> = {
  low: 'bg-green-100 text-green-900 border-green-300',
  medium: 'bg-yellow-100 text-yellow-900 border-yellow-300',
  high: 'bg-orange-100 text-orange-900 border-orange-300',
  critical: 'bg-red-100 text-red-900 border-red-300',
  extreme: 'bg-red-900 text-red-50 border-red-950',
};

interface Props {
  audit: ClientAudit;
  sections: AuditSection[];
  responses: AuditResponse[];
}

export function AuditSummaryPills({ audit, sections, responses }: Props) {
  // Document-review-only completion (matches sidebar logic)
  const reviewSections = sections.filter(s => (s.audit_phase || 'document_review') === 'document_review');
  const reviewResponses = responses.filter(r => reviewSections.some(s => s.id === r.section_id));
  const answered = reviewResponses.filter(r => r.rating).length;
  const total = reviewResponses.length;
  const pct = total > 0 ? Math.round((answered / total) * 100) : 0;

  const risk = audit.risk_rating;

  return (
    <div className="px-4 py-3 border-b bg-muted/20 flex flex-wrap gap-3">
      {/* Completion pill */}
      <div className="inline-flex flex-col rounded-md border bg-slate-100 text-slate-900 px-3 py-1.5">
        <span className="text-[10px] font-semibold uppercase tracking-wider opacity-70">Completion</span>
        <span className="text-sm font-medium">{answered} of {total} answered ({pct}%)</span>
      </div>

      {/* Risk Rating pill */}
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <div
              className={cn(
                'inline-flex flex-col rounded-md border px-3 py-1.5 cursor-help',
                risk ? RISK_PILL[risk] : 'bg-slate-100 text-slate-700 border-slate-300'
              )}
            >
              <span className="text-[10px] font-semibold uppercase tracking-wider opacity-70">Risk Rating</span>
              <span className="text-sm font-bold inline-flex items-center gap-1.5">
                {risk ? AUDIT_RISK_LABELS[risk].toUpperCase() : 'NOT YET RATED'}
                {risk === 'extreme' && <AlertTriangle className="h-3.5 w-3.5" />}
                {!risk && <Info className="h-3.5 w-3.5 opacity-60" />}
              </span>
              {!risk && <span className="text-[10px] opacity-70">No findings raised</span>}
            </div>
          </TooltipTrigger>
          <TooltipContent side="bottom" className="max-w-sm">
            <div className="text-xs space-y-1">
              <p className="font-semibold">Auto-derived from finding priorities:</p>
              <ul className="space-y-0.5">
                <li><strong>Extreme:</strong> 3+ Critical, or 2+ Critical with 2+ High</li>
                <li><strong>Critical:</strong> 2 Critical findings</li>
                <li><strong>High:</strong> 1 Critical or any High</li>
                <li><strong>Medium:</strong> Any Medium findings</li>
                <li><strong>Low:</strong> Only Low-priority findings</li>
              </ul>
            </div>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    </div>
  );
}
