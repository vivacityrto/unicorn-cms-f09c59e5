import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { PartyPopper, Sparkles, X } from "lucide-react";
import { useStaffOnboardingStatus } from "@/hooks/useStaffOnboardingStatus";

export function StaffOnboardingBanner() {
  const navigate = useNavigate();
  const { status, dismissForToday, clearDismissal } = useStaffOnboardingStatus();
  const [modalOpen, setModalOpen] = useState(true);

  if (!status || !status.runId || !status.shouldShowBanner) return null;

  const pct = Math.round((status.completedCount / status.totalCount) * 100);
  const remaining = Math.max(status.totalCount - status.completedCount, 0);
  const firstLoginModal = status.shouldShowWelcomeModal && modalOpen;

  const goToOnboarding = () => {
    clearDismissal.mutate();
    setModalOpen(false);
    navigate("/my-onboarding");
  };

  return (
    <>
      {/* First-login welcome modal */}
      <Dialog open={firstLoginModal} onOpenChange={(open) => { if (!open) setModalOpen(false); }}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-2xl">
              <PartyPopper className="h-6 w-6 text-primary" />
              Welcome to Unicorn, {status.firstName || "team member"}!
            </DialogTitle>
            <DialogDescription className="pt-2 text-base">
              Your onboarding checklist is waiting for you.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2 py-2">
            <div className="text-sm text-muted-foreground">
              {status.completedCount} of {status.totalCount} onboarding tasks complete
            </div>
            <Progress value={pct} />
          </div>
          <DialogFooter className="gap-2 sm:gap-2">
            <Button
              variant="ghost"
              onClick={() => {
                dismissForToday.mutate();
                setModalOpen(false);
              }}
            >
              I'll do this later
            </Button>
            <Button onClick={goToOnboarding}>View My Onboarding Checklist</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Persistent compact reminder banner */}
      <Card className="mx-4 md:mx-6 mt-4 border-primary/30 bg-primary/5">
        <div className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-3 min-w-0">
            <Sparkles className="h-5 w-5 mt-0.5 text-primary shrink-0" />
            <div className="min-w-0">
              <div className="font-medium text-foreground">
                You have {remaining} onboarding task{remaining === 1 ? "" : "s"} still to complete.
              </div>
              <div className="mt-2 flex items-center gap-3 max-w-md">
                <Progress value={pct} className="h-2 flex-1" />
                <span className="text-xs text-muted-foreground whitespace-nowrap">
                  {status.completedCount} of {status.totalCount} complete
                </span>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <Button size="sm" onClick={goToOnboarding}>Continue Onboarding →</Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => dismissForToday.mutate()}
              title="Remind me tomorrow"
            >
              <X className="h-4 w-4" />
              <span className="sr-only">Remind me tomorrow</span>
            </Button>
          </div>
        </div>
      </Card>
    </>
  );
}
