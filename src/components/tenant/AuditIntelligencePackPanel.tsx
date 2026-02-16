/**
 * AuditIntelligencePackPanel – Phase 5
 *
 * Collapsible panel on Tenant Overview for generating and viewing Audit Intelligence Packs.
 * Includes: Generate modal, focus areas, risk trends, preparation checklist, review workflow.
 */
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useRBAC } from "@/hooks/useRBAC";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { toast } from "@/hooks/use-toast";
import {
  FormModal,
} from "@/components/ui/modals";
import {
  ShieldCheck, ChevronDown, ChevronRight, Loader2,
  AlertTriangle, Clock, CheckCircle2, FileText, ListChecks, Plus,
} from "lucide-react";
import { format, formatDistanceToNow } from "date-fns";

const AUDIT_TYPE_LABELS: Record<string, string> = {
  initial_registration: "Initial Registration",
  re_registration: "Re-registration",
  extension_to_scope: "Extension to Scope",
  strategic_review: "Strategic Compliance Review",
  post_audit_response: "Post-Audit Rectification",
};

const SEVERITY_COLORS: Record<string, string> = {
  high: "text-red-600 border-red-500/40 bg-red-500/10",
  medium: "text-amber-600 border-amber-500/40 bg-amber-500/10",
  low: "text-blue-600 border-blue-500/40 bg-blue-500/10",
};

interface AuditIntelligencePackPanelProps {
  tenantId: number;
  tenantName: string;
}

export function AuditIntelligencePackPanel({ tenantId, tenantName }: AuditIntelligencePackPanelProps) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { session } = useAuth();
  const { isSuperAdmin, isVivacityTeam } = useRBAC();
  const [isOpen, setIsOpen] = useState(false);
  const [showModal, setShowModal] = useState(false);

  // Form state
  const [auditType, setAuditType] = useState<string>("");
  const [deliveryMode, setDeliveryMode] = useState<string>("");
  const [cricosFlag, setCricosFlag] = useState(false);
  const [knownRisks, setKnownRisks] = useState("");
  const [specialNotes, setSpecialNotes] = useState("");

  if (!isSuperAdmin && !isVivacityTeam) return null;

  // Fetch latest pack for this tenant
  const { data: latestPack, isLoading } = useQuery({
    queryKey: ["audit-intelligence-pack-latest", tenantId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("audit_intelligence_packs")
        .select("*")
        .eq("tenant_id", tenantId)
        .order("generated_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const generateMutation = useMutation({
    mutationFn: async () => {
      if (!auditType) throw new Error("Audit type is required");
      const { data, error } = await supabase.functions.invoke("research-audit-intelligence", {
        body: {
          tenant_id: tenantId,
          audit_type: auditType,
          delivery_mode: deliveryMode || undefined,
          cricos_flag: cricosFlag,
          known_risks: knownRisks || undefined,
          special_notes: specialNotes || undefined,
          tenant_name: tenantName,
        },
        headers: session?.access_token
          ? { Authorization: `Bearer ${session.access_token}` }
          : undefined,
      });
      if (error) throw error;
      if (!data?.ok) throw new Error(data?.detail || "Pack generation failed");
      return data;
    },
    onSuccess: () => {
      toast({ title: "Audit Intelligence Pack generated", description: "Review the findings below." });
      queryClient.invalidateQueries({ queryKey: ["audit-intelligence-pack-latest", tenantId] });
      setShowModal(false);
      setIsOpen(true);
    },
    onError: (err) => {
      toast({ title: "Generation failed", description: String(err), variant: "destructive" });
    },
  });

  const reviewMutation = useMutation({
    mutationFn: async (newStatus: "reviewed" | "approved") => {
      if (!latestPack) throw new Error("No pack to review");
      const { error } = await supabase
        .from("audit_intelligence_packs")
        .update({
          status: newStatus,
          reviewed_by_user_id: (await supabase.auth.getUser()).data.user?.id,
          reviewed_at: new Date().toISOString(),
        })
        .eq("id", latestPack.id);
      if (error) throw error;

      // Audit log
      await supabase.from("research_audit_log").insert({
        user_id: (await supabase.auth.getUser()).data.user?.id,
        job_id: latestPack.research_job_id,
        action: newStatus === "approved" ? "pack_approved" : "pack_reviewed",
        details: { pack_id: latestPack.id },
      });
    },
    onSuccess: (_, newStatus) => {
      toast({ title: `Pack ${newStatus}` });
      queryClient.invalidateQueries({ queryKey: ["audit-intelligence-pack-latest", tenantId] });
    },
  });

  const taskMutation = useMutation({
    mutationFn: async () => {
      if (!latestPack) throw new Error("No pack");
      const TASKS = [
        "Validate trainer and assessor matrix alignment",
        "Review assessment tools against packaging rules",
        "Confirm learner support evidence",
        "Review marketing claims consistency",
        "Confirm third-party arrangements",
        "Review LLND processes",
        "Review industry engagement records",
        "Confirm monitoring and internal audit evidence",
      ];
      // Insert tasks (simplified — uses a generic tasks approach)
      for (const title of TASKS) {
        await supabase.from("research_audit_log").insert({
          user_id: (await supabase.auth.getUser()).data.user?.id,
          job_id: latestPack.research_job_id,
          action: "task_generated",
          details: { pack_id: latestPack.id, task_title: title },
        });
      }
      return TASKS;
    },
    onSuccess: (tasks) => {
      toast({ title: "Audit preparation tasks logged", description: `${tasks.length} tasks recorded.` });
    },
  });

  const focusAreas = (latestPack?.focus_areas_json as any[]) || [];
  const riskTrends = (latestPack?.risk_trends_json as any[]) || [];
  const checklist = (latestPack?.preparation_checklist_json as any[]) || [];
  const isPending = latestPack?.status === "draft";
  const isApproved = latestPack?.status === "approved";
  const isReviewed = latestPack?.status === "reviewed";

  return (
    <>
      <Card className="border-0 shadow-lg overflow-hidden">
        <Collapsible open={isOpen} onOpenChange={setIsOpen}>
          <CollapsibleTrigger asChild>
            <CardHeader className="cursor-pointer hover:bg-muted/30 transition-colors pb-2">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm font-semibold flex items-center gap-2">
                  <ShieldCheck className="h-4 w-4 text-primary" />
                  Audit Intelligence Pack
                  {isPending && (
                    <Badge variant="secondary" className="text-[10px] gap-0.5">
                      <Clock className="h-2.5 w-2.5" /> Pending Review
                    </Badge>
                  )}
                  {isReviewed && (
                    <Badge variant="info" className="text-[10px] gap-0.5">
                      <CheckCircle2 className="h-2.5 w-2.5" /> Reviewed
                    </Badge>
                  )}
                  {isApproved && (
                    <Badge variant="default" className="text-[10px] gap-0.5">
                      <CheckCircle2 className="h-2.5 w-2.5" /> Approved
                    </Badge>
                  )}
                </CardTitle>
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={(e) => { e.stopPropagation(); setShowModal(true); }}
                    disabled={generateMutation.isPending}
                    className="h-7 text-xs gap-1"
                  >
                    {generateMutation.isPending ? (
                      <Loader2 className="h-3 w-3 animate-spin" />
                    ) : (
                      <ShieldCheck className="h-3 w-3" />
                    )}
                    {latestPack ? "Regenerate" : "Generate"} Pack
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
              ) : !latestPack ? (
                <div className="text-center py-6">
                  <ShieldCheck className="h-8 w-8 text-muted-foreground mx-auto mb-2 opacity-50" />
                  <p className="text-xs text-muted-foreground">No intelligence pack generated yet</p>
                </div>
              ) : (
                <>
                  {/* Meta */}
                  <div className="flex items-center gap-3 text-[10px] text-muted-foreground flex-wrap">
                    <span>Type: {AUDIT_TYPE_LABELS[latestPack.audit_type] || latestPack.audit_type}</span>
                    <span>Generated: {format(new Date(latestPack.generated_at), "dd MMM yyyy HH:mm")}</span>
                    <span>Standards: Standards for RTOs 2025</span>
                    <span>{formatDistanceToNow(new Date(latestPack.generated_at), { addSuffix: true })}</span>
                  </div>

                  {/* Focus Areas */}
                  {focusAreas.length > 0 && (
                    <div className="space-y-1.5">
                      <h4 className="text-xs font-medium flex items-center gap-1">
                        <AlertTriangle className="h-3 w-3 text-amber-500" /> Focus Areas ({focusAreas.length})
                      </h4>
                      {focusAreas.slice(0, 4).map((fa: any, i: number) => (
                        <div key={i} className="p-2 rounded border text-xs space-y-0.5">
                          <span className="font-medium">{fa.theme}</span>
                          {fa.standard_clause && (
                            <span className="text-muted-foreground ml-1">· {fa.standard_clause}</span>
                          )}
                          {fa.attention_reason && (
                            <p className="text-muted-foreground text-[10px] line-clamp-2">{fa.attention_reason}</p>
                          )}
                        </div>
                      ))}
                      {focusAreas.length > 4 && (
                        <p className="text-[10px] text-muted-foreground">+ {focusAreas.length - 4} more</p>
                      )}
                    </div>
                  )}

                  {/* Checklist summary */}
                  {checklist.length > 0 && (
                    <div className="flex items-center gap-2 text-xs">
                      <ListChecks className="h-3.5 w-3.5 text-primary" />
                      <span className="font-medium">{checklist.length} preparation checklist items</span>
                    </div>
                  )}

                  {/* Risk Trends */}
                  {riskTrends.length > 0 && (
                    <div className="flex items-center gap-2 text-xs">
                      <AlertTriangle className="h-3.5 w-3.5 text-amber-500" />
                      <span className="font-medium">{riskTrends.length} sector risk trends identified</span>
                    </div>
                  )}

                  <Separator />

                  {/* Actions */}
                  <div className="flex flex-wrap gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => navigate(`/admin/research-jobs/${latestPack.research_job_id}`)}
                      className="h-7 text-xs gap-1"
                    >
                      <FileText className="h-3 w-3" /> View Full Report
                    </Button>
                    {isPending && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => reviewMutation.mutate("reviewed")}
                        disabled={reviewMutation.isPending}
                        className="h-7 text-xs gap-1"
                      >
                        Mark Reviewed
                      </Button>
                    )}
                    {(isPending || isReviewed) && (
                      <Button
                        variant="default"
                        size="sm"
                        onClick={() => reviewMutation.mutate("approved")}
                        disabled={reviewMutation.isPending}
                        className="h-7 text-xs gap-1"
                      >
                        <CheckCircle2 className="h-3 w-3" /> Approve Pack
                      </Button>
                    )}
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => taskMutation.mutate()}
                      disabled={taskMutation.isPending}
                      className="h-7 text-xs gap-1"
                    >
                      <Plus className="h-3 w-3" /> Generate Audit Tasks
                    </Button>
                  </div>
                </>
              )}
            </CardContent>
          </CollapsibleContent>
        </Collapsible>
      </Card>

      {/* Generate Modal */}
      <FormModal
        open={showModal}
        onOpenChange={setShowModal}
        title="Generate Audit Intelligence Pack"
        description="Provide context for the AI to generate a structured preparation brief."
        onSubmit={async (e) => {
          e.preventDefault();
          await generateMutation.mutateAsync();
        }}
        submitText={generateMutation.isPending ? "Generating..." : "Generate Pack"}
        isSubmitting={generateMutation.isPending}
        submitDisabled={!auditType}
        size="lg"
      >
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label className="text-xs">Audit Type *</Label>
            <Select value={auditType} onValueChange={setAuditType}>
              <SelectTrigger className="h-9 text-sm">
                <SelectValue placeholder="Select audit type..." />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(AUDIT_TYPE_LABELS).map(([val, label]) => (
                  <SelectItem key={val} value={val}>{label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs">Delivery Mode</Label>
            <Select value={deliveryMode} onValueChange={setDeliveryMode}>
              <SelectTrigger className="h-9 text-sm">
                <SelectValue placeholder="Select delivery mode..." />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="onsite">On-site</SelectItem>
                <SelectItem value="online">Online</SelectItem>
                <SelectItem value="blended">Blended</SelectItem>
                <SelectItem value="workplace">Workplace</SelectItem>
                <SelectItem value="mixed">Mixed</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="flex items-center gap-2">
            <Switch checked={cricosFlag} onCheckedChange={setCricosFlag} id="cricos" />
            <Label htmlFor="cricos" className="text-xs cursor-pointer">CRICOS Provider</Label>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs">Known Risk Themes</Label>
            <Textarea
              value={knownRisks}
              onChange={e => setKnownRisks(e.target.value)}
              placeholder="e.g. Assessment validation gaps, trainer currency..."
              className="text-sm min-h-[60px]"
            />
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs">Special Notes</Label>
            <Textarea
              value={specialNotes}
              onChange={e => setSpecialNotes(e.target.value)}
              placeholder="Any additional context for the analysis..."
              className="text-sm min-h-[60px]"
            />
          </div>
        </div>
      </FormModal>
    </>
  );
}
