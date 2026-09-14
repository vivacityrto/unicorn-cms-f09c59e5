import { useEffect, useState, type FormEvent } from "react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  useCreateAcademySoloAccount,
  type AcademySoloAccountCreation,
} from "@/hooks/academy/useTenantAcademyAccess";
import { isValidEmail } from "@/lib/roles/relationshipRole";

export interface AcademySoloLearnerDetails {
  firstName: string;
  lastName: string;
  email: string;
}

interface CreateAcademySoloDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: (account: AcademySoloAccountCreation, learner: AcademySoloLearnerDetails) => void;
}

export function CreateAcademySoloDialog({
  open,
  onOpenChange,
  onCreated,
}: CreateAcademySoloDialogProps) {
  const createMutation = useCreateAcademySoloAccount();
  const [accountName, setAccountName] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [expiresAt, setExpiresAt] = useState("");
  const [notes, setNotes] = useState("");
  const [validationError, setValidationError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setAccountName("");
    setFirstName("");
    setLastName("");
    setEmail("");
    setExpiresAt("");
    setNotes("");
    setValidationError(null);
  }, [open]);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const trimmedEmail = email.trim().toLowerCase();

    if (accountName.trim().length < 2 || firstName.trim().length < 1) {
      setValidationError("Enter an account name and the learner's first name.");
      return;
    }
    if (!isValidEmail(trimmedEmail)) {
      setValidationError("Enter a valid learner email address.");
      return;
    }

    setValidationError(null);
    try {
      const account = await createMutation.mutateAsync({
        accountName: accountName.trim(),
        notes,
        expiresAt: expiresAt ? new Date(`${expiresAt}T23:59:59Z`).toISOString() : null,
      });

      onOpenChange(false);
      onCreated(account, {
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        email: trimmedEmail,
      });
    } catch {
      // The mutation owns the user-facing error toast; keep the form open.
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Create Academy Solo account</DialogTitle>
          <DialogDescription>
            Creates an Academy-only account boundary. This does not create an RTO profile, package, payment, or compliance workflow.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-5">
          <div className="rounded-lg border border-primary/20 bg-primary/5 p-3 text-sm">
            <div className="flex items-center justify-between gap-3">
              <span className="font-medium">Commercial offer</span>
              <Badge variant="secondary">Academy Solo · $45/month</Badge>
            </div>
            <p className="mt-1 text-muted-foreground">One named learner with access to all published Vivacity Academy courses.</p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="academySoloAccountName">Account name</Label>
            <Input
              id="academySoloAccountName"
              value={accountName}
              onChange={(event) => setAccountName(event.target.value)}
              placeholder="Academy Solo Demo"
              autoFocus
            />
          </div>

          <div className="space-y-3">
            <div>
              <Label className="text-base">Named learner</Label>
              <p className="text-xs text-muted-foreground">The learner identity is created or reused through the existing invitation flow.</p>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label htmlFor="academySoloFirstName">First name</Label>
                <Input id="academySoloFirstName" value={firstName} onChange={(event) => setFirstName(event.target.value)} placeholder="Demo" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="academySoloLastName">Last name</Label>
                <Input id="academySoloLastName" value={lastName} onChange={(event) => setLastName(event.target.value)} placeholder="Academy User" />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="academySoloEmail">Learner email</Label>
              <Input id="academySoloEmail" type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="demo.academy.user@example.test" />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="academySoloExpiresAt">Pilot end date <span className="font-normal text-muted-foreground">(optional)</span></Label>
            <Input id="academySoloExpiresAt" type="date" value={expiresAt} onChange={(event) => setExpiresAt(event.target.value)} />
          </div>

          <div className="space-y-2">
            <Label htmlFor="academySoloNotes">Internal notes <span className="font-normal text-muted-foreground">(optional)</span></Label>
            <Textarea id="academySoloNotes" value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="Controlled pilot notes…" rows={3} />
          </div>

          {validationError && <p className="text-sm text-destructive">{validationError}</p>}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button type="submit" disabled={createMutation.isPending}>
              {createMutation.isPending ? "Creating…" : "Create account and invite learner"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
