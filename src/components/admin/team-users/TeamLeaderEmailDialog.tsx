import { useState, useMemo } from "react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Mail, Send, Loader2, Copy, Check } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import type { StaffProvisioningRule } from "@/hooks/useStaffProvisioningRules";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  runId: number | null;
  newStarter: {
    firstName: string;
    lastName: string;
    displayName: string;
    upn: string;
    tempPassword: string;
    startDate: string;
    roleCode: string;
  };
  teamLeader: { user_uuid: string; first_name: string; last_name: string; email: string } | null;
  rule: StaffProvisioningRule | null;
}

export function TeamLeaderEmailDialog({ open, onOpenChange, runId, newStarter, teamLeader, rule }: Props) {
  const { toast } = useToast();
  const [sending, setSending] = useState<"none" | "mailgun" | "graph">("none");
  const [copied, setCopied] = useState(false);

  const subject = `New starter setup — ${newStarter.displayName}`;
  const body = useMemo(() => {
    if (!rule || !teamLeader) return "";
    return `Hi ${teamLeader.first_name},

Here are the login and other details for our new person '${newStarter.displayName}'.

  Role:               ${newStarter.roleCode}
  Start date:         ${newStarter.startDate || "TBC"}
  Vivacity login:     ${newStarter.upn}
  Temporary password: ${newStarter.tempPassword}
  (must be changed at first sign-in)

  M365 groups:        ${rule.m365_groups.join(", ")}
  Licenses:           ${rule.licenses.join(", ")}
  Software pending:   ${rule.software.join(", ")}
  Calendar invites:   ${rule.calendars.join(", ")}

Vivacity main number: 1300 772 459
Client Support email: support@vivacity.com.au

The onboarding checklist has been created in Unicorn — software & calendar steps remain to be ticked off as they're set up.

Let me know if you need anything else.`;
  }, [rule, teamLeader, newStarter]);

  const [editedBody, setEditedBody] = useState("");
  const [editedTo, setEditedTo] = useState("");

  // Reset on open
  useMemo(() => {
    if (open) {
      setEditedBody(body);
      setEditedTo(teamLeader?.email ?? "");
    }
  }, [open, body, teamLeader]);

  const send = async (channel: "mailgun" | "graph") => {
    if (!editedTo) {
      toast({ title: "Recipient missing", variant: "destructive" });
      return;
    }
    setSending(channel);
    try {
      const { data, error } = await supabase.functions.invoke("send-staff-onboarding-email", {
        body: { to: editedTo, subject, body: editedBody, channel, run_id: runId },
      });

      // Extract structured payload even when the function returned a non-2xx status.
      // supabase-js puts the parsed JSON body on error.context for FunctionsHttpError.
      let payload: any = data;
      if (error && !payload) {
        try {
          const ctx: any = (error as any).context;
          if (ctx && typeof ctx.json === "function") payload = await ctx.json();
          else if (ctx && typeof ctx.text === "function") {
            const t = await ctx.text();
            try { payload = JSON.parse(t); } catch { payload = { error: t }; }
          }
        } catch { /* ignore */ }
      }

      const code = payload?.code;
      const errMsg = payload?.error || (error as any)?.message;

      if (code === "no_microsoft_connection") {
        toast({
          title: "Outlook not connected",
          description: "You haven't connected your Outlook mailbox. Use 'Send via Mailgun' instead, or connect Outlook in Integrations.",
          variant: "destructive",
        });
        return;
      }

      if (error || (payload && payload.ok === false)) {
        toast({ title: "Send failed", description: errMsg ?? "Unknown error", variant: "destructive" });
        return;
      }

      toast({
        title: channel === "mailgun" ? "Email sent via Mailgun" : "Email sent from your Outlook",
      });
      onOpenChange(false);
    } catch (e: any) {
      toast({ title: "Send failed", description: e?.message ?? String(e), variant: "destructive" });
    } finally {
      setSending("none");
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Mail className="h-5 w-5 text-primary" /> Email team leader
          </DialogTitle>
          <DialogDescription>
            Choose how to send: via the system relay (Mailgun) or from your own Outlook mailbox.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label>To</Label>
            <Input value={editedTo} onChange={(e) => setEditedTo(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>Subject</Label>
            <Input value={subject} readOnly className="bg-muted/30" />
          </div>
          <div className="space-y-1.5">
            <Label>Body</Label>
            <Textarea value={editedBody} onChange={(e) => setEditedBody(e.target.value)} rows={14} className="font-mono text-xs" />
          </div>
        </div>

        <DialogFooter className="gap-2 flex-col sm:flex-row">
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button variant="outline" disabled={sending !== "none"} onClick={() => send("mailgun")}>
            {sending === "mailgun" ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Send className="h-4 w-4 mr-1" />}
            Send via Mailgun
          </Button>
          <Button disabled={sending !== "none"} onClick={() => send("graph")}>
            {sending === "graph" ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Send className="h-4 w-4 mr-1" />}
            Send from my Outlook
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
