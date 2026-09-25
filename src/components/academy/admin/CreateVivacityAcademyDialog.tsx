import { useEffect, useState, type FormEvent } from "react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  useCreateAcademySoloAccount,
  type AcademySoloAccountCreation,
} from "@/hooks/academy/useTenantAcademyAccess";
import {
  VIVACITY_ACADEMY_TIER_LABELS,
  VIVACITY_ACADEMY_TIER_SEATS,
  VIVACITY_ACADEMY_TIER_PRICE,
  type VivacityAcademyTier,
} from "@/lib/tenantAccountSurface";
import { isValidEmail } from "@/lib/roles/relationshipRole";

export interface AcademySoloLearnerDetails {
  firstName: string;
  lastName: string;
  email: string;
}

interface CreateVivacityAcademyDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: (account: AcademySoloAccountCreation, learner: AcademySoloLearnerDetails) => void;
}

const TIER_ORDER: VivacityAcademyTier[] = ["solo", "team", "elite"];

function seatsLabel(tier: VivacityAcademyTier): string {
  const seats = VIVACITY_ACADEMY_TIER_SEATS[tier];
  return seats === null ? "Unlimited users" : seats === 1 ? "1 user" : `Up to ${seats} users`;
}

export function CreateVivacityAcademyDialog({
  open,
  onOpenChange,
  onCreated,
}: CreateVivacityAcademyDialogProps) {
  const createMutation = useCreateAcademySoloAccount();
  const [accountName, setAccountName] = useState("");
  const [tier, setTier] = useState<VivacityAcademyTier>("solo");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [expiresAt, setExpiresAt] = useState("");
  const [notes, setNotes] = useState("");
  const [validationError, setValidationError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setAccountName("");
    setTier("solo");
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
        tier,
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
          <DialogTitle>Create Vivacity Academy account</DialogTitle>
          <DialogDescription>
            Creates an Academy-only account boundary. This does not create an RTO profile, package, payment, or compliance workflow.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-5">
          <div className="space-y-2">
            <Label className="text-base">Tier</Label>
            <RadioGroup value={tier} onValueChange={(v) => setTier(v as VivacityAcademyTier)} className="space-y-2">
              {TIER_ORDER.map((t) => (
                <label
                  key={t}
                  htmlFor={`vivacity-academy-tier-${t}`}
                  className="flex cursor-pointer items-start gap-3 rounded-md border p-3 hover:bg-muted/40"
                >
                  <RadioGroupItem id={`vivacity-academy-tier-${t}`} value={t} className="mt-0.5" />
                  <div className="flex-1 space-y-0.5">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-medium">Vivacity Academy {VIVACITY_ACADEMY_TIER_LABELS[t]}</span>
                      <Badge variant="secondary">{VIVACITY_ACADEMY_TIER_PRICE[t]}</Badge>
                    </div>
                    <p className="text-xs text-muted-foreground">{seatsLabel(t)}</p>
                  </div>
                </label>
              ))}
            </RadioGroup>
            <p className="text-xs text-muted-foreground">
              MVP: the tier only sets the seat cap here — there's no Stripe billing wired up yet.
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="academySoloAccountName">Account name</Label>
            <Input
              id="academySoloAccountName"
              value={accountName}
              onChange={(event) => setAccountName(event.target.value)}
              placeholder="Vivacity Academy Demo"
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
