import { useEffect, useState } from "react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetFooter,
  SheetDescription,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { format } from "date-fns";
import { useAuth } from "@/hooks/useAuth";
import {
  useUpdateEmailTicket,
  type EmailTicket,
} from "@/hooks/useEmailTickets";
import { useEmailTicketCategories } from "@/hooks/useEmailTicketCategories";
import { useTriageStaffOptions } from "@/hooks/useTriageStaffOptions";

interface Props {
  ticket: EmailTicket | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function TriageSidePanel({ ticket, open, onOpenChange }: Props) {
  const { user } = useAuth();
  const { data: categories = [] } = useEmailTicketCategories();
  const { data: staff = [] } = useTriageStaffOptions();
  const updateMutation = useUpdateEmailTicket();

  const [category, setCategory] = useState<string>("");
  const [urgent, setUrgent] = useState<boolean>(false);
  const [assignee, setAssignee] = useState<string>("");

  useEffect(() => {
    if (ticket) {
      setCategory(ticket.category ?? "");
      setUrgent(!!ticket.urgent);
      setAssignee(ticket.assigned_to_user_id ?? "");
    }
  }, [ticket]);

  if (!ticket) return null;

  const canSubmit = !!category && !!assignee && !updateMutation.isPending;

  const handleSubmit = async () => {
    if (!user?.id || !ticket) return;
    try {
      const nowIso = new Date().toISOString();
      await updateMutation.mutateAsync({
        id: ticket.id,
        patch: {
          triage_status: "triaged",
          triaged_by: user.id,
          triaged_at: nowIso,
          category,
          urgent,
          assigned_to_user_id: assignee,
          assigned_at: nowIso,
        },
      });
      toast.success("Ticket triaged");
      onOpenChange(false);
    } catch (err) {
      toast.error("Failed to triage ticket", {
        description: err instanceof Error ? err.message : "Please try again.",
      });
    }
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-xl flex flex-col">
        <SheetHeader>
          <SheetTitle>Triage Ticket {ticket.ticket_number}</SheetTitle>
          <SheetDescription>
            Categorise, set urgency, and assign this email.
          </SheetDescription>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto space-y-4 py-4">
          <div className="space-y-1">
            <div className="text-xs uppercase text-muted-foreground tracking-wide">
              From
            </div>
            <div className="text-sm font-medium">
              {ticket.sender_name ?? "Unknown"}
            </div>
            <div className="text-xs text-muted-foreground">
              {ticket.sender_email}
            </div>
          </div>

          <div className="space-y-1">
            <div className="text-xs uppercase text-muted-foreground tracking-wide">
              Received
            </div>
            <div className="text-sm">
              {format(new Date(ticket.received_at), "dd/MM/yyyy HH:mm")}
            </div>
          </div>

          <div className="space-y-1">
            <div className="text-xs uppercase text-muted-foreground tracking-wide">
              Subject
            </div>
            <div className="text-sm font-medium">{ticket.subject}</div>
          </div>

          <div className="space-y-1">
            <div className="text-xs uppercase text-muted-foreground tracking-wide">
              Body
            </div>
            <div className="text-sm whitespace-pre-wrap border rounded-md p-3 bg-muted/30 max-h-[40vh] overflow-y-auto">
              {ticket.body_preview ?? "(no body)"}
            </div>
          </div>

          <div className="border-t pt-4 space-y-4">
            <div className="space-y-2">
              <Label htmlFor="triage-category">Category</Label>
              <Select value={category} onValueChange={setCategory}>
                <SelectTrigger id="triage-category">
                  <SelectValue placeholder="Select category" />
                </SelectTrigger>
                <SelectContent>
                  {categories.map((c) => (
                    <SelectItem key={c.value} value={c.value}>
                      {c.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="flex items-center justify-between">
              <Label htmlFor="triage-urgent" className="cursor-pointer">
                Urgent
              </Label>
              <Switch
                id="triage-urgent"
                checked={urgent}
                onCheckedChange={setUrgent}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="triage-assignee">Assign to</Label>
              <Select value={assignee} onValueChange={setAssignee}>
                <SelectTrigger id="triage-assignee">
                  <SelectValue placeholder="Select assignee" />
                </SelectTrigger>
                <SelectContent>
                  {staff.map((s) => (
                    <SelectItem key={s.user_uuid} value={s.user_uuid}>
                      {s.display_name}
                      {s.unicorn_role ? (
                        <span className="text-muted-foreground ml-2 text-xs">
                          · {s.unicorn_role}
                        </span>
                      ) : null}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>

        <SheetFooter className="gap-2 sm:gap-2">
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={updateMutation.isPending}
          >
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={!canSubmit}>
            {updateMutation.isPending ? "Saving…" : "Mark Triaged"}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
