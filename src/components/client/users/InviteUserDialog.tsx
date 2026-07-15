import { useEffect, useMemo, useState } from "react";
import { Loader2 } from "lucide-react";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";

import type { ClientTenantUserRow } from "@/hooks/use-client-tenant-users";
import {
  useInviteMutations,
  type InviteAccessLevel,
} from "./useInviteMutations";
import { useClientTenant } from "@/contexts/ClientTenantContext";
import { useUserCapacity } from "@/hooks/useUserCapacity";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  rows: ClientTenantUserRow[];
}

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const ALL_ACCESS_OPTIONS: { value: InviteAccessLevel; label: string; description: string }[] = [
  {
    value: "academy",
    label: "Academy only",
    description: "Vivacity Academy training only — no compliance modules.",
  },
  {
    value: "secondary",
    label: "Secondary contact",
    description: "Backup admin: full access plus the ability to manage users.",
  },
  {
    value: "user",
    label: "Full access",
    description: "Full access to the compliance portal. Cannot manage users.",
  },
];

export default function InviteUserDialog({ open, onOpenChange, rows }: Props) {
  const { invite } = useInviteMutations();
  const { activeTenantId } = useClientTenant();
  const capacity = useUserCapacity(activeTenantId);
  const atLimit = !!capacity.data?.atLimit;


  const [email, setEmail] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [accessLevel, setAccessLevel] = useState<InviteAccessLevel>("academy");
  const [error, setError] = useState<string | null>(null);

  const hasSecondary = useMemo(
    () =>
      rows.some(
        (r) =>
          (r.row_type === "active" || r.row_type === "invited") &&
          r.relationship_role === "secondary_contact"
      ),
    [rows]
  );

  const accessOptions = useMemo(
    () => ALL_ACCESS_OPTIONS.filter((o) => o.value !== "secondary" || !hasSecondary),
    [hasSecondary]
  );

  // Reset on close
  useEffect(() => {
    if (!open) {
      setEmail("");
      setFirstName("");
      setLastName("");
      setAccessLevel("academy");
      setError(null);
    }
  }, [open]);

  const trimmedEmail = email.trim().toLowerCase();
  const trimmedFirst = firstName.trim();

  const submitDisabled =
    !trimmedFirst ||
    !EMAIL_REGEX.test(trimmedEmail) ||
    invite.isPending;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    // Pre-flight checks against cached rows
    const conflictMember = rows.find(
      (r) => r.row_type === "active" && r.email?.toLowerCase() === trimmedEmail
    );
    if (conflictMember) {
      setError("This email is already a user on your organisation.");
      return;
    }

    const conflictPending = rows.find(
      (r) => r.row_type === "invited" && r.email?.toLowerCase() === trimmedEmail
    );
    if (conflictPending) {
      setError("An invitation is already pending for this email. Resend it from the table below.");
      return;
    }

    if (accessLevel === "secondary") {
      const hasSecondary = rows.some(
        (r) =>
          (r.row_type === "active" && r.relationship_role === "secondary_contact") ||
          (r.row_type === "invited" && r.relationship_role === "secondary_contact")
      );
      if (hasSecondary) {
        setError("This organisation already has a secondary contact (active or pending).");
        return;
      }
    }

    try {
      await invite.mutateAsync({ email: trimmedEmail, firstName: trimmedFirst, lastName: lastName.trim(), accessLevel });
      onOpenChange(false);
    } catch (err) {
      const e = err as Error & { code?: string };
      const codeMessages: Record<string, string> = {
        INVITE_EXISTS: "An invitation is already pending for this email. Resend it from the table below.",
        INVALID_EMAIL: "Please enter a valid email address.",
        ROLE_NOT_ALLOWED: "That access level isn't allowed for your organisation.",
        RATE_LIMIT_EXCEEDED: "Too many invitations to this email recently. Try again later.",
        FORBIDDEN: "You don't have permission to invite users.",
        SECONDARY_CONTACT_TAKEN: "This organisation already has a secondary contact.",
        SECONDARY_CONTACT_PENDING: "A pending invite already nominates someone as secondary contact.",
        PRIMARY_CONTACT_TAKEN: "This organisation already has a primary contact.",
        PRIMARY_CONTACT_PENDING: "A pending invite already nominates someone as primary contact.",
        RELATIONSHIP_ROLE_NOT_ALLOWED: "That role can't be assigned via this flow.",
      };
      setError((e.code && codeMessages[e.code]) || e.message || "Couldn't send invitation. Please try again.");
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        {atLimit ? (
          <div className="space-y-4">
            <DialogHeader>
              <DialogTitle>User limit reached</DialogTitle>
            </DialogHeader>
            <Alert variant="destructive">
              <AlertTitle>User limit reached</AlertTitle>
              <AlertDescription>
                This membership is at its user cap ({capacity.data!.used} of {capacity.data!.limit}).
                Contact Vivacity to upgrade or add more users.
              </AlertDescription>
            </Alert>
            <DialogFooter>
              <Button variant="outline" onClick={() => onOpenChange(false)}>
                Close
              </Button>
            </DialogFooter>
          </div>
        ) : (
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>Invite a user</DialogTitle>
            <DialogDescription>
              They'll get an email with a link to set up their account.
            </DialogDescription>
          </DialogHeader>


          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="invite-email">Email *</Label>
              <Input
                id="invite-email"
                type="email"
                autoComplete="off"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label htmlFor="invite-first">First name *</Label>
                <Input
                  id="invite-first"
                  value={firstName}
                  onChange={(e) => setFirstName(e.target.value)}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="invite-last">Last name</Label>
                <Input
                  id="invite-last"
                  value={lastName}
                  onChange={(e) => setLastName(e.target.value)}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label>Access level *</Label>
              <RadioGroup
                value={accessLevel}
                onValueChange={(v) => setAccessLevel(v as InviteAccessLevel)}
                className="space-y-2"
              >
                {accessOptions.map((opt) => (
                  <label
                    key={opt.value}
                    htmlFor={`invite-access-${opt.value}`}
                    className="flex cursor-pointer items-start gap-3 rounded-md border p-3 hover:bg-muted/40"
                  >
                    <RadioGroupItem
                      id={`invite-access-${opt.value}`}
                      value={opt.value}
                      className="mt-0.5"
                    />
                    <div className="space-y-0.5">
                      <div className="text-sm font-medium">{opt.label}</div>
                      <div className="text-xs text-muted-foreground">{opt.description}</div>
                    </div>
                  </label>
                ))}
              </RadioGroup>
            </div>

            {error ? (
              <p className="text-sm text-destructive" role="alert">
                {error}
              </p>
            ) : null}
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={submitDisabled}>
              {invite.isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Sending...
                </>
              ) : (
                "Send invitation"
              )}
            </Button>
          </DialogFooter>
        </form>
        )}
      </DialogContent>

    </Dialog>
  );
}
