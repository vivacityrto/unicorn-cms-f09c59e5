import { useEffect, useMemo, useState } from "react";
import { FormModal } from "@/components/ui/modals";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "@/hooks/use-toast";
import {
  type DdLookupRow,
  type ReportingObligationInput,
  type ReportingObligationRow,
  useObligationAudiences,
  useObligationRecurrences,
  useUpsertReportingObligation,
} from "@/hooks/admin/use-reporting-obligations";

const NONE = "__none__";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  obligation: ReportingObligationRow | null;
}

interface FormState {
  code: string;
  title: string;
  description: string;
  audience_id: string;
  recurrence_id: string;
  annual_month: string;
  annual_day: string;
  window_opens_month: string;
  window_opens_day: string;
  due_date: string;
  cta_label: string;
  cta_url: string;
  sort_order: string;
  is_active: boolean;
  notification_message: string;
  lead_times: string;
}

const emptyState: FormState = {
  code: "",
  title: "",
  description: "",
  audience_id: NONE,
  recurrence_id: NONE,
  annual_month: "",
  annual_day: "",
  window_opens_month: "",
  window_opens_day: "",
  due_date: "",
  cta_label: "",
  cta_url: "",
  sort_order: "100",
  is_active: true,
  notification_message: "",
  lead_times: "30,14,7,1",
};

function fromObligation(o: ReportingObligationRow): FormState {
  return {
    code: o.code ?? "",
    title: o.title ?? "",
    description: o.description ?? "",
    audience_id: o.audience_id ? String(o.audience_id) : NONE,
    recurrence_id: o.recurrence_id ? String(o.recurrence_id) : NONE,
    annual_month: o.annual_month != null ? String(o.annual_month) : "",
    annual_day: o.annual_day != null ? String(o.annual_day) : "",
    window_opens_month: o.window_opens_month != null ? String(o.window_opens_month) : "",
    window_opens_day: o.window_opens_day != null ? String(o.window_opens_day) : "",
    due_date: o.due_date ?? "",
    cta_label: o.cta_label ?? "",
    cta_url: o.cta_url ?? "",
    sort_order: o.sort_order != null ? String(o.sort_order) : "100",
    is_active: !!o.is_active,
    notification_message: o.notification_message ?? "",
    lead_times: (o.lead_times ?? [30, 14, 7, 1]).join(","),
  };
}

function parseLeadTimes(raw: string): number[] | null {
  const parts = raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  if (!parts.length) return [];
  const out: number[] = [];
  for (const p of parts) {
    const n = Number(p);
    if (!Number.isInteger(n) || n <= 0) return null;
    out.push(n);
  }
  return out;
}

export function ObligationFormDialog({ open, onOpenChange, obligation }: Props) {
  const audiences = useObligationAudiences();
  const recurrences = useObligationRecurrences();
  const upsert = useUpsertReportingObligation();
  const [state, setState] = useState<FormState>(emptyState);

  useEffect(() => {
    if (!open) return;
    setState(obligation ? fromObligation(obligation) : emptyState);
  }, [open, obligation]);

  const recurrenceValue = useMemo(() => {
    const id = state.recurrence_id === NONE ? null : Number(state.recurrence_id);
    return (recurrences.data ?? []).find((r: DdLookupRow) => r.id === id)?.value ?? null;
  }, [state.recurrence_id, recurrences.data]);

  const showAnnual = recurrenceValue === "annual_fixed" || recurrenceValue === "annual_window";
  const showWindow = recurrenceValue === "annual_window";

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setState((s) => ({ ...s, [key]: value }));

  const handleSubmit = async () => {
    if (!state.code.trim() || !state.title.trim() || !state.description.trim()) {
      toast({ title: "Missing fields", description: "Code, title and description are required.", variant: "destructive" });
      return;
    }
    if (state.audience_id === NONE || state.recurrence_id === NONE) {
      toast({ title: "Missing fields", description: "Audience and recurrence are required.", variant: "destructive" });
      return;
    }
    if (!state.cta_label.trim() || !state.cta_url.trim()) {
      toast({ title: "Missing fields", description: "CTA label and URL are required.", variant: "destructive" });
      return;
    }
    const leadTimes = parseLeadTimes(state.lead_times);
    if (leadTimes === null) {
      toast({ title: "Invalid lead times", description: "Use a comma-separated list of positive integers (e.g. 30,14,7,1).", variant: "destructive" });
      return;
    }

    const payload: ReportingObligationInput = {
      id: obligation?.id,
      code: state.code.trim(),
      title: state.title.trim(),
      description: state.description.trim(),
      audience_id: Number(state.audience_id),
      recurrence_id: Number(state.recurrence_id),
      annual_month: showAnnual && state.annual_month ? Number(state.annual_month) : null,
      annual_day: showAnnual && state.annual_day ? Number(state.annual_day) : null,
      window_opens_month: showWindow && state.window_opens_month ? Number(state.window_opens_month) : null,
      window_opens_day: showWindow && state.window_opens_day ? Number(state.window_opens_day) : null,
      due_date: state.due_date || null,
      cta_label: state.cta_label.trim(),
      cta_url: state.cta_url.trim(),
      sort_order: Number(state.sort_order || "100"),
      is_active: state.is_active,
      notification_message: state.notification_message.trim() || null,
      lead_times: leadTimes,
    };

    try {
      await upsert.mutateAsync(payload);
      toast({ title: obligation ? "Obligation updated" : "Obligation created" });
      onOpenChange(false);
    } catch (err) {
      toast({ title: "Save failed", description: err instanceof Error ? err.message : String(err), variant: "destructive" });
    }
  };

  return (
    <FormModal
      open={open}
      onOpenChange={onOpenChange}
      title={obligation ? "Edit Reporting Obligation" : "New Reporting Obligation"}
      description="Define a regulatory reporting obligation surfaced to clients with the matching audience."
      onSubmit={handleSubmit}
      isSubmitting={upsert.isPending}
      submitText={obligation ? "Save changes" : "Create obligation"}
      size="lg"
    >
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="ro-code">Code *</Label>
          <Input id="ro-code" value={state.code} onChange={(e) => set("code", e.target.value)} placeholder="e.g. ASQA_QI_RETURN" />
        </div>
        <div className="space-y-2">
          <Label htmlFor="ro-title">Title *</Label>
          <Input id="ro-title" value={state.title} onChange={(e) => set("title", e.target.value)} />
        </div>

        <div className="md:col-span-2 space-y-2">
          <Label htmlFor="ro-description">Description *</Label>
          <Textarea id="ro-description" rows={3} value={state.description} onChange={(e) => set("description", e.target.value)} />
        </div>

        <div className="space-y-2">
          <Label>Audience *</Label>
          <Select value={state.audience_id} onValueChange={(v) => set("audience_id", v)}>
            <SelectTrigger><SelectValue placeholder="Select audience" /></SelectTrigger>
            <SelectContent>
              <SelectItem value={NONE}>Select audience</SelectItem>
              {(audiences.data ?? []).map((a) => (
                <SelectItem key={a.id} value={String(a.id)}>{a.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <Label>Recurrence *</Label>
          <Select value={state.recurrence_id} onValueChange={(v) => set("recurrence_id", v)}>
            <SelectTrigger><SelectValue placeholder="Select recurrence" /></SelectTrigger>
            <SelectContent>
              <SelectItem value={NONE}>Select recurrence</SelectItem>
              {(recurrences.data ?? []).map((r) => (
                <SelectItem key={r.id} value={String(r.id)}>{r.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {showAnnual && (
          <>
            <div className="space-y-2">
              <Label htmlFor="ro-am">Annual month (1-12)</Label>
              <Input id="ro-am" type="number" min={1} max={12} value={state.annual_month} onChange={(e) => set("annual_month", e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="ro-ad">Annual day (1-31)</Label>
              <Input id="ro-ad" type="number" min={1} max={31} value={state.annual_day} onChange={(e) => set("annual_day", e.target.value)} />
            </div>
          </>
        )}

        {showWindow && (
          <>
            <div className="space-y-2">
              <Label htmlFor="ro-wm">Window opens month</Label>
              <Input id="ro-wm" type="number" min={1} max={12} value={state.window_opens_month} onChange={(e) => set("window_opens_month", e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="ro-wd">Window opens day</Label>
              <Input id="ro-wd" type="number" min={1} max={31} value={state.window_opens_day} onChange={(e) => set("window_opens_day", e.target.value)} />
            </div>
          </>
        )}

        <div className="space-y-2">
          <Label htmlFor="ro-due">Due date (one-off override)</Label>
          <Input id="ro-due" type="date" value={state.due_date} onChange={(e) => set("due_date", e.target.value)} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="ro-sort">Sort order</Label>
          <Input id="ro-sort" type="number" value={state.sort_order} onChange={(e) => set("sort_order", e.target.value)} />
        </div>

        <div className="space-y-2">
          <Label htmlFor="ro-cta-label">CTA label *</Label>
          <Input id="ro-cta-label" value={state.cta_label} onChange={(e) => set("cta_label", e.target.value)} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="ro-cta-url">CTA URL *</Label>
          <Input id="ro-cta-url" value={state.cta_url} onChange={(e) => set("cta_url", e.target.value)} placeholder="https://…" />
        </div>

        <div className="md:col-span-2 space-y-2">
          <Label htmlFor="ro-notif">Notification message (optional)</Label>
          <Textarea
            id="ro-notif"
            rows={2}
            value={state.notification_message}
            onChange={(e) => set("notification_message", e.target.value)}
            placeholder="Leave blank to use the obligation description as the notification body."
          />
        </div>

        <div className="md:col-span-2 space-y-2">
          <Label htmlFor="ro-lead">Lead times (days, comma-separated)</Label>
          <Input
            id="ro-lead"
            value={state.lead_times}
            onChange={(e) => set("lead_times", e.target.value)}
            placeholder="30,14,7,1"
          />
          <p className="text-xs text-muted-foreground">
            Positive integers only. Reminders fire on each of these lead days plus due-day and one day overdue.
          </p>
        </div>

        <div className="md:col-span-2 flex items-center justify-between rounded-md border p-3">
          <div>
            <Label htmlFor="ro-active" className="text-sm font-medium">Active</Label>
            <p className="text-xs text-muted-foreground">Inactive obligations are excluded from the client view and notifications.</p>
          </div>
          <Switch id="ro-active" checked={state.is_active} onCheckedChange={(v) => set("is_active", v)} />
        </div>
      </div>
    </FormModal>
  );
}
