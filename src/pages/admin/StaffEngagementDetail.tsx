import { useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { ArrowLeft, AlertTriangle, MoreHorizontal, Check, Copy } from "lucide-react";

import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import { toast } from "@/hooks/use-toast";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { EXIT_INTERVIEW_SECTIONS, RATING_LABELS } from "../exitInterviewSchema";


import {
  ONBOARDING_PHASES,
  OFFBOARDING_PHASES,
  findItemLabel,
  type ChecklistPhase,
} from "./staffEngagementChecklists";

type Engagement = {
  id: string;
  first_name: string;
  last_name: string;

  person_email: string;
  role: string;
  engagement_type: string;
  type: string;
  status: string;
  start_date: string | null;
  linked_unicorn_user_id: string | null;
  created_at: string;
};

type Completion = {
  item_key: string;
  completed_by: string | null;
  completed_at: string;
};


function fmtDate(d: string | null | undefined) {
  if (!d) return "—";
  try { return format(new Date(d), "dd MMMM yyyy"); } catch { return "—"; }
}
function fmtDateTime(d: string | null | undefined) {
  if (!d) return "—";
  try { return format(new Date(d), "dd MMMM yyyy HH:mm"); } catch { return "—"; }
}

function StatusBadge({ value }: { value: string }) {
  const map: Record<string, { label: string; cls: string }> = {
    in_progress: { label: "In Progress", cls: "border-blue-500/40 bg-blue-500/10 text-blue-700 dark:text-blue-300" },
    pending_signoff: { label: "Pending Sign-Off", cls: "border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-300" },
    completed: { label: "Completed", cls: "border-green-500/40 bg-green-500/10 text-green-700 dark:text-green-300" },
    cancelled: { label: "Cancelled", cls: "border-muted bg-muted text-muted-foreground" },
  };
  const e = map[value] ?? { label: value, cls: "" };
  return <Badge variant="outline" className={e.cls}>{e.label}</Badge>;
}

function PhaseProgress({
  phases,
  completedKeys,
}: {
  phases: ChecklistPhase[];
  completedKeys: Set<string>;
}) {
  const phaseStates = phases.map((phase) => {
    const allItems = phase.sections.flatMap((s) => s.items);
    if (allItems.length === 0) return false;
    return allItems.every((i) => completedKeys.has(i.key));
  });
  const activeIdx = phaseStates.findIndex((s) => !s);

  return (
    <div className="flex items-start justify-between gap-2 py-4">
      {phases.map((phase, idx) => {
        const filled = phaseStates[idx];
        const active = !filled && idx === activeIdx;
        return (
          <div key={phase.key} className="flex-1 flex flex-col items-center relative">
            {idx < phases.length - 1 && (
              <div
                className={cn(
                  "absolute top-3 left-1/2 right-[-50%] h-0.5 -z-0",
                  phaseStates[idx] ? "bg-purple-600" : "bg-muted"
                )}
              />
            )}
            <div
              className={cn(
                "h-6 w-6 rounded-full border-2 z-10 bg-background",
                filled && "bg-purple-600 border-purple-600",
                active && "border-purple-600",
                !filled && !active && "border-muted-foreground/30"
              )}
            />
            <div className={cn(
              "mt-2 text-xs font-medium text-center",
              (filled || active) ? "text-foreground" : "text-muted-foreground"
            )}>
              {phase.label}
            </div>
          </div>
        );
      })}
    </div>
  );
}

export default function StaffEngagementDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { profile } = useAuth();
  const role = profile?.unicorn_role;
  const allowed = role === "Super Admin" || role === "Integrator";
  const queryClient = useQueryClient();
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [inviteDialogOpen, setInviteDialogOpen] = useState(false);
  const [inviteRole, setInviteRole] = useState("Team Member");
  const [confirmRevoke, setConfirmRevoke] = useState(false);
  const [linkUserOpen, setLinkUserOpen] = useState(false);
  const [linkSearch, setLinkSearch] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);

  const engagementQuery = useQuery({
    queryKey: ["staff_engagement", id],
    enabled: !!id && allowed,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("staff_engagements")
        .select("*")
        .eq("id", id!)
        .single();
      if (error) throw error;
      return data as Engagement;
    },
  });

  const completionsQuery = useQuery({
    queryKey: ["checklist_completions", id],
    enabled: !!id && allowed,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("checklist_item_completions")
        .select("item_key, completed_by, completed_at")
        .eq("engagement_id", id!);
      if (error) throw error;
      return (data ?? []) as Completion[];
    },
  });

  const userNamesQuery = useQuery({
    queryKey: [
      "checklist_user_names",
      id,
      (completionsQuery.data ?? []).map((c) => c.completed_by).filter(Boolean),
    ],
    enabled:
      !!id &&
      allowed &&
      (completionsQuery.data?.length ?? 0) > 0,
    queryFn: async () => {
      const completionUuids = (completionsQuery.data ?? [])
        .map((c) => c.completed_by)
        .filter(Boolean) as string[];
      const uniqueUuids = [...new Set(completionUuids)];
      if (uniqueUuids.length === 0) return [];
      const { data, error } = await supabase
        .from("users")
        .select("user_uuid, full_name")
        .in("user_uuid", uniqueUuids);
      if (error) throw error;
      return (data ?? []) as Array<{ user_uuid: string; full_name: string | null }>;
    },
  });

  const userSearchQuery = useQuery({
    queryKey: ["vivacity_user_search", linkSearch],
    enabled: linkSearch.length >= 2,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("users")
        .select("user_uuid, full_name")
        .eq("is_vivacity_internal", true)
        .eq("is_system_account", false)
        .ilike("full_name", `%${linkSearch}%`)
        .limit(8);
      if (error) throw error;
      return (data ?? []) as Array<{ user_uuid: string; full_name: string | null }>;
    },
  });

  const engagement = engagementQuery.data;
  const completions = useMemo(() => completionsQuery.data ?? [], [completionsQuery.data]);

  const exitInterviewQuery = useQuery({
    queryKey: ["engagement_exit_interview", id],
    enabled: !!id && engagement?.type === "offboarding",
    queryFn: async () => {
      const { data, error } = await supabase
        .from("engagement_exit_interviews")
        .select("id, responses, is_submitted, submitted_at, submitted_by")
        .eq("engagement_id", id!)
        .maybeSingle();
      if (error) throw error;
      return data as {
        id: string;
        responses: Record<string, unknown> | null;
        is_submitted: boolean;
        submitted_at: string | null;
        submitted_by: string | null;
      } | null;
    },
  });

  const exitSubmitterQuery = useQuery({
    queryKey: ["engagement_exit_submitter", exitInterviewQuery.data?.submitted_by],
    enabled: !!exitInterviewQuery.data?.submitted_by,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("users")
        .select("user_uuid, full_name")
        .eq("user_uuid", exitInterviewQuery.data!.submitted_by!)
        .maybeSingle();
      if (error) throw error;
      return data as { user_uuid: string; full_name: string | null } | null;
    },
  });

  const phases = useMemo<ChecklistPhase[]>(() => {
    if (!engagement) return [];
    return engagement.type === "offboarding" ? OFFBOARDING_PHASES : ONBOARDING_PHASES;
  }, [engagement]);

  const completedKeys = useMemo(() => new Set(completions.map((c) => c.item_key)), [completions]);
  const completedByMap = useMemo(() => {
    const m = new Map<string, Completion>();
    completions.forEach((c) => m.set(c.item_key, c));
    return m;
  }, [completions]);

  const userNameMap = useMemo(() => {
    const m = new Map<string, string>();
    (userNamesQuery.data ?? []).forEach((u) => {
      if (u.user_uuid && u.full_name) m.set(u.user_uuid, u.full_name);
    });
    return m;
  }, [userNamesQuery.data]);

  const criticalKeys = useMemo(
    () =>
      phases.flatMap((p) =>
        p.sections.flatMap((s) => s.items.filter((i) => i.critical).map((i) => i.key))
      ),
    [phases]
  );
  const allCriticalDone =
    criticalKeys.length > 0 && criticalKeys.every((k) => completedKeys.has(k));

  const cancelMutation = useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from("staff_engagements")
        .update({ status: "cancelled" })
        .eq("id", id!);
      if (error) throw error;
    },
    onSuccess: () => {
      toast({ title: "Engagement cancelled" });
      queryClient.invalidateQueries({ queryKey: ["staff_engagement", id] });
      queryClient.invalidateQueries({ queryKey: ["staff_engagements"] });
      setConfirmCancel(false);
    },
    onError: (e) => toast({ title: "Could not cancel", description: e?.message, variant: "destructive" }),
  });

  const toggleMutation = useMutation({
    mutationFn: async ({ itemKey, checked }: { itemKey: string; checked: boolean }) => {
      const { data: userRes, error: userErr } = await supabase.auth.getUser();
      if (userErr || !userRes.user) throw new Error("Not authenticated");

      if (checked) {
        const { error } = await supabase.from("checklist_item_completions").insert({
          engagement_id: id!,
          item_key: itemKey,
          completed_by: userRes.user.id,
          completed_at: new Date().toISOString(),
        });
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("checklist_item_completions")
          .delete()
          .eq("engagement_id", id!)
          .eq("item_key", itemKey);
        if (error) throw error;
      }

    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["checklist_completions", id] });
      queryClient.invalidateQueries({ queryKey: ["checklist_activity", id] });
      queryClient.invalidateQueries({ queryKey: ["staff_engagement", id] });
      queryClient.invalidateQueries({ queryKey: ["staff_engagements"] });
    },
    onError: (e) => toast({ title: "Could not update", description: e?.message, variant: "destructive" }),
  });

  const completeMutation = useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from("staff_engagements")
        .update({ status: "completed" })
        .eq("id", id!);
      if (error) throw error;
    },
    onSuccess: () => {
      toast({ title: "Engagement completed" });
      queryClient.invalidateQueries({ queryKey: ["staff_engagement", id] });
      queryClient.invalidateQueries({ queryKey: ["staff_engagements"] });
    },
    onError: (e) =>
      toast({ title: "Could not complete", description: e?.message, variant: "destructive" }),
  });

  const inviteMutation = useMutation({
    mutationFn: async ({ role: inviteAsRole }: { role: string }) => {
      if (!engagement) throw new Error("Engagement not loaded");
      const res = await supabase.functions.invoke("invite-user", {
        body: {
          email: engagement.person_email,
          unicorn_role: inviteAsRole,
          first_name: engagement.first_name,
          last_name: engagement.last_name,
          invite_as: "VIVACITY",
          tenant_id: 6372,
        },
      });

      const resData = res.data as { ok?: boolean; detail?: string } | null;
      if (res.error || resData?.ok !== true) {
        throw new Error(resData?.detail ?? res.error?.message ?? "Invite failed");
      }
      const { data: userRes, error: userErr } = await supabase.auth.getUser();
      if (userErr || !userRes.user) throw new Error("Not authenticated");
      const { error } = await supabase.from("checklist_item_completions").insert({
        engagement_id: id!,
        item_key: "access.unicorn_provisioned",
        completed_by: userRes.user.id,
        completed_at: new Date().toISOString(),
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast({ title: "Invite sent" });
      setInviteDialogOpen(false);
      queryClient.invalidateQueries({ queryKey: ["checklist_completions", id] });
      queryClient.invalidateQueries({ queryKey: ["checklist_activity", id] });
      queryClient.invalidateQueries({ queryKey: ["staff_engagement", id] });
      queryClient.invalidateQueries({ queryKey: ["staff_engagements"] });
    },
    onError: (e) =>
      toast({ title: "Could not send invite", description: e?.message, variant: "destructive" }),
  });

  const revokeMutation = useMutation({
    mutationFn: async () => {
      if (!engagement?.linked_unicorn_user_id) throw new Error("No linked user");
      const { error: updErr } = await supabase
        .from("users")
        .update({ disabled: true })
        .eq("user_uuid", engagement.linked_unicorn_user_id);
      if (updErr) throw updErr;
      const { data: userRes, error: userErr } = await supabase.auth.getUser();
      if (userErr || !userRes.user) throw new Error("Not authenticated");
      const { error } = await supabase.from("checklist_item_completions").insert({
        engagement_id: id!,
        item_key: "access_revoke.unicorn",
        completed_by: userRes.user.id,
        completed_at: new Date().toISOString(),
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast({ title: "Access revoked" });
      setConfirmRevoke(false);
      queryClient.invalidateQueries({ queryKey: ["checklist_completions", id] });
      queryClient.invalidateQueries({ queryKey: ["checklist_activity", id] });
      queryClient.invalidateQueries({ queryKey: ["staff_engagement", id] });
      queryClient.invalidateQueries({ queryKey: ["staff_engagements"] });
    },
    onError: (e) =>
      toast({ title: "Could not revoke access", description: e?.message, variant: "destructive" }),
  });

  const linkUserMutation = useMutation({
    mutationFn: async ({ userUuid }: { userUuid: string }) => {
      const { error } = await supabase
        .from("staff_engagements")
        .update({ linked_unicorn_user_id: userUuid })
        .eq("id", id!);
      if (error) throw error;
    },
    onSuccess: () => {
      toast({ title: "User linked" });
      setLinkUserOpen(false);
      setLinkSearch("");
      queryClient.invalidateQueries({ queryKey: ["staff_engagement", id] });
      queryClient.invalidateQueries({ queryKey: ["staff_engagements"] });
    },
    onError: (e) =>
      toast({ title: "Could not link user", description: e?.message, variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from("staff_engagements")
        .delete()
        .eq("id", id!);
      if (error) throw error;
    },
    onSuccess: () => {
      toast({ title: "Engagement deleted" });
      queryClient.invalidateQueries({ queryKey: ["staff_engagements"] });
      navigate("/admin/staff-engagements");
    },
    onError: (e) =>
      toast({ title: "Could not delete", description: e?.message, variant: "destructive" }),
  });



  if (!allowed) {
    return (
      <div className="p-8">
        <h1 className="text-2xl font-semibold">Access denied</h1>
        <p className="text-muted-foreground mt-2">You do not have permission to view this page.</p>
      </div>
    );
  }

  if (engagementQuery.isLoading || !engagement) {
    return (
      <div className="p-6 text-muted-foreground">Loading…</div>
    );
  }

  const manageDisabled = engagement.status === "completed" || engagement.status === "cancelled";
  const typeLabel = engagement.type === "offboarding" ? "Offboarding" : "Onboarding";

  return (
    <>
      <div className="p-6 space-y-6 max-w-5xl">
        <button
          onClick={() => navigate("/admin/staff-engagements")}
          className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4 mr-1" /> Back to People
        </button>

        <div className="flex items-start justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-3 flex-wrap">
              <h1 className="text-2xl font-semibold">
                {`${engagement.first_name} ${engagement.last_name}`} — {engagement.role}
              </h1>
              <StatusBadge value={engagement.status} />
            </div>
            <p className="text-sm text-muted-foreground">
              Started {fmtDate(engagement.start_date)} · Type: {typeLabel}
            </p>
          </div>
          <div className="flex items-center gap-2">
            {(engagement.status === "in_progress" || engagement.status === "pending_signoff") && allCriticalDone && (
              <Button
                variant="default"
                disabled={completeMutation.isPending}
                onClick={() => completeMutation.mutate()}
              >
                {completeMutation.isPending ? "Completing…" : "Mark as Complete"}
              </Button>
            )}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline">
                  Manage <MoreHorizontal className="h-4 w-4 ml-2" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem
                  disabled={manageDisabled}
                  onSelect={(e) => { e.preventDefault(); setConfirmCancel(true); }}
                >
                  Cancel Engagement
                </DropdownMenuItem>
                {!engagement.linked_unicorn_user_id && (
                  <DropdownMenuItem
                    onSelect={(e) => { e.preventDefault(); setLinkUserOpen(true); }}
                  >
                    Link Unicorn User
                  </DropdownMenuItem>
                )}
                {!!engagement.linked_unicorn_user_id && (
                  <DropdownMenuItem
                    onSelect={async (e) => {
                      e.preventDefault();
                      await supabase
                        .from("staff_engagements")
                        .update({ linked_unicorn_user_id: null })
                        .eq("id", id!);
                      queryClient.invalidateQueries({ queryKey: ["staff_engagement", id] });
                      queryClient.invalidateQueries({ queryKey: ["staff_engagements"] });
                      toast({ title: "User unlinked" });
                    }}
                  >
                    Unlink User
                  </DropdownMenuItem>
                )}
                {role === "Super Admin" && (
                  <DropdownMenuItem
                    className="text-destructive focus:text-destructive"
                    onSelect={(e) => { e.preventDefault(); setConfirmDelete(true); }}
                  >
                    Delete Engagement
                  </DropdownMenuItem>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>

        {(() => {
          const checklistBody = (
            <>
              <PhaseProgress phases={phases} completedKeys={completedKeys} />
              <div className="space-y-6 mt-4">
          {phases.map((phase) => {

              const defaultOpen = phase.sections.map((s) => s.key);
              return (
                <div key={phase.key} className="space-y-2">
                  <h2 className="text-sm font-semibold tracking-wide text-muted-foreground">
                    {phase.label}
                  </h2>
                  <Accordion type="multiple" defaultValue={defaultOpen} className="border rounded-md">
                    {phase.sections.map((section) => {
                      const done = section.items.filter((i) => completedKeys.has(i.key)).length;
                      return (
                        <AccordionItem key={section.key} value={section.key} className="px-4">
                          <AccordionTrigger className="hover:no-underline">
                            <div className="flex items-center justify-between w-full pr-2">
                              <span className="font-medium">{section.label}</span>
                              <span className="text-xs text-muted-foreground">
                                {done} / {section.items.length}
                              </span>
                            </div>
                          </AccordionTrigger>
                          <AccordionContent>
                            <div className="space-y-3 pb-2">
                              {section.items.map((item) => {
                                const checked = completedKeys.has(item.key);
                                const c = completedByMap.get(item.key);
                                const who = c?.completed_by
                                  ? userNameMap.get(c.completed_by) ?? "Unknown user"
                                  : null;
                                if (item.key === "access.unicorn_provisioned") {
                                  return (
                                    <div key={item.key} className="flex items-start gap-3">
                                      {checked ? (
                                        <Check className="h-4 w-4 text-green-600 mt-0.5 shrink-0" />
                                      ) : (
                                        <div className="h-4 w-4 mt-0.5 shrink-0" />
                                      )}
                                      <div className="flex-1 min-w-0">
                                        <div className="flex items-center gap-2 flex-wrap">
                                          <span className={cn("text-sm", checked && "line-through text-muted-foreground")}>
                                            {item.label}
                                          </span>
                                          {item.critical && (
                                            <AlertTriangle className="h-4 w-4 text-amber-500" />
                                          )}
                                        </div>
                                        {checked && c && (
                                          <div className="text-xs text-muted-foreground mt-0.5">
                                            {who ?? "Unknown user"} · {fmtDateTime(c.completed_at)}
                                          </div>
                                        )}
                                      </div>
                                      <span className="text-xs text-muted-foreground whitespace-nowrap">
                                        {item.owner}
                                      </span>
                                      {!checked && (
                                        <Button
                                          size="sm"
                                          variant="outline"
                                          onClick={() => setInviteDialogOpen(true)}
                                        >
                                          Create &amp; Invite
                                        </Button>
                                      )}
                                    </div>
                                  );
                                }
                                if (item.key === "access_revoke.unicorn") {
                                  const noLink = !engagement.linked_unicorn_user_id;
                                  const revokeBtn = (
                                    <Button
                                      size="sm"
                                      variant="destructive"
                                      disabled={noLink || revokeMutation.isPending}
                                      onClick={() => setConfirmRevoke(true)}
                                    >
                                      Revoke Access
                                    </Button>
                                  );
                                  return (
                                    <div key={item.key} className="flex items-start gap-3">
                                      {checked ? (
                                        <Check className="h-4 w-4 text-green-600 mt-0.5 shrink-0" />
                                      ) : (
                                        <div className="h-4 w-4 mt-0.5 shrink-0" />
                                      )}
                                      <div className="flex-1 min-w-0">
                                        <div className="flex items-center gap-2 flex-wrap">
                                          <span className={cn("text-sm", checked && "line-through text-muted-foreground")}>
                                            {item.label}
                                          </span>
                                          {item.critical && (
                                            <AlertTriangle className="h-4 w-4 text-amber-500" />
                                          )}
                                        </div>
                                        {checked && c && (
                                          <div className="text-xs text-muted-foreground mt-0.5">
                                            {who ?? "Unknown user"} · {fmtDateTime(c.completed_at)}
                                          </div>
                                        )}
                                      </div>
                                      <span className="text-xs text-muted-foreground whitespace-nowrap">
                                        {item.owner}
                                      </span>
                                      {!checked &&
                                        (noLink ? (
                                          <TooltipProvider>
                                            <Tooltip>
                                              <TooltipTrigger asChild>
                                                <span className="inline-block">{revokeBtn}</span>
                                              </TooltipTrigger>
                                              <TooltipContent>Link a Unicorn user first</TooltipContent>
                                            </Tooltip>
                                          </TooltipProvider>
                                        ) : (
                                          revokeBtn
                                        ))}
                                    </div>
                                  );
                                }
                                return (
                                  <div key={item.key} className="flex items-start gap-3">
                                    <Checkbox
                                      checked={checked}
                                      disabled={toggleMutation.isPending}
                                      onCheckedChange={(v) =>
                                        toggleMutation.mutate({ itemKey: item.key, checked: !!v })
                                      }
                                      className="mt-0.5"
                                    />
                                    <div className="flex-1 min-w-0">
                                      <div className="flex items-center gap-2 flex-wrap">
                                        <span className={cn("text-sm", checked && "line-through text-muted-foreground")}>
                                          {item.label}
                                        </span>
                                        {item.critical && (
                                          <AlertTriangle className="h-4 w-4 text-amber-500" />
                                        )}
                                      </div>
                                      {checked && c && (
                                        <div className="text-xs text-muted-foreground mt-0.5">
                                          {who ?? "Unknown user"} · {fmtDateTime(c.completed_at)}
                                        </div>
                                      )}
                                    </div>
                                    <span className="text-xs text-muted-foreground whitespace-nowrap">
                                      {item.owner}
                                    </span>
                                  </div>
                                );
                              })}
                            </div>
                          </AccordionContent>
                        </AccordionItem>
                      );
                    })}
                  </Accordion>
                </div>
              );
            })}
              </div>
            </>
          );
          if (engagement.type === "offboarding") {
            return (
              <Tabs defaultValue="checklist" className="mt-4">
                <TabsList>
                  <TabsTrigger value="checklist">Checklist</TabsTrigger>
                  <TabsTrigger value="exit_interview">Exit Interview</TabsTrigger>
                </TabsList>
                <TabsContent value="checklist" className="space-y-4 mt-4">
                  {checklistBody}
                </TabsContent>
                <TabsContent value="exit_interview" className="mt-4">
                  <ExitInterviewTabContent
                    interview={exitInterviewQuery.data ?? null}
                    submitterName={exitSubmitterQuery.data?.full_name ?? null}
                    isLoading={exitInterviewQuery.isLoading}
                  />
                </TabsContent>
              </Tabs>
            );
          }
          return checklistBody;
        })()}
      </div>

      <AlertDialog open={confirmCancel} onOpenChange={setConfirmCancel}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Cancel this engagement?</AlertDialogTitle>
            <AlertDialogDescription>
              The engagement will be marked as cancelled. This can be undone manually but not from this UI.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={cancelMutation.isPending}>Keep</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => { e.preventDefault(); cancelMutation.mutate(); }}
              disabled={cancelMutation.isPending}
            >
              {cancelMutation.isPending ? "Cancelling…" : "Cancel Engagement"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog open={inviteDialogOpen} onOpenChange={setInviteDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create &amp; Invite to Unicorn</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Email</Label>
              <Input value={engagement.person_email ?? ""} readOnly />
            </div>
            <div className="space-y-2">
              <Label>Role</Label>
              <Select value={inviteRole} onValueChange={setInviteRole}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Super Admin">Super Admin</SelectItem>
                  <SelectItem value="Team Member">Team Member</SelectItem>
                  <SelectItem value="CSC">CSC</SelectItem>
                  <SelectItem value="Integrator">Integrator</SelectItem>
                  <SelectItem value="BGT">BGT</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setInviteDialogOpen(false)}
              disabled={inviteMutation.isPending}
            >
              Cancel
            </Button>
            <Button
              onClick={() => inviteMutation.mutate({ role: inviteRole })}
              disabled={inviteMutation.isPending}
            >
              {inviteMutation.isPending ? "Sending…" : "Send Invite"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={confirmRevoke} onOpenChange={setConfirmRevoke}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Revoke Unicorn access?</AlertDialogTitle>
            <AlertDialogDescription>
              {`This will immediately block ${engagement.first_name} ${engagement.last_name}'s access to Unicorn. They will see a disabled account message on next login.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={revokeMutation.isPending}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => { e.preventDefault(); revokeMutation.mutate(); }}
              disabled={revokeMutation.isPending}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {revokeMutation.isPending ? "Revoking…" : "Revoke Access"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog open={linkUserOpen} onOpenChange={(o) => { setLinkUserOpen(o); if (!o) setLinkSearch(""); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Link Unicorn User</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <Input
              placeholder="Search by name…"
              value={linkSearch}
              onChange={(e) => setLinkSearch(e.target.value)}
              autoFocus
            />
            <div className="max-h-72 overflow-y-auto space-y-1">
              {linkSearch.length < 2 ? (
                <p className="text-xs text-muted-foreground px-2 py-1">
                  Type at least 2 characters to search.
                </p>
              ) : userSearchQuery.isLoading ? (
                <p className="text-xs text-muted-foreground px-2 py-1">Searching…</p>
              ) : (userSearchQuery.data ?? []).length === 0 ? (
                <p className="text-xs text-muted-foreground px-2 py-1">No results</p>
              ) : (
                (userSearchQuery.data ?? []).map((u) => (
                  <button
                    key={u.user_uuid}
                    type="button"
                    disabled={linkUserMutation.isPending}
                    onClick={() => linkUserMutation.mutate({ userUuid: u.user_uuid })}
                    className="w-full text-left px-3 py-2 text-sm rounded-md hover:bg-muted disabled:opacity-50"
                  >
                    {u.full_name ?? "(no name)"}
                  </button>
                ))
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Permanently delete this engagement?</AlertDialogTitle>
            <AlertDialogDescription>
              {`This will permanently delete the engagement for ${engagement.first_name} ${engagement.last_name} and all associated checklist and sign-off data. This cannot be undone.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteMutation.isPending}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => { e.preventDefault(); deleteMutation.mutate(); }}
              disabled={deleteMutation.isPending}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleteMutation.isPending ? "Deleting…" : "Delete Permanently"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

function ExitInterviewTabContent({
  interview,
  submitterName,
  isLoading,
}: {
  interview: {
    id: string;
    responses: Record<string, unknown> | null;
    is_submitted: boolean;
    submitted_at: string | null;
    submitted_by: string | null;
  } | null;
  submitterName: string | null;
  isLoading: boolean;
}) {
  const [copied, setCopied] = useState(false);
  const link = `${window.location.origin}/my-exit-interview`;

  if (isLoading) {
    return <Card><CardContent className="p-6 text-sm text-muted-foreground">Loading…</CardContent></Card>;
  }

  if (!interview || !interview.is_submitted) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Exit Interview Not Yet Submitted</CardTitle>
          <CardDescription>
            Send the staff member this link to complete their interview:
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-2">
            <code className="flex-1 text-xs bg-muted px-3 py-2 rounded font-mono break-all">
              {link}
            </code>
            <Button
              size="sm"
              variant="outline"
              onClick={async () => {
                await navigator.clipboard.writeText(link);
                setCopied(true);
                setTimeout(() => setCopied(false), 2000);
              }}
            >
              <Copy className="h-4 w-4 mr-1" />
              {copied ? "Copied!" : "Copy"}
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  const responses = (interview.responses ?? {}) as Record<string, unknown>;

  return (
    <div className="space-y-6">
      <Card>
        <CardContent className="p-4 text-sm">
          Submitted by <span className="font-medium">{submitterName ?? "Unknown"}</span>
          {interview.submitted_at && (
            <> on <span className="font-medium">{fmtDateTime(interview.submitted_at)}</span></>
          )}
          .
        </CardContent>
      </Card>
      {EXIT_INTERVIEW_SECTIONS.map((section) => (
        <Card key={section.key}>
          <CardHeader>
            <CardTitle className="text-base">{section.title}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {section.questions.map((q) => {
              const val = responses[q.key];
              return (
                <div key={q.key} className="space-y-1">
                  <div className="text-sm font-medium">{q.label}</div>
                  {q.type === "rating" ? (
                    <div className="text-sm text-muted-foreground">
                      {typeof val === "number" ? `${val} — ${RATING_LABELS[val - 1] ?? ""}` : "—"}
                    </div>
                  ) : (
                    <div className="text-sm text-muted-foreground whitespace-pre-wrap">
                      {typeof val === "string" && val.trim() ? val : "—"}
                    </div>
                  )}
                </div>
              );
            })}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
