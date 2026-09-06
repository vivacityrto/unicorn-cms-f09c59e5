import { useEffect, useMemo, useState } from "react";
import { format } from "date-fns";
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
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import {
  useUpdateEmailTicket,
  type EmailTicket,
} from "@/hooks/useEmailTickets";
import { useEmailTicketStatuses } from "@/hooks/useEmailTicketCategories";
import { useTriageStaffOptions } from "@/hooks/useTriageStaffOptions";
import { CategoryBadge, UrgentIcon } from "./TicketBadges";

interface Props {
  ticket: EmailTicket | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

function fmt(ts: string | null | undefined) {
  if (!ts) return "—";
  return format(new Date(ts), "dd/MM/yyyy HH:mm");
}

export function TicketDetailPanel({ ticket, open, onOpenChange }: Props) {
  const { data: statuses = [] } = useEmailTicketStatuses();
  const { data: staff = [] } = useTriageStaffOptions();
  const updateMutation = useUpdateEmailTicket();

  const staffByUuid = useMemo(
    () => Object.fromEntries(staff.map((s) => [s.user_uuid, s])),
    [staff]
  );

  const [status, setStatus] = useState("");
  const [notes, setNotes] = useState("");

  useEffect(() => {
    if (ticket) {
      setStatus(ticket.status ?? "");
      setNotes(ticket.resolution_notes ?? "");
    }
    // Deliberately narrow: depend on the specific fields that should reset
    // the local draft, not the whole `ticket` object, which gets a new
    // reference on every parent refetch even when these fields haven't changed.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ticket?.id, ticket?.status, ticket?.resolution_notes]);

  if (!ticket) return null;

  const isClosed = ticket.status === "closed";
  const assignee = ticket.assigned_to_user_id
    ? staffByUuid[ticket.assigned_to_user_id]
    : null;
  const triager = ticket.triaged_by ? staffByUuid[ticket.triaged_by] : null;
  const closer = ticket.closed_by ? staffByUuid[ticket.closed_by] : null;

  const dirty =
    status !== (ticket.status ?? "") ||
    (notes ?? "") !== (ticket.resolution_notes ?? "");

  const handleSave = async () => {
    try {
      await updateMutation.mutateAsync({
        id: ticket.id,
        patch: {
          status,
          resolution_notes: notes ? notes : null,
        },
      });
      toast.success("Ticket updated");
    } catch (err: unknown) {
      toast.error("Failed to update ticket", {
        description: err instanceof Error ? err.message : "Please try again.",
      });
    }
  };

  const handleClose = async () => {
    try {
      await updateMutation.mutateAsync({
        id: ticket.id,
        patch: {
          status: "closed",
          resolution_notes: notes ? notes : null,
        },
      });
      toast.success("Ticket closed");
      onOpenChange(false);
    } catch (err: unknown) {
      toast.error("Failed to close ticket", {
        description: err instanceof Error ? err.message : "Please try again.",
      });
    }
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-xl flex flex-col">
        <SheetHeader>
          <SheetTitle className="font-mono text-lg">
            {ticket.ticket_number}
          </SheetTitle>
          <SheetDescription className="line-clamp-2">
            {ticket.subject}
          </SheetDescription>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto space-y-4 py-4">
          {isClosed ? (
            <div className="rounded-md border border-border bg-muted/50 px-3 py-2 text-sm">
              <span className="font-medium">Closed</span>{" "}
              <span className="text-muted-foreground">
                {fmt(ticket.closed_at)}
                {closer ? ` by ${closer.display_name}` : ""}
              </span>
            </div>
          ) : null}

          <div className="grid grid-cols-[120px_1fr] gap-y-2 gap-x-3 text-sm">
            <div className="text-xs uppercase text-muted-foreground tracking-wide pt-1">
              Category
            </div>
            <div className="flex items-center gap-2">
              <CategoryBadge value={ticket.category} />
              <UrgentIcon show={ticket.urgent} />
              {ticket.urgent ? (
                <span className="text-destructive text-xs font-semibold">
                  URGENT
                </span>
              ) : null}
            </div>

            <div className="text-xs uppercase text-muted-foreground tracking-wide pt-1">
              From
            </div>
            <div>
              <div className="font-medium">
                {ticket.sender_name ?? "Unknown"}
              </div>
              <div className="text-xs text-muted-foreground">
                {ticket.sender_email}
              </div>
            </div>

            <div className="text-xs uppercase text-muted-foreground tracking-wide pt-1">
              Received
            </div>
            <div>{fmt(ticket.received_at)}</div>

            <div className="text-xs uppercase text-muted-foreground tracking-wide pt-1">
              Assigned
            </div>
            <div>
              {assignee ? (
                <>
                  <span className="font-medium">{assignee.display_name}</span>
                  {assignee.unicorn_role ? (
                    <span className="text-muted-foreground text-xs ml-2">
                      · {assignee.unicorn_role}
                    </span>
                  ) : null}
                </>
              ) : (
                <span className="text-muted-foreground">Unassigned</span>
              )}
            </div>

            <div className="text-xs uppercase text-muted-foreground tracking-wide pt-1">
              Triaged
            </div>
            <div>
              {ticket.triaged_at ? (
                <>
                  {fmt(ticket.triaged_at)}
                  {triager ? (
                    <span className="text-muted-foreground text-xs ml-2">
                      by {triager.display_name}
                    </span>
                  ) : null}
                </>
              ) : (
                <span className="text-muted-foreground">Not triaged</span>
              )}
            </div>
          </div>

          <div className="space-y-1">
            <div className="text-xs uppercase text-muted-foreground tracking-wide">
              Body
            </div>
            <div className="text-sm whitespace-pre-wrap border rounded-md p-3 bg-muted/30 max-h-[30vh] overflow-y-auto">
              {ticket.body_preview ?? "(no body)"}
            </div>
          </div>

          {!isClosed ? (
            <div className="border-t pt-4 space-y-4">
              <div className="space-y-2">
                <Label htmlFor="detail-status">Status</Label>
                <Select value={status} onValueChange={setStatus}>
                  <SelectTrigger id="detail-status">
                    <SelectValue placeholder="Select status" />
                  </SelectTrigger>
                  <SelectContent>
                    {statuses.map((s) => (
                      <SelectItem key={s.value} value={s.value}>
                        {s.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="detail-notes">Resolution notes</Label>
                <Textarea
                  id="detail-notes"
                  placeholder="Add resolution notes…"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  rows={5}
                />
              </div>
            </div>
          ) : (
            <div className="border-t pt-4 space-y-2">
              <div className="text-xs uppercase text-muted-foreground tracking-wide">
                Resolution notes
              </div>
              <div className="text-sm whitespace-pre-wrap border rounded-md p-3 bg-muted/30">
                {ticket.resolution_notes?.trim()
                  ? ticket.resolution_notes
                  : "(none)"}
              </div>
            </div>
          )}
        </div>

        {!isClosed ? (
          <SheetFooter className="gap-2 sm:gap-2">
            <Button
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={updateMutation.isPending}
            >
              Cancel
            </Button>
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button
                  variant="destructive"
                  disabled={updateMutation.isPending}
                >
                  Close Ticket
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Close this ticket?</AlertDialogTitle>
                  <AlertDialogDescription>
                    This cannot be undone.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction onClick={handleClose}>
                    Close Ticket
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
            <Button
              onClick={handleSave}
              disabled={!dirty || updateMutation.isPending}
            >
              {updateMutation.isPending ? "Saving…" : "Save"}
            </Button>
          </SheetFooter>
        ) : null}
      </SheetContent>
    </Sheet>
  );
}
