/**
 * EvidenceGapCheckPanel – Phase 6 (Client Portal)
 *
 * Client-facing panel to run evidence gap checks and view results.
 * Shows missing evidence categories mapped to Standards for RTOs 2025.
 * Does not assess quality or compliance.
 */
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Progress } from "@/components/ui/progress";
import { toast } from "@/hooks/use-toast";
import {
  ClipboardCheck, ChevronDown, ChevronRight, Loader2,
  AlertTriangle, CheckCircle2, Upload, Clock,
} from "lucide-react";
import { format, formatDistanceToNow } from "date-fns";

interface EvidenceGapCheckPanelProps {
  tenantId: number;
  stageInstanceId: number;
  stageType?: string;
  /** If true, shows in read-only client mode without review controls */
  clientMode?: boolean;
}

export function EvidenceGapCheckPanel({
  tenantId,
  stageInstanceId,
  stageType,
  clientMode = false,
}: EvidenceGapCheckPanelProps) {
  const queryClient = useQueryClient();
  const { session } = useAuth();
  const [isOpen, setIsOpen] = useState(false);

  const { data: latestCheck, isLoading } = useQuery({
    queryKey: ["evidence-gap-check", tenantId, stageInstanceId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("evidence_gap_checks")
        .select("*")
        .eq("tenant_id", tenantId)
        .eq("stage_instance_id", stageInstanceId)
        .order("generated_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const runCheckMutation = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke("research-evidence-gap-check", {
        body: { tenant_id: tenantId, stage_instance_id: stageInstanceId, stage_type: stageType },
        headers: session?.access_token
          ? { Authorization: `Bearer ${session.access_token}` }
          : undefined,
      });
      if (error) throw error;
      if (!data?.ok) throw new Error(data?.detail || "Gap check failed");
      return data;
    },
    onSuccess: () => {
      toast({ title: "Evidence gap check complete", description: "Review the results below." });
      queryClient.invalidateQueries({ queryKey: ["evidence-gap-check", tenantId, stageInstanceId] });
      setIsOpen(true);
    },
    onError: (err) => {
      toast({ title: "Check failed", description: String(err), variant: "destructive" });
    },
  });

  const required = (latestCheck?.required_categories_json as any[]) || [];
  const detected = (latestCheck?.detected_categories_json as any[]) || [];
  const missing = (latestCheck?.missing_categories_json as any[]) || [];
  const mandatoryMissing = missing.filter((m: any) => m.mandatory);
  const optionalMissing = missing.filter((m: any) => !m.mandatory);
  const completionPct = required.length > 0 ? Math.round((detected.length / required.length) * 100) : 0;

  const isPending = latestCheck?.status === "draft";
  const isApproved = latestCheck?.status === "approved";

  return (
    <Card className="border-0 shadow-lg overflow-hidden">
      <Collapsible open={isOpen} onOpenChange={setIsOpen}>
        <CollapsibleTrigger asChild>
          <CardHeader className="cursor-pointer hover:bg-muted/30 transition-colors pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                <ClipboardCheck className="h-4 w-4 text-primary" />
                Evidence Gap Summary
                {latestCheck && (
                  <>
                    {isPending && (
                      <Badge variant="secondary" className="text-[10px] gap-0.5">
                        <Clock className="h-2.5 w-2.5" /> Draft
                      </Badge>
                    )}
                    {isApproved && (
                      <Badge variant="default" className="text-[10px] gap-0.5">
                        <CheckCircle2 className="h-2.5 w-2.5" /> Approved
                      </Badge>
                    )}
                    {mandatoryMissing.length > 0 && (
                      <Badge variant="destructive" className="text-[10px]">
                        {mandatoryMissing.length} mandatory gap{mandatoryMissing.length !== 1 ? "s" : ""}
                      </Badge>
                    )}
                  </>
                )}
              </CardTitle>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={(e) => { e.stopPropagation(); runCheckMutation.mutate(); }}
                  disabled={runCheckMutation.isPending}
                  className="h-7 text-xs gap-1"
                >
                  {runCheckMutation.isPending ? (
                    <Loader2 className="h-3 w-3 animate-spin" />
                  ) : (
                    <ClipboardCheck className="h-3 w-3" />
                  )}
                  {latestCheck ? "Re-run" : "Check"} Evidence
                </Button>
                {isOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
              </div>
            </div>
          </CardHeader>
        </CollapsibleTrigger>

        <CollapsibleContent>
          <CardContent className="space-y-3 pt-0">
            {isLoading ? (
              <div className="flex items-center justify-center py-6">
                <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
              </div>
            ) : !latestCheck ? (
              <div className="text-center py-6">
                <ClipboardCheck className="h-8 w-8 text-muted-foreground mx-auto mb-2 opacity-50" />
                <p className="text-xs text-muted-foreground">No evidence gap check run yet</p>
              </div>
            ) : (
              <>
                {/* Meta */}
                <div className="flex items-center gap-3 text-[10px] text-muted-foreground">
                  <span>Checked: {format(new Date(latestCheck.generated_at), "dd MMM yyyy HH:mm")}</span>
                  <span>{formatDistanceToNow(new Date(latestCheck.generated_at), { addSuffix: true })}</span>
                </div>

                {/* Progress bar */}
                <div className="space-y-1">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-medium">Evidence Completeness</span>
                    <span className="text-muted-foreground">{detected.length}/{required.length} categories ({completionPct}%)</span>
                  </div>
                  <Progress value={completionPct} className="h-2" />
                </div>

                {/* Missing mandatory */}
                {mandatoryMissing.length > 0 && (
                  <div className="space-y-1.5">
                    <h4 className="text-xs font-medium flex items-center gap-1 text-destructive">
                      <AlertTriangle className="h-3 w-3" /> Mandatory Gaps ({mandatoryMissing.length})
                    </h4>
                    {mandatoryMissing.map((cat: any, i: number) => (
                      <div key={i} className="flex items-start gap-2 p-2 rounded border border-destructive/20 bg-destructive/5 text-xs">
                        <div className="flex-1 min-w-0">
                          <span className="font-medium">{cat.category_name}</span>
                          {cat.related_standard_clause && (
                            <span className="text-muted-foreground ml-1">· {cat.related_standard_clause}</span>
                          )}
                          <p className="text-muted-foreground text-[10px] mt-0.5">{cat.category_description}</p>
                        </div>
                        {!clientMode && (
                          <Button variant="ghost" size="sm" className="h-6 text-[10px] gap-0.5 shrink-0">
                            <Upload className="h-3 w-3" /> Upload
                          </Button>
                        )}
                      </div>
                    ))}
                  </div>
                )}

                {/* Missing optional */}
                {optionalMissing.length > 0 && (
                  <div className="space-y-1.5">
                    <h4 className="text-xs font-medium text-muted-foreground">
                      Optional Gaps ({optionalMissing.length})
                    </h4>
                    {optionalMissing.map((cat: any, i: number) => (
                      <div key={i} className="flex items-start gap-2 p-2 rounded border text-xs">
                        <div className="flex-1 min-w-0">
                          <span className="font-medium">{cat.category_name}</span>
                          {cat.related_standard_clause && (
                            <span className="text-muted-foreground ml-1">· {cat.related_standard_clause}</span>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {/* Detected */}
                {detected.length > 0 && (
                  <div className="space-y-1">
                    <h4 className="text-xs font-medium flex items-center gap-1 text-green-600">
                      <CheckCircle2 className="h-3 w-3" /> Detected ({detected.length})
                    </h4>
                    <div className="flex flex-wrap gap-1">
                      {detected.map((cat: any, i: number) => (
                        <Badge key={i} variant="outline" className="text-[10px]">
                          {cat.category_name}
                        </Badge>
                      ))}
                    </div>
                  </div>
                )}

                {/* Disclaimer */}
                <p className="text-[10px] text-muted-foreground italic pt-1">
                  This check identifies missing evidence categories only. It does not assess document quality or compliance.
                </p>
              </>
            )}
          </CardContent>
        </CollapsibleContent>
      </Collapsible>
    </Card>
  );
}
