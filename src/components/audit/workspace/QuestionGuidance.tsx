import { useState, useEffect } from 'react';
import { ChevronDown, ChevronRight, Eye, Info, FileText } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import type { TemplateQuestion } from '@/types/auditWorkspace';

interface QuestionGuidanceProps {
  question: TemplateQuestion;
  framework: string | null;
  variant?: 'interactive' | 'print';
  /** Force-open specific blocks on mount (e.g. when a finding is required). */
  defaultOpen?: { findingGuide?: boolean };
}

// ─── Quality Area mapping ────────────────────────────────────────────
const SRTO_AREAS: Record<string, string> = {
  '1': 'Training & Assessment',
  '2': 'VET Student Support',
  '3': 'VET Workforce',
  '4': 'Governance',
};

const CRICOS_AREAS: Record<string, string> = {
  '1': 'Marketing Information & Practices',
  '2': 'Recruitment of Overseas Students',
  '3': 'Formalisation of Enrolment',
  '4': 'Education Agents',
  '5': 'Younger Overseas Students',
  '6': 'Overseas Student Support Services',
  '7': 'Transfer Between Providers',
  '8': 'Visa Requirements',
  '9': 'Deferring, Suspending or Cancelling Enrolment',
  '10': 'Complaints & Appeals',
  '11': 'Additional Registration Requirements',
};

function topPrefix(clause: string): string | null {
  // Pull the leading integer from "1.1", "NC 4.3", "11.2" → "1", "4", "11".
  const m = clause.trim().match(/^(\d+)/);
  return m ? m[1] : null;
}

function srtoArea(clause: string): string | null {
  const p = topPrefix(clause);
  return p ? SRTO_AREAS[p] ?? null : null;
}

function cricosArea(clause: string): string | null {
  const p = topPrefix(clause);
  return p ? CRICOS_AREAS[p] ?? null : null;
}

export function qualityArea(framework: string | null, clause: string | null): string | null {
  if (!framework || !clause) return null;
  if (framework === 'DUE_DILIGENCE') return null;
  if (framework === 'CRICOS') return cricosArea(clause);
  if (framework === 'RTO_CRICOS_CHC') {
    return clause.startsWith('NC ') ? cricosArea(clause.slice(3)) : srtoArea(clause);
  }
  // SRTO_2025_CHC, SRTO_2025_MOCK, and any future SRTO-only frameworks.
  return srtoArea(clause);
}

// ─── Unicorn document parser ────────────────────────────────────────
function parseUnicornDocs(value: string | null | undefined): string[] {
  if (!value) return [];
  const parts = value.includes(';') ? value.split(';') : value.split(',');
  return parts.map((s) => s.trim()).filter(Boolean);
}

// ─── Collapsible row ────────────────────────────────────────────────
interface BlockProps {
  icon: React.ReactNode;
  label: string;
  open: boolean;
  onToggle: () => void;
  bodyClassName?: string;
  isPrint: boolean;
  children: React.ReactNode;
}

function GuidanceBlock({
  icon,
  label,
  open,
  onToggle,
  bodyClassName,
  isPrint,
  children,
}: BlockProps) {
  return (
    <div>
      {isPrint ? (
        <div className="text-xs font-medium text-foreground flex items-center gap-1.5">
          {icon}
          {label}
        </div>
      ) : (
        <button
          type="button"
          onClick={onToggle}
          className="text-xs font-medium text-muted-foreground hover:text-foreground flex items-center gap-1.5 transition-colors"
        >
          {open ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
          {icon}
          {label}
        </button>
      )}
      {open && <div className={cn('mt-1.5', bodyClassName)}>{children}</div>}
    </div>
  );
}

export function QuestionGuidance({
  question,
  framework,
  variant = 'interactive',
  defaultOpen,
}: QuestionGuidanceProps) {
  const isPrint = variant === 'print';
  const evidenceText = question.evidence_to_sight?.trim() || null;
  const findingGuideText = question.corrective_action?.trim() || null;
  const docs = parseUnicornDocs(question.unicorn_documents);
  const area = qualityArea(framework, question.clause);

  // Per-block open state. Evidence defaults expanded; everything else collapsed.
  // Hooks must run unconditionally — keep them above any early return.
  const [evidenceOpen, setEvidenceOpen] = useState(true);
  const [findingOpen, setFindingOpen] = useState(!!defaultOpen?.findingGuide);
  const [docsOpen, setDocsOpen] = useState(false);

  // If the parent flips ratingNeedsFinding to true after first render, auto-open the guide
  // so the colour story echoes the in-card amber warning banner.
  useEffect(() => {
    if (defaultOpen?.findingGuide) setFindingOpen(true);
  }, [defaultOpen?.findingGuide]);

  // Empty fallback — nothing to show. Parent renders the "No standards mapping" badge.
  const hasAnyContent = !!evidenceText || !!findingGuideText || docs.length > 0 || !!question.clause;
  if (!hasAnyContent) return null;

  return (
    <div className="space-y-3">
      {/* Chips */}
      {question.clause && (
        <div className="flex flex-wrap items-center gap-1.5">
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <span className="inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium bg-primary/10 text-primary">
                  Standard {question.clause}
                </span>
              </TooltipTrigger>
              {question.nc_map && (
                <TooltipContent side="top" className="text-xs">
                  {question.nc_map}
                </TooltipContent>
              )}
            </Tooltip>
          </TooltipProvider>

          {area && (
            <span
              className="inline-flex items-center rounded-md border border-border bg-muted/50 px-2 py-0.5 text-xs font-medium text-muted-foreground"
            >
              {area}
            </span>
          )}
        </div>
      )}

      {/* Evidence to sight */}
      {evidenceText && (
        <GuidanceBlock
          icon={<Eye className="h-3 w-3" />}
          label="Evidence to sight"
          open={isPrint ? true : evidenceOpen}
          onToggle={() => setEvidenceOpen((v) => !v)}
          isPrint={isPrint}
          bodyClassName="text-xs italic text-muted-foreground"
        >
          <div className="border-l-2 pl-3" style={{ borderLeftColor: '#23C0DD' }}>
            {evidenceText}
          </div>
        </GuidanceBlock>
      )}

      {/* Finding guide */}
      {findingGuideText && (
        <GuidanceBlock
          icon={<Info className="h-3 w-3 text-amber-700 dark:text-amber-400" />}
          label="Finding guide"
          open={isPrint ? true : findingOpen}
          onToggle={() => setFindingOpen((v) => !v)}
          isPrint={isPrint}
          bodyClassName="rounded-md bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 px-3 py-2 text-xs text-amber-900 dark:text-amber-300"
        >
          {findingGuideText}
        </GuidanceBlock>
      )}

      {/* Unicorn documents */}
      {docs.length > 0 && (
        <GuidanceBlock
          icon={<FileText className="h-3 w-3" />}
          label="Unicorn documents"
          open={isPrint ? true : docsOpen}
          onToggle={() => setDocsOpen((v) => !v)}
          isPrint={isPrint}
          bodyClassName="text-xs text-muted-foreground"
        >
          <ul className="list-disc pl-5 space-y-0.5">
            {docs.map((d, i) => (
              <li key={i}>{d}</li>
            ))}
          </ul>
        </GuidanceBlock>
      )}
    </div>
  );
}
