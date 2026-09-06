import { useEffect, useState } from "react";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription, SheetTrigger, SheetFooter } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";

type Platform = "unicorn" | "complyhub_ai";
type Priority = "critical" | "high" | "standard";

interface DevOption {
  user_uuid: string;
  first_name: string | null;
  last_name: string | null;
}

export function RaiseTicketButton({ variant = "default" }: { variant?: "default" | "outline" }) {
  const { profile } = useAuth();
  const [open, setOpen] = useState(false);
  const [platform, setPlatform] = useState<Platform>("unicorn");
  const [priority, setPriority] = useState<Priority>("standard");
  const [subject, setSubject] = useState("");
  const [description, setDescription] = useState("");
  const [assignee, setAssignee] = useState<string>("");
  const [devs, setDevs] = useState<DevOption[]>([]);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!open) return;
    (async () => {
      const { data, error } = await supabase
        .from("users")
        .select("user_uuid, first_name, last_name, kpi_role, kpi_pod, archived, disabled")
        .eq("kpi_role", "developer")
        .or("kpi_pod.is.null,kpi_pod.neq.qa")
        .order("first_name", { ascending: true });
      if (error) {
        console.error("[RaiseTicket] load devs", error);
        return;
      }
      setDevs(
        (data ?? [])
          .filter((u) => !u.archived && !u.disabled)
          .map((u) => ({ user_uuid: u.user_uuid, first_name: u.first_name, last_name: u.last_name })),
      );
    })();
  }, [open]);

  const reset = () => {
    setPlatform("unicorn");
    setPriority("standard");
    setSubject("");
    setDescription("");
    setAssignee("");
  };

  const submit = async () => {
    if (!subject.trim() || !description.trim()) {
      toast.error("Subject and description are required");
      return;
    }
    if (!profile?.user_uuid) {
      toast.error("Not signed in");
      return;
    }
    setSubmitting(true);
    try {
      const { data: numData, error: numErr } = await supabase.rpc("next_kpi_ticket_number", {
        p_platform: platform,
      });
      if (numErr) throw numErr;
      const ticketNumber = numData as unknown as string;

      const externalId = `internal-${crypto.randomUUID()}`;
      const { error } = await supabase.from("kpi_tickets").insert({
        ticket_number: ticketNumber,
        platform,
        external_id: externalId,
        title: subject.trim(),
        priority,
        status: "received",
        opened_at: new Date().toISOString(),
        reporter_uuid: profile.user_uuid,
        assignee_uuid: assignee || null,
        metadata: { description: description.trim(), source: "raise_ticket_sheet" },
      });
      if (error) throw error;
      toast.success(`Ticket ${ticketNumber} raised`);
      reset();
      setOpen(false);
    } catch (e: unknown) {
      console.error("[RaiseTicket] submit", e);
      toast.error(e instanceof Error ? e.message : "Failed to raise ticket");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button variant={variant} size="sm">
          <Plus className="h-4 w-4 mr-1" /> Raise a ticket
        </Button>
      </SheetTrigger>
      <SheetContent className="w-full sm:max-w-md overflow-y-auto">
        <SheetHeader>
          <SheetTitle>Raise a ticket</SheetTitle>
          <SheetDescription>Log a new ticket for the dev team.</SheetDescription>
        </SheetHeader>
        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label>Platform</Label>
            <Select value={platform} onValueChange={(v) => setPlatform(v as Platform)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="unicorn">Unicorn CMS</SelectItem>
                <SelectItem value="complyhub_ai">ComplyHub AI</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Priority</Label>
            <Select value={priority} onValueChange={(v) => setPriority(v as Priority)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="critical">Critical</SelectItem>
                <SelectItem value="high">High</SelectItem>
                <SelectItem value="standard">Standard</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Subject *</Label>
            <Input value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="Short summary" />
          </div>
          <div className="space-y-2">
            <Label>Description *</Label>
            <Textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={6} placeholder="Steps, expected vs actual, links…" />
          </div>
          <div className="space-y-2">
            <Label>Assign to</Label>
            <Select value={assignee || "__none__"} onValueChange={(v) => setAssignee(v === "__none__" ? "" : v)}>
              <SelectTrigger><SelectValue placeholder="Unassigned" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">Unassigned</SelectItem>
                {devs.map((d) => (
                  <SelectItem key={d.user_uuid} value={d.user_uuid}>
                    {[d.first_name, d.last_name].filter(Boolean).join(" ") || d.user_uuid}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        <SheetFooter>
          <Button variant="outline" onClick={() => setOpen(false)} disabled={submitting}>Cancel</Button>
          <Button onClick={submit} disabled={submitting || !subject.trim() || !description.trim()}>
            {submitting && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
            Submit ticket
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
