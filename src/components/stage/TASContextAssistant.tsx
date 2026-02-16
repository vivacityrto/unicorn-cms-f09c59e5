/**
 * TAS Context Assistant — panel for generating a TAS context brief
 * on a stage instance page. VivacityTeam only.
 */
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useRBAC } from "@/hooks/useRBAC";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Loader2, BookOpen, ChevronDown, ChevronUp, ExternalLink,
  CheckCircle2, XCircle, Clock, Shield, AlertTriangle, ListTodo,
  Edit2, Save,
} from "lucide-react";
import { format, formatDistanceToNow } from "date-fns";

interface TASContextAssistantProps {
  tenantId: number;
  stageInstanceId: number;
  tenantName?: string;
}

const SEVERITY_COLORS: Record<string, string> = {
  high: "bg-destructive/10 text-destructive border-destructive",
  medium: "bg-amber-500/10 text-amber-600 border-amber-600",
  low: "bg-blue-500/10 text-blue-600 border-blue-600",
};

const TAS_TASK_TEMPLATES = [
  "Confirm packaging and elective selection rules",
  "Confirm delivery mode and facilities requirements",
  "Confirm assessment methods and evidence plan",
  "Confirm third-party arrangements if indicated",
  "Confirm learner cohort support plan",
];

export function TASContextAssistant({ tenantId, stageInstanceId, tenantName }: TASContextAssistantProps) {
  const { isVivacityTeam } = useRBAC();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [isOpen, setIsOpen] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editedMarkdown, setEditedMarkdown] = useState("");

  // Form inputs
  const [qualCode, setQualCode] = useState("");
  const [tgaUrl, setTgaUrl] = useState("");
  const [clientUrl, setClientUrl] = useState("");
  const [deliveryMode, setDeliveryMode] = useState("");
  const [audienceNotes, setAudienceNotes] = useState("");

  // Fetch existing brief for this stage instance
  const { data: brief, isLoading: briefLoading } = useQuery({
    queryKey: ["tas-context-brief", stageInstanceId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("tas_context_briefs")
        .select("*")
        .eq("stage_instance_id", stageInstanceId)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  // Fetch sources for the brief
  const { data: sources } = useQuery({
    queryKey: ["tas-context-sources", brief?.generated_from_job_id],
    queryFn: async () => {
      if (!brief?.generated_from_job_id) return [];
      const { data, error } = await supabase
        .from("research_sources")
        .select("id, url, title, retrieved_at")
        .eq("job_id", brief.generated_from_job_id)
        .order("retrieved_at");
      if (error) throw error;
      return data || [];
    },
    enabled: !!brief?.generated_from_job_id,
  });

  // Generate brief mutation
  const generateMutation = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke("research-tas-context", {
        body: {
          tenant_id: tenantId,
          stage_instance_id: stageInstanceId,
          qualification_code: qualCode || undefined,
          training_gov_url: tgaUrl || undefined,
          client_site_url: clientUrl || undefined,
          delivery_mode: deliveryMode || undefined,
          audience_notes: audienceNotes || undefined,
          tenant_name: tenantName,
        },
      });
      if (error) throw error;
      if (!data?.ok) throw new Error(data?.detail || "Generation failed");
      return data;
    },
    onSuccess: () => {
      toast({ title: "TAS Context Brief Generated" });
      queryClient.invalidateQueries({ queryKey: ["tas-context-brief", stageInstanceId] });
    },
    onError: (err) => {
      toast({ title: "Error", description: String(err), variant: "destructive" });
    },
  });

  // Save edited brief
  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!brief) return;
      const { error } = await supabase
        .from("tas_context_briefs")
        .update({ brief_markdown: editedMarkdown })
        .eq("id", brief.id);
      if (error) throw error;

      await supabase.from("research_audit_log").insert({
        user_id: user?.id,
        job_id: brief.generated_from_job_id,
        action: "brief_edited",
        details: { brief_id: brief.id },
      });
    },
    onSuccess: () => {
      toast({ title: "Brief saved" });
      setIsEditing(false);
      queryClient.invalidateQueries({ queryKey: ["tas-context-brief", stageInstanceId] });
    },
    onError: (err) => {
      toast({ title: "Save failed", description: String(err), variant: "destructive" });
    },
  });

  // Review mutation
  const reviewMutation = useMutation({
    mutationFn: async (status: "reviewed" | "approved") => {
      if (!brief) return;
      const { error } = await supabase
        .from("tas_context_briefs")
        .update({
          status,
          reviewed_by_user_id: user?.id,
          reviewed_at: new Date().toISOString(),
        })
        .eq("id", brief.id);
      if (error) throw error;

      await supabase.from("research_audit_log").insert({
        user_id: user?.id,
        job_id: brief.generated_from_job_id,
        action: status === "approved" ? "brief_approved" : "brief_reviewed",
        details: { brief_id: brief.id },
      });
    },
    onSuccess: (_, status) => {
      toast({ title: `Brief ${status}` });
      queryClient.invalidateQueries({ queryKey: ["tas-context-brief", stageInstanceId] });
    },
    onError: (err) => {
      toast({ title: "Error", description: String(err), variant: "destructive" });
    },
  });

  // Create tasks mutation
  const createTasksMutation = useMutation({
    mutationFn: async () => {
      if (!brief) return;
      const tasks = TAS_TASK_TEMPLATES.map(name => ({
        name,
        description: `From TAS Context Brief. Job: ${brief.generated_from_job_id}`,
        tenant_id: tenantId,
        assigned_to: user?.id,
        status: "open",
        created_by: user?.id,
      }));

      // Insert tasks one by one to handle schema differences
      for (const task of tasks) {
        await supabase.from("tasks").insert(task);
      }

      await supabase.from("research_audit_log").insert({
        user_id: user?.id,
        job_id: brief.generated_from_job_id,
        action: "task_set_created_from_brief",
        details: { brief_id: brief.id, task_count: tasks.length },
      });
    },
    onSuccess: () => {
      toast({ title: "TAS Build Tasks Created", description: `${TAS_TASK_TEMPLATES.length} tasks created` });
    },
    onError: (err) => {
      toast({ title: "Error", description: String(err), variant: "destructive" });
    },
  });

  const riskFlags = (brief?.brief_json as any)?.risk_flags || [];
  const briefCitations = (brief?.brief_json as any)?.citations || [];

  if (!isVivacityTeam) return null;

  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen}>
      <Card>
        <CollapsibleTrigger asChild>
          <CardHeader className="cursor-pointer hover:bg-muted/30 transition-colors pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm flex items-center gap-2">
                <BookOpen className="h-4 w-4 text-primary" />
                TAS Context Assistant
              </CardTitle>
              <div className="flex items-center gap-2">
                {brief && (
                  <Badge
                    variant={brief.status === "approved" ? "default" : brief.status === "reviewed" ? "secondary" : "outline"}
                    className="text-[10px]"
                  >
                    {brief.status === "draft" && <Clock className="h-2.5 w-2.5 mr-0.5" />}
                    {brief.status === "approved" && <CheckCircle2 className="h-2.5 w-2.5 mr-0.5" />}
                    {brief.status}
                  </Badge>
                )}
                {isOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
              </div>
            </div>
          </CardHeader>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <CardContent className="space-y-4 pt-0">
            {/* Generation form (show if no brief exists) */}
            {!brief && !briefLoading && (
              <div className="space-y-3 p-3 rounded-md border bg-muted/20">
                <p className="text-xs text-muted-foreground">
                  Generate a structured context brief to support TAS development. This does not create or modify the TAS document.
                </p>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <Label className="text-xs">Qualification Code</Label>
                    <Input
                      value={qualCode}
                      onChange={e => setQualCode(e.target.value)}
                      placeholder="e.g. BSB50120"
                      className="h-8 text-xs"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Delivery Mode</Label>
                    <Select value={deliveryMode} onValueChange={setDeliveryMode}>
                      <SelectTrigger className="h-8 text-xs">
                        <SelectValue placeholder="Select..." />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="onsite">Onsite</SelectItem>
                        <SelectItem value="online">Online</SelectItem>
                        <SelectItem value="blended">Blended</SelectItem>
                        <SelectItem value="workplace">Workplace</SelectItem>
                        <SelectItem value="mixed">Mixed</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">training.gov.au URL</Label>
                    <Input
                      value={tgaUrl}
                      onChange={e => setTgaUrl(e.target.value)}
                      placeholder="https://training.gov.au/Training/Details/..."
                      className="h-8 text-xs"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Client Website URL</Label>
                    <Input
                      value={clientUrl}
                      onChange={e => setClientUrl(e.target.value)}
                      placeholder="https://example.edu.au"
                      className="h-8 text-xs"
                    />
                  </div>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Audience Notes</Label>
                  <Textarea
                    value={audienceNotes}
                    onChange={e => setAudienceNotes(e.target.value)}
                    placeholder="e.g. Mature-age learners, international students..."
                    className="text-xs h-16"
                  />
                </div>
                <Button
                  size="sm"
                  onClick={() => generateMutation.mutate()}
                  disabled={generateMutation.isPending}
                  className="gap-1 text-xs"
                >
                  {generateMutation.isPending ? (
                    <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Generating...</>
                  ) : (
                    <><BookOpen className="h-3.5 w-3.5" /> Generate TAS Context Brief</>
                  )}
                </Button>
              </div>
            )}

            {briefLoading && (
              <div className="flex items-center justify-center py-6">
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              </div>
            )}

            {/* Brief display */}
            {brief && (
              <>
                {/* Meta */}
                <div className="flex items-center gap-3 text-xs text-muted-foreground flex-wrap">
                  <span>Generated {formatDistanceToNow(new Date(brief.created_at), { addSuffix: true })}</span>
                  {brief.qualification_code && <Badge variant="outline" className="text-[10px]">{brief.qualification_code}</Badge>}
                  {brief.delivery_mode && <Badge variant="outline" className="text-[10px]">{brief.delivery_mode}</Badge>}
                </div>

                {/* Sources */}
                {sources && sources.length > 0 && (
                  <div>
                    <h4 className="text-xs font-semibold mb-1">Sources ({sources.length})</h4>
                    <div className="space-y-1">
                      {sources.map(s => (
                        <div key={s.id} className="flex items-center gap-2 text-[10px] text-muted-foreground">
                          <a href={s.url} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline truncate flex-1">
                            {s.title || s.url}
                          </a>
                          <span>{format(new Date(s.retrieved_at), "dd MMM HH:mm")}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                <Separator />

                {/* Brief content */}
                {isEditing ? (
                  <div className="space-y-2">
                    <Textarea
                      value={editedMarkdown}
                      onChange={e => setEditedMarkdown(e.target.value)}
                      className="text-xs min-h-[300px] font-mono"
                    />
                    <div className="flex gap-2">
                      <Button size="sm" onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending} className="gap-1 text-xs">
                        <Save className="h-3 w-3" /> Save
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => setIsEditing(false)} className="text-xs">
                        Cancel
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="relative">
                    <Button
                      size="sm"
                      variant="ghost"
                      className="absolute top-0 right-0 h-6 text-[10px] gap-0.5"
                      onClick={() => {
                        setEditedMarkdown(brief.brief_markdown);
                        setIsEditing(true);
                      }}
                    >
                      <Edit2 className="h-3 w-3" /> Edit
                    </Button>
                    <ScrollArea className="max-h-[400px]">
                      <div className="text-xs prose prose-sm dark:prose-invert max-w-none whitespace-pre-wrap pr-16">
                        {brief.brief_markdown}
                      </div>
                    </ScrollArea>
                  </div>
                )}

                {/* Risk Flags */}
                {riskFlags.length > 0 && (
                  <>
                    <Separator />
                    <div>
                      <h4 className="text-xs font-semibold mb-2 flex items-center gap-1">
                        <Shield className="h-3.5 w-3.5" />
                        Risk Indicators ({riskFlags.length})
                      </h4>
                      <div className="space-y-1.5">
                        {riskFlags.map((flag: any, i: number) => (
                          <div key={i} className="flex items-start gap-2 p-2 rounded border text-xs">
                            <Badge variant="outline" className={`text-[9px] shrink-0 ${SEVERITY_COLORS[flag.severity] || ""}`}>
                              {flag.severity}
                            </Badge>
                            <div className="flex-1 min-w-0">
                              <span className="font-medium">{flag.risk_category}</span>
                              {flag.standard_clause && <span className="text-muted-foreground ml-1">· {flag.standard_clause}</span>}
                              {flag.claim_excerpt && <p className="text-muted-foreground mt-0.5 italic">"{flag.claim_excerpt}"</p>}
                            </div>
                            {flag.source_url && (
                              <a href={flag.source_url} target="_blank" rel="noopener noreferrer" className="text-primary shrink-0">
                                <ExternalLink className="h-3 w-3" />
                              </a>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  </>
                )}

                {/* Citations */}
                {briefCitations.length > 0 && (
                  <>
                    <Separator />
                    <div>
                      <h4 className="text-xs font-semibold mb-1">Citations ({briefCitations.length})</h4>
                      <div className="space-y-0.5">
                        {briefCitations.map((c: any) => (
                          <a key={c.index || c.url} href={c.url} target="_blank" rel="noopener noreferrer"
                            className="block text-[10px] text-primary hover:underline truncate"
                          >
                            [{c.index}] {c.url}
                          </a>
                        ))}
                      </div>
                    </div>
                  </>
                )}

                <Separator />

                {/* Review + Task actions */}
                <div className="flex items-center gap-2 flex-wrap">
                  {brief.status === "draft" && (
                    <>
                      <Button size="sm" variant="outline" onClick={() => reviewMutation.mutate("reviewed")}
                        disabled={reviewMutation.isPending} className="gap-1 text-xs">
                        <CheckCircle2 className="h-3.5 w-3.5" /> Mark Reviewed
                      </Button>
                      <Button size="sm" onClick={() => reviewMutation.mutate("approved")}
                        disabled={reviewMutation.isPending} className="gap-1 text-xs">
                        <CheckCircle2 className="h-3.5 w-3.5" /> Approve Brief
                      </Button>
                    </>
                  )}
                  {brief.status === "reviewed" && (
                    <Button size="sm" onClick={() => reviewMutation.mutate("approved")}
                      disabled={reviewMutation.isPending} className="gap-1 text-xs">
                      <CheckCircle2 className="h-3.5 w-3.5" /> Approve Brief
                    </Button>
                  )}
                  <Button size="sm" variant="outline" onClick={() => createTasksMutation.mutate()}
                    disabled={createTasksMutation.isPending} className="gap-1 text-xs">
                    <ListTodo className="h-3.5 w-3.5" /> Create TAS Build Tasks
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => {
                    // Regenerate
                    setQualCode(brief.qualification_code || "");
                    setDeliveryMode(brief.delivery_mode || "");
                    setAudienceNotes(brief.audience_notes || "");
                    // Clear brief to show form
                    queryClient.setQueryData(["tas-context-brief", stageInstanceId], null);
                  }} className="text-xs">
                    Regenerate
                  </Button>
                </div>

                {brief.status !== "approved" && (
                  <div className="flex items-center gap-1.5 text-[10px] text-amber-600 bg-amber-500/5 p-2 rounded-md">
                    <AlertTriangle className="h-3 w-3" />
                    AI draft — requires human review before use
                  </div>
                )}
              </>
            )}
          </CardContent>
        </CollapsibleContent>
      </Card>
    </Collapsible>
  );
}
