import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  AppModal,
  AppModalContent,
  AppModalHeader,
  AppModalTitle,
  AppModalBody,
  AppModalFooter,
} from "@/components/ui/modals";
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
import { toast } from "sonner";
import { Loader2, Paperclip, Send, Users, X } from "lucide-react";
import {
  BUCKET,
  MAX_FILES_PER_MESSAGE,
  formatBytes,
  sanitiseFilename,
  validateAttachment,
} from "@/lib/messageAttachments";

type TargetMode = "everyone" | "members" | "tier" | "package_type";
type Tier = "diamond" | "gold" | "ruby" | "sapphire" | "amethyst";
type PackageType = "membership" | "project" | "audit" | "regulatory_submission";

const TIER_OPTIONS: { value: Tier; label: string }[] = [
  { value: "diamond", label: "Diamond" },
  { value: "gold", label: "Gold" },
  { value: "ruby", label: "Ruby" },
  { value: "sapphire", label: "Sapphire" },
  { value: "amethyst", label: "Amethyst" },
];

const PACKAGE_TYPE_OPTIONS: { value: PackageType; label: string }[] = [
  { value: "membership", label: "Membership" },
  { value: "project", label: "Project" },
  { value: "audit", label: "Audit" },
  { value: "regulatory_submission", label: "Regulatory Submission" },
];

interface PreviewRow {
  tenant_id: number;
  user_id: string;
  tenant_name: string;
}

interface MessageCategory {
  id: string;
  code: string;
  name: string;
  display_order: number;
}

interface BulkMessageDialogProps {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  currentUserId?: string;
  onSent?: () => void;
}

export function BulkMessageDialog({
  open,
  onOpenChange,
  currentUserId,
  onSent,
}: BulkMessageDialogProps) {
  const qc = useQueryClient();
  const [step, setStep] = useState<1 | 2 | 3>(1);

  // Audience state
  const [targetMode, setTargetMode] = useState<TargetMode>("members");
  const [tier, setTier] = useState<Tier | "">("");
  const [packageType, setPackageType] = useState<PackageType | "">("");

  // Message state
  const [subject, setSubject] = useState("");
  const [categoryId, setCategoryId] = useState<string>("");
  const [body, setBody] = useState("");
  const [queuedFiles, setQueuedFiles] = useState<File[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Confirm dialog
  const [confirmOpen, setConfirmOpen] = useState(false);

  // Categories
  const { data: categories } = useQuery({
    queryKey: ["message-categories"],
    queryFn: async (): Promise<MessageCategory[]> => {
      const { data, error } = await supabase
        .from("message_categories")
        .select("id, code, name, display_order")
        .eq("is_active", true)
        .order("display_order", { ascending: true });
      if (error) throw error;
      return (data ?? []) as MessageCategory[];
    },
    staleTime: 5 * 60_000,
  });

  // Reset when closed
  useEffect(() => {
    if (!open) {
      setStep(1);
      setTargetMode("members");
      setTier("");
      setPackageType("");
      setSubject("");
      setCategoryId("");
      setBody("");
      setQueuedFiles([]);
      setConfirmOpen(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }, [open]);

  // Default category once list arrives
  useEffect(() => {
    if (!categoryId && categories && categories.length > 0) {
      const general = categories.find((c) => c.code?.toLowerCase() === "general");
      setCategoryId((general ?? categories[0]).id);
    }
  }, [categories, categoryId]);

  // Debounced preview key
  const [debouncedKey, setDebouncedKey] = useState<string>("");
  const targetingPackageType: string | null =
    targetMode === "tier"
      ? (tier || null)
      : targetMode === "package_type"
        ? (packageType || null)
        : null;

  const previewReady =
    (targetMode === "everyone") ||
    (targetMode === "members") ||
    (targetMode === "tier" && !!tier) ||
    (targetMode === "package_type" && !!packageType);

  useEffect(() => {
    if (!previewReady) {
      setDebouncedKey("");
      return;
    }
    const t = setTimeout(() => {
      setDebouncedKey(`${targetMode}|${targetingPackageType ?? ""}`);
    }, 400);
    return () => clearTimeout(t);
  }, [targetMode, targetingPackageType, previewReady]);

  const { data: preview, isFetching: previewLoading } = useQuery({
    queryKey: ["broadcast-preview", debouncedKey],
    enabled: !!debouncedKey,
    queryFn: async (): Promise<PreviewRow[]> => {
      const { data, error } = await supabase.rpc(
        "fn_preview_broadcast_recipients",
        {
          p_target_mode: targetMode,
          p_package_type: targetingPackageType,
          p_include_roles: ["parent"],
        },
      );
      if (error) throw error;
      return (data ?? []) as PreviewRow[];
    },
    staleTime: 30_000,
  });

  const recipientCount = preview?.length ?? 0;
  const tenantCount = useMemo(() => {
    if (!preview) return 0;
    return new Set(preview.map((r) => r.tenant_id)).size;
  }, [preview]);

  const audienceLabel = useMemo(() => {
    if (targetMode === "everyone") return "Everyone (all active tenants)";
    if (targetMode === "members") return "All active members";
    if (targetMode === "tier" && tier) {
      const t = TIER_OPTIONS.find((o) => o.value === tier);
      return `${t?.label ?? tier} members`;
    }
    if (targetMode === "package_type" && packageType) {
      const p = PACKAGE_TYPE_OPTIONS.find((o) => o.value === packageType);
      return `${p?.label ?? packageType} package holders`;
    }
    return "—";
  }, [targetMode, tier, packageType]);

  const onFilesPicked = (e: React.ChangeEvent<HTMLInputElement>) => {
    const picked = Array.from(e.target.files ?? []);
    if (fileInputRef.current) fileInputRef.current.value = "";
    if (!picked.length) return;
    const accepted: File[] = [];
    for (const f of picked) {
      if (queuedFiles.length + accepted.length >= MAX_FILES_PER_MESSAGE) {
        toast.error(`You can attach up to ${MAX_FILES_PER_MESSAGE} files per message.`);
        break;
      }
      try {
        validateAttachment(f);
        accepted.push(f);
      } catch (err: unknown) {
        toast.error(err instanceof Error ? err.message : "Invalid file");
      }
    }
    if (accepted.length) setQueuedFiles((prev) => [...prev, ...accepted]);
  };

  const removeQueued = (idx: number) => {
    setQueuedFiles((prev) => prev.filter((_, i) => i !== idx));
  };

  const sendMutation = useMutation({
    mutationFn: async () => {
      if (!currentUserId) throw new Error("Not signed in");
      const title =
        subject.trim() ||
        body.trim().split(/\s+/).slice(0, 8).join(" ").slice(0, 80) ||
        "Bulk Message";

      // 1. Insert draft campaign
      const { data: campaign, error: insertErr } = await supabase
        .from("broadcast_campaigns")
        .insert({
          title,
          body: body.trim(),
          target_mode: targetMode,
          package_type: targetingPackageType,
          include_roles: ["parent"],
          status: "draft",
          created_by: currentUserId,
        })
        .select("id")
        .single();
      if (insertErr) throw new Error(insertErr.message);

      const campaignId: string = campaign.id;

      // 2. Upload attachments (shared across all tenants) under broadcast/{campaign_id}/
      const uploaded: {
        storage_path: string;
        filename: string;
        mime_type: string;
        file_size: number;
      }[] = [];
      for (const f of queuedFiles) {
        const safeName = sanitiseFilename(f.name);
        const storage_path = `broadcast/${campaignId}/${Date.now()}_${safeName}`;
        const { error: upErr } = await supabase.storage
          .from(BUCKET)
          .upload(storage_path, f, { contentType: f.type, upsert: false });
        if (upErr) {
          throw new Error(`Attachment "${f.name}" failed to upload: ${upErr.message}`);
        }
        uploaded.push({
          storage_path,
          filename: f.name,
          mime_type: f.type,
          file_size: f.size,
        });
      }

      // 3. Queue (populates broadcast_recipients)
      const { error: queueErr } = await supabase.rpc(
        "fn_queue_broadcast_campaign",
        { p_campaign_id: campaignId },
      );
      if (queueErr) throw new Error(queueErr.message);

      // 4. Send
      const { data: sendData, error: sendErr } =
        await supabase.functions.invoke("send-broadcast-campaign", {
          body: {
            campaign_id: campaignId,
            category_id: categoryId || null,
            attachments: uploaded,
          },
        });
      if (sendErr) throw new Error(sendErr.message);
      return sendData as {
        total_sent: number;
        total_failed: number;
        conversations_created: number;
      };
    },
    onSuccess: (data) => {
      const msg =
        `Message sent to ${data.total_sent} recipients across ${data.conversations_created} clients` +
        (data.total_failed > 0
          ? ` — ${data.total_failed} failed, see Bulk Message History`
          : "");
      toast.success(msg);
      qc.invalidateQueries({ queryKey: ["broadcast-campaigns"] });
      qc.invalidateQueries({ queryKey: ["team-conversations"] });
      setConfirmOpen(false);
      onOpenChange(false);
      onSent?.();
    },
    onError: (err: Error) => {
      toast.error(err.message || "Failed to send bulk message");
    },
  });

  const canGoToStep2 =
    previewReady && !previewLoading && recipientCount > 0;
  const canGoToStep3 = body.trim().length > 0;

  return (
    <>
      <AppModal open={open} onOpenChange={onOpenChange}>
        <AppModalContent size="lg">
          <AppModalHeader>
            <AppModalTitle>
              New Bulk Message
              <span className="ml-2 text-sm font-normal text-muted-foreground">
                Step {step} of 3
              </span>
            </AppModalTitle>
          </AppModalHeader>
          <AppModalBody className="space-y-5">
            {step === 1 && (
              <>
                <div>
                  <label className="text-sm font-medium mb-1.5 block">
                    Send to
                  </label>
                  <Select
                    value={targetMode}
                    onValueChange={(v) => {
                      setTargetMode(v as TargetMode);
                      setTier("");
                      setPackageType("");
                    }}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="everyone">Everyone</SelectItem>
                      <SelectItem value="members">All Members</SelectItem>
                      <SelectItem value="tier">By membership tier</SelectItem>
                      <SelectItem value="package_type">By package type</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {targetMode === "tier" && (
                  <div>
                    <label className="text-sm font-medium mb-1.5 block">
                      Tier
                    </label>
                    <Select value={tier} onValueChange={(v) => setTier(v as Tier)}>
                      <SelectTrigger>
                        <SelectValue placeholder="Select a tier…" />
                      </SelectTrigger>
                      <SelectContent>
                        {TIER_OPTIONS.map((o) => (
                          <SelectItem key={o.value} value={o.value}>
                            {o.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}

                {targetMode === "package_type" && (
                  <div>
                    <label className="text-sm font-medium mb-1.5 block">
                      Package type
                    </label>
                    <Select
                      value={packageType}
                      onValueChange={(v) => setPackageType(v as PackageType)}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select a package type…" />
                      </SelectTrigger>
                      <SelectContent>
                        {PACKAGE_TYPE_OPTIONS.map((o) => (
                          <SelectItem key={o.value} value={o.value}>
                            {o.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}

                <div className="rounded-lg border border-border bg-muted/30 p-4 flex items-start gap-3">
                  <Users className="h-5 w-5 text-muted-foreground mt-0.5" />
                  <div className="text-sm">
                    {!previewReady && (
                      <span className="text-muted-foreground">
                        Select an audience to preview the recipient count.
                      </span>
                    )}
                    {previewReady && previewLoading && (
                      <span className="text-muted-foreground inline-flex items-center gap-2">
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        Calculating…
                      </span>
                    )}
                    {previewReady && !previewLoading && (
                      <>
                        {recipientCount === 0 ? (
                          <span className="text-destructive">
                            No clients match this audience.
                          </span>
                        ) : (
                          <>
                            This will message{" "}
                            <strong>{recipientCount}</strong>{" "}
                            {recipientCount === 1 ? "recipient" : "recipients"}
                            {tenantCount !== recipientCount && (
                              <> across <strong>{tenantCount}</strong> clients</>
                            )}
                            .
                          </>
                        )}
                      </>
                    )}
                  </div>
                </div>
              </>
            )}

            {step === 2 && (
              <>
                <div>
                  <label className="text-sm font-medium mb-1.5 block">
                    Subject (optional)
                  </label>
                  <Input
                    value={subject}
                    onChange={(e) => setSubject(e.target.value)}
                    placeholder="What is this about?"
                    maxLength={120}
                  />
                </div>
                <div>
                  <label className="text-sm font-medium mb-1.5 block">
                    Category
                  </label>
                  <Select value={categoryId} onValueChange={setCategoryId}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select a category…" />
                    </SelectTrigger>
                    <SelectContent>
                      {(categories ?? []).map((c) => (
                        <SelectItem key={c.id} value={c.id}>
                          {c.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <label className="text-sm font-medium mb-1.5 block">
                    Message
                  </label>
                  <Textarea
                    value={body}
                    onChange={(e) => setBody(e.target.value)}
                    placeholder="Type your bulk message…"
                    rows={7}
                  />
                </div>
                <div>
                  <label className="text-sm font-medium mb-1.5 block">
                    Attachments (optional)
                  </label>
                  <div className="flex items-center gap-2">
                    <input
                      ref={fileInputRef}
                      type="file"
                      multiple
                      hidden
                      accept=".jpg,.jpeg,.png,.gif,.webp,.pdf,.doc,.docx,.xls,.xlsx"
                      onChange={onFilesPicked}
                    />
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => fileInputRef.current?.click()}
                      disabled={queuedFiles.length >= MAX_FILES_PER_MESSAGE}
                      className="gap-1.5"
                    >
                      <Paperclip className="h-3.5 w-3.5" />
                      Attach file
                    </Button>
                    <span className="text-xs text-muted-foreground">
                      Up to {MAX_FILES_PER_MESSAGE} files, 10 MB each. Shared with all recipients.
                    </span>
                  </div>
                  {queuedFiles.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-2">
                      {queuedFiles.map((f, i) => (
                        <div
                          key={i}
                          className="flex items-center gap-1.5 rounded-full border border-border bg-muted px-2.5 py-1 text-xs"
                        >
                          <span className="truncate max-w-[200px]">{f.name}</span>
                          <span className="text-muted-foreground">({formatBytes(f.size)})</span>
                          <button
                            type="button"
                            onClick={() => removeQueued(i)}
                            className="text-destructive hover:text-destructive/80"
                            aria-label={`Remove ${f.name}`}
                          >
                            <X className="h-3 w-3" />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </>
            )}

            {step === 3 && (
              <div className="space-y-4">
                <div className="rounded-lg border border-border p-4 space-y-2">
                  <div className="text-xs uppercase tracking-wide text-muted-foreground">
                    Audience
                  </div>
                  <div className="text-sm">
                    <strong>{audienceLabel}</strong> — {recipientCount}{" "}
                    {recipientCount === 1 ? "recipient" : "recipients"}
                    {tenantCount !== recipientCount && (
                      <> across {tenantCount} clients</>
                    )}
                  </div>
                </div>
                <div className="rounded-lg border border-border p-4 space-y-2">
                  <div className="text-xs uppercase tracking-wide text-muted-foreground">
                    Message
                  </div>
                  {subject && (
                    <div className="text-sm font-medium">{subject}</div>
                  )}
                  <div className="text-sm whitespace-pre-wrap text-foreground/90">
                    {body}
                  </div>
                  {queuedFiles.length > 0 && (
                    <div className="pt-2 mt-2 border-t border-border">
                      <div className="text-xs text-muted-foreground mb-1.5">
                        {queuedFiles.length} attachment{queuedFiles.length === 1 ? "" : "s"}
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        {queuedFiles.map((f, i) => (
                          <span
                            key={i}
                            className="inline-flex items-center gap-1 rounded-full border border-border bg-muted px-2 py-0.5 text-xs"
                          >
                            <Paperclip className="h-3 w-3" />
                            {f.name}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}
          </AppModalBody>
          <AppModalFooter>
            {step > 1 && (
              <Button
                variant="outline"
                onClick={() => setStep((s) => (s - 1) as 1 | 2)}
              >
                Back
              </Button>
            )}
            <Button variant="ghost" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            {step === 1 && (
              <Button
                disabled={!canGoToStep2}
                onClick={() => setStep(2)}
              >
                Next
              </Button>
            )}
            {step === 2 && (
              <Button disabled={!canGoToStep3} onClick={() => setStep(3)}>
                Review
              </Button>
            )}
            {step === 3 && (
              <Button
                className="gap-1.5"
                onClick={() => setConfirmOpen(true)}
                disabled={sendMutation.isPending}
              >
                <Send className="h-3.5 w-3.5" />
                Send Bulk Message
              </Button>
            )}
          </AppModalFooter>
        </AppModalContent>
      </AppModal>

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Send to {tenantCount} clients?</AlertDialogTitle>
            <AlertDialogDescription>
              You're about to message <strong>{tenantCount}</strong>{" "}
              {tenantCount === 1 ? "client" : "clients"} ({recipientCount}{" "}
              {recipientCount === 1 ? "recipient" : "recipients"}). This cannot
              be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={sendMutation.isPending}>
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                sendMutation.mutate();
              }}
              disabled={sendMutation.isPending}
            >
              {sendMutation.isPending ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" />
                  Sending…
                </>
              ) : (
                "Send"
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
