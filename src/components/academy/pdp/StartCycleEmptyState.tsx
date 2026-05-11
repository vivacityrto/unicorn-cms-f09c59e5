import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Sparkles } from "lucide-react";
import { useAudiences, useCreateCycle } from "@/features/pdp/hooks";

interface Props {
  userId: string;
  tenantId: number | null;
}

function isoToday(): string {
  return new Date().toISOString().slice(0, 10);
}

function isoPlusYear(): string {
  const d = new Date();
  d.setFullYear(d.getFullYear() + 1);
  return d.toISOString().slice(0, 10);
}

export function StartCycleEmptyState({ userId, tenantId }: Props) {
  const [open, setOpen] = useState(false);
  const { data: audiences } = useAudiences();
  const create = useCreateCycle();
  const year = new Date().getFullYear();
  const [audienceCode, setAudienceCode] = useState<string>("");

  const audience = audiences?.find((a) => a.code === audienceCode);

  const handleStart = () => {
    if (!audience) return;
    create.mutate(
      {
        user_id: userId,
        tenant_id: tenantId,
        audience_code: audience.code,
        cycle_year: year,
        cycle_start_date: isoToday(),
        cycle_end_date: isoPlusYear(),
        target_pd_hours: audience.target_pd_hours_default,
      },
      {
        onSuccess: () => setOpen(false),
      },
    );
  };

  return (
    <>
      <Card className="border-dashed">
        <CardContent className="py-10 text-center space-y-3">
          <Sparkles className="h-8 w-8 mx-auto text-[var(--viv-purple)]" />
          <h3 className="text-lg font-semibold text-foreground">
            Start your PDP cycle for {year}
          </h3>
          <p className="text-sm text-muted-foreground max-w-md mx-auto">
            Track your professional development hours, goals, evidence, and reflections in one
            place — aligned to the Standards for RTOs 2025.
          </p>
          <Button
            onClick={() => setOpen(true)}
            className="text-white hover:opacity-90"
            style={{ backgroundColor: "#7130A0" }}
          >
            Start cycle
          </Button>
        </CardContent>
      </Card>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Start your {year} PDP cycle</DialogTitle>
            <DialogDescription>
              Pick the audience that best matches your role. Target PD hours and dates are
              pre-filled from the Vivacity defaults.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label htmlFor="audience">Your PDP audience</Label>
              <Select value={audienceCode} onValueChange={setAudienceCode}>
                <SelectTrigger id="audience">
                  <SelectValue placeholder="Select your role" />
                </SelectTrigger>
                <SelectContent>
                  {(audiences ?? []).map((a) => (
                    <SelectItem key={a.code} value={a.code}>
                      {a.label} · {a.target_pd_hours_default}h/year
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {audience && (
              <div className="text-xs text-muted-foreground bg-muted rounded-md p-3 space-y-1">
                <p>Target: <strong>{audience.target_pd_hours_default} hours</strong></p>
                <p>Starts: <strong>{isoToday()}</strong></p>
                <p>Ends: <strong>{isoPlusYear()}</strong></p>
              </div>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleStart}
              disabled={!audience || create.isPending}
              className="text-white hover:opacity-90"
              style={{ backgroundColor: "#7130A0" }}
            >
              {create.isPending ? "Starting…" : "Start cycle"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
