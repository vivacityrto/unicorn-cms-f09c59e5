/**
 * AskVivExplainPanel
 * 
 * Expandable panel that shows how Ask Viv formed an answer.
 * Displays context, records used, facts, tables queried, gaps, and safety checks.
 * No raw DB rows exposed - only safe previews.
 */

import { useState } from "react";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Badge } from "@/components/ui/badge";
import { 
  Database, 
  FileText, 
  AlertTriangle, 
  Shield, 
  CheckCircle, 
  XCircle,
  Info,
  Clock,
  User,
  Layers,
} from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Types matching the explain payload from compliance-assistant
 */
interface FactPreview {
  key: string;
  value_preview: string;
  source_table: string;
  source_ids_count: number;
}

interface ExplainRecordRef {
  table: string;
  id: string;
  label: string;
  path?: string;
}

interface ExplainContext {
  tenant_id: string | number;
  scope: {
    client_id: string | null;
    package_id: string | null;
    phase_id: string | null;
  };
  role: string;
  derived_at: string;
}

interface ExplainSafety {
  phrase_filter: {
    blocked: boolean;
    matches: string[];
    categories: string[];
    version: string;
  };
  validator: {
    ok: boolean;
    errors: string[];
    repaired: boolean;
    version: string;
  };
}

interface ExplainFreshness {
  last_activity_at: string | null;
  days_since_activity: number | null;
  status: "fresh" | "aging" | "stale";
  confidence_downgraded: boolean;
}

export interface ExplainPayload {
  context: ExplainContext;
  tables_queried: string[];
  records_used: ExplainRecordRef[];
  facts_used: FactPreview[];
  gaps: string[];
  safety: ExplainSafety;
  freshness?: ExplainFreshness;
}

interface AskVivExplainPanelProps {
  explain: ExplainPayload;
  className?: string;
}

export function AskVivExplainPanel({ explain, className }: AskVivExplainPanelProps) {
  const [openSections, setOpenSections] = useState<string[]>(["context"]);

  const formatTimestamp = (iso: string) => {
    try {
      return new Date(iso).toLocaleString();
    } catch {
      return iso;
    }
  };

  const getScopeChips = () => {
    const chips: { label: string; value: string }[] = [];
    if (explain.context.scope.client_id) {
      chips.push({ label: "Client", value: explain.context.scope.client_id });
    }
    if (explain.context.scope.package_id) {
      chips.push({ label: "Package", value: explain.context.scope.package_id });
    }
    if (explain.context.scope.phase_id) {
      chips.push({ label: "Phase", value: explain.context.scope.phase_id });
    }
    return chips;
  };

  const safetyStatus = explain.safety.phrase_filter.blocked
    ? "blocked"
    : !explain.safety.validator.ok
    ? "failed"
    : explain.safety.validator.repaired
    ? "repaired"
    : "passed";

  return (
    <div className={cn("mt-3 rounded-lg border border-border bg-muted/30", className)}>
      <div className="px-3 py-2 border-b border-border/50 flex items-center gap-2">
        <Info className="h-4 w-4 text-muted-foreground" />
        <span className="text-xs font-medium text-muted-foreground">
          Source Explanation (CSC Review)
        </span>
      </div>

      <Accordion
        type="multiple"
        value={openSections}
        onValueChange={setOpenSections}
        className="px-1"
      >
        {/* Context Section */}
        <AccordionItem value="context" className="border-none">
          <AccordionTrigger className="py-2 px-2 text-xs hover:no-underline">
            <div className="flex items-center gap-2">
              <User className="h-3.5 w-3.5 text-muted-foreground" />
              <span>Context</span>
            </div>
          </AccordionTrigger>
          <AccordionContent className="px-2 pb-3">
            <div className="space-y-2 text-xs">
              <div className="flex items-center gap-2">
                <Badge variant="outline" className="text-[10px]">
                  Tenant {explain.context.tenant_id}
                </Badge>
                <Badge variant="secondary" className="text-[10px]">
                  {explain.context.role}
                </Badge>
              </div>
              {getScopeChips().length > 0 && (
                <div className="flex flex-wrap gap-1">
                  {getScopeChips().map((chip) => (
                    <Badge key={chip.label} variant="outline" className="text-[10px]">
                      {chip.label}: {chip.value}
                    </Badge>
                  ))}
                </div>
              )}
              <div className="flex items-center gap-1 text-muted-foreground">
                <Clock className="h-3 w-3" />
                <span>{formatTimestamp(explain.context.derived_at)}</span>
              </div>
            </div>
          </AccordionContent>
        </AccordionItem>

        {/* Records Used Section */}
        <AccordionItem value="records" className="border-none">
          <AccordionTrigger className="py-2 px-2 text-xs hover:no-underline">
            <div className="flex items-center gap-2">
              <FileText className="h-3.5 w-3.5 text-muted-foreground" />
              <span>Records used ({explain.records_used.length})</span>
            </div>
          </AccordionTrigger>
          <AccordionContent className="px-2 pb-3">
            {explain.records_used.length === 0 ? (
              <p className="text-xs text-muted-foreground">No records accessed</p>
            ) : (
              <div className="space-y-1 max-h-32 overflow-y-auto">
                {explain.records_used.slice(0, 15).map((record, idx) => (
                  <div
                    key={idx}
                    className="flex items-center gap-2 text-xs bg-background/50 rounded px-2 py-1"
                  >
                    <Badge variant="outline" className="text-[10px] shrink-0">
                      {record.table}
                    </Badge>
                    <span className="truncate text-muted-foreground">{record.label}</span>
                  </div>
                ))}
                {explain.records_used.length > 15 && (
                  <p className="text-xs text-muted-foreground px-2">
                    + {explain.records_used.length - 15} more
                  </p>
                )}
              </div>
            )}
          </AccordionContent>
        </AccordionItem>

        {/* Facts Used Section */}
        <AccordionItem value="facts" className="border-none">
          <AccordionTrigger className="py-2 px-2 text-xs hover:no-underline">
            <div className="flex items-center gap-2">
              <Layers className="h-3.5 w-3.5 text-muted-foreground" />
              <span>Facts used ({explain.facts_used.length})</span>
            </div>
          </AccordionTrigger>
          <AccordionContent className="px-2 pb-3">
            {explain.facts_used.length === 0 ? (
              <p className="text-xs text-muted-foreground">No facts derived</p>
            ) : (
              <div className="space-y-1.5 max-h-40 overflow-y-auto">
                {explain.facts_used.slice(0, 20).map((fact, idx) => (
                  <div
                    key={idx}
                    className="text-xs bg-background/50 rounded px-2 py-1.5"
                  >
                    <div className="flex items-center gap-2 mb-0.5">
                      <code className="text-[10px] font-mono text-primary">{fact.key}</code>
                      <Badge variant="outline" className="text-[9px]">
                        {fact.source_table}
                      </Badge>
                      {fact.source_ids_count > 0 && (
                        <span className="text-[9px] text-muted-foreground">
                          ({fact.source_ids_count} source{fact.source_ids_count > 1 ? "s" : ""})
                        </span>
                      )}
                    </div>
                    <p className="text-muted-foreground truncate">{fact.value_preview}</p>
                  </div>
                ))}
                {explain.facts_used.length > 20 && (
                  <p className="text-xs text-muted-foreground px-2">
                    + {explain.facts_used.length - 20} more
                  </p>
                )}
              </div>
            )}
          </AccordionContent>
        </AccordionItem>

        {/* Tables Queried Section */}
        <AccordionItem value="tables" className="border-none">
          <AccordionTrigger className="py-2 px-2 text-xs hover:no-underline">
            <div className="flex items-center gap-2">
              <Database className="h-3.5 w-3.5 text-muted-foreground" />
              <span>Tables queried ({explain.tables_queried.length})</span>
            </div>
          </AccordionTrigger>
          <AccordionContent className="px-2 pb-3">
            <div className="flex flex-wrap gap-1">
              {explain.tables_queried.map((table) => (
                <Badge key={table} variant="secondary" className="text-[10px]">
                  {table}
                </Badge>
              ))}
            </div>
          </AccordionContent>
        </AccordionItem>

        {/* Gaps Section */}
        <AccordionItem value="gaps" className="border-none">
          <AccordionTrigger className="py-2 px-2 text-xs hover:no-underline">
            <div className="flex items-center gap-2">
              <AlertTriangle className="h-3.5 w-3.5 text-muted-foreground" />
              <span>Gaps ({explain.gaps.length})</span>
            </div>
          </AccordionTrigger>
          <AccordionContent className="px-2 pb-3">
            {explain.gaps.length === 0 ? (
              <p className="text-xs text-muted-foreground">No gaps identified</p>
            ) : (
              <ul className="space-y-1 text-xs text-muted-foreground">
                {explain.gaps.map((gap, idx) => (
                  <li key={idx} className="flex items-start gap-1.5">
                    <span className="text-[hsl(var(--warning,38_92%_50%))]">•</span>
                    <span>{gap}</span>
                  </li>
                ))}
              </ul>
            )}
          </AccordionContent>
        </AccordionItem>

        {/* Safety Checks Section */}
        <AccordionItem value="safety" className="border-none">
          <AccordionTrigger className="py-2 px-2 text-xs hover:no-underline">
            <div className="flex items-center gap-2">
              <Shield className="h-3.5 w-3.5 text-muted-foreground" />
              <span>Safety checks</span>
              {safetyStatus === "passed" && (
                <CheckCircle className="h-3 w-3 text-[hsl(var(--success,142_76%_36%))]" />
              )}
              {safetyStatus === "repaired" && (
                <AlertTriangle className="h-3 w-3 text-[hsl(var(--warning,38_92%_50%))]" />
              )}
              {(safetyStatus === "blocked" || safetyStatus === "failed") && (
                <XCircle className="h-3 w-3 text-destructive" />
              )}
            </div>
          </AccordionTrigger>
          <AccordionContent className="px-2 pb-3">
            <div className="space-y-3 text-xs">
              {/* Phrase Filter */}
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <span className="font-medium">Phrase Filter</span>
                  <Badge
                    variant={explain.safety.phrase_filter.blocked ? "destructive" : "secondary"}
                    className="text-[9px]"
                  >
                    {explain.safety.phrase_filter.blocked ? "Blocked" : "Passed"}
                  </Badge>
                  <span className="text-[9px] text-muted-foreground">
                    {explain.safety.phrase_filter.version}
                  </span>
                </div>
                {explain.safety.phrase_filter.matches.length > 0 && (
                  <div className="flex flex-wrap gap-1 mt-1">
                    {explain.safety.phrase_filter.matches.map((match, idx) => (
                      <Badge key={idx} variant="outline" className="text-[9px] text-destructive">
                        {match}
                      </Badge>
                    ))}
                  </div>
                )}
              </div>

              {/* Validator */}
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <span className="font-medium">Response Validator</span>
                  <Badge
                    variant={
                      !explain.safety.validator.ok
                        ? "destructive"
                        : explain.safety.validator.repaired
                        ? "secondary"
                        : "secondary"
                    }
                    className="text-[9px]"
                  >
                    {!explain.safety.validator.ok
                      ? "Failed"
                      : explain.safety.validator.repaired
                      ? "Repaired"
                      : "Passed"}
                  </Badge>
                  <span className="text-[9px] text-muted-foreground">
                    {explain.safety.validator.version}
                  </span>
                </div>
                {explain.safety.validator.errors.length > 0 && (
                  <ul className="text-xs text-destructive mt-1 space-y-0.5">
                    {explain.safety.validator.errors.map((err, idx) => (
                      <li key={idx}>• {err}</li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          </AccordionContent>
        </AccordionItem>

        {/* Freshness Section - only shows when freshness data is present */}
        {explain.freshness && (
          <AccordionItem value="freshness" className="border-none">
            <AccordionTrigger className="py-2 px-2 text-xs hover:no-underline">
              <div className="flex items-center gap-2">
                <Clock className="h-3.5 w-3.5 text-muted-foreground" />
                <span>Data Freshness</span>
                {explain.freshness.status === "fresh" && (
                  <CheckCircle className="h-3 w-3 text-[hsl(var(--success,142_76%_36%))]" />
                )}
                {explain.freshness.status === "aging" && (
                  <AlertTriangle className="h-3 w-3 text-[hsl(var(--warning,38_92%_50%))]" />
                )}
                {explain.freshness.status === "stale" && (
                  <XCircle className="h-3 w-3 text-destructive" />
                )}
              </div>
            </AccordionTrigger>
            <AccordionContent className="px-2 pb-3">
              <div className="space-y-2 text-xs">
                <div className="flex items-center gap-2">
                  <span className="font-medium">Status:</span>
                  <Badge
                    variant={
                      explain.freshness.status === "stale"
                        ? "destructive"
                        : explain.freshness.status === "aging"
                        ? "secondary"
                        : "secondary"
                    }
                    className="text-[9px]"
                  >
                    {explain.freshness.status.charAt(0).toUpperCase() + explain.freshness.status.slice(1)}
                  </Badge>
                </div>
                {explain.freshness.days_since_activity !== null && (
                  <div className="text-muted-foreground">
                    Last activity: {explain.freshness.days_since_activity} days ago
                  </div>
                )}
                {explain.freshness.last_activity_at && (
                  <div className="text-muted-foreground">
                    Date: {formatTimestamp(explain.freshness.last_activity_at)}
                  </div>
                )}
                {explain.freshness.confidence_downgraded && (
                  <div className="flex items-center gap-1.5 text-[hsl(var(--warning,38_92%_50%))]">
                    <AlertTriangle className="h-3 w-3" />
                    <span>Confidence was downgraded due to data age</span>
                  </div>
                )}
              </div>
            </AccordionContent>
          </AccordionItem>
        )}
      </Accordion>
    </div>
  );
}
