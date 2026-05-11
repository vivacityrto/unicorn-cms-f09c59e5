import { useEffect, useState } from "react";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useIsMobile } from "@/hooks/use-mobile";
import { useCreateReview } from "@/features/pdp/hooks";
import type { PdpReviewOutcome, PdpReviewType } from "@/features/pdp/types";

export interface ReviewComposerDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  cycleId: number;
  revieweeName?: string | null;
}

const NONE = "__none__";

export function ReviewComposerDrawer({
  open,
  onOpenChange,
  cycleId,
  revieweeName,
}: ReviewComposerDrawerProps) {
  const isMobile = useIsMobile();
  const [reviewType, setReviewType] = useState<PdpReviewType>("mid_cycle");
  const [notes, setNotes] = useState("");
  const [outcome, setOutcome] = useState<PdpReviewOutcome | typeof NONE>(NONE);
  const createReview = useCreateReview(cycleId);

  useEffect(() => {
    if (!open) {
      setReviewType("mid_cycle");
      setNotes("");
      setOutcome(NONE);
    }
  }, [open]);

  const handleSave = () => {
    createReview.mutate(
      {
        cycle_id: cycleId,
        review_type: reviewType,
        notes: notes.trim() ? notes.trim() : null,
        outcome: outcome === NONE ? null : outcome,
      },
      {
        onSuccess: () => onOpenChange(false),
      },
    );
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side={isMobile ? "bottom" : "right"}
        className={isMobile ? "h-[85vh] overflow-y-auto" : "w-full sm:max-w-lg overflow-y-auto"}
      >
        <SheetHeader>
          <SheetTitle>Manager review</SheetTitle>
          <SheetDescription>
            {revieweeName ? `Reviewing ${revieweeName}'s cycle.` : "Compose a review for this cycle."}
          </SheetDescription>
        </SheetHeader>

        <div className="space-y-5 py-4">
          <div className="space-y-2">
            <Label>Review type</Label>
            <RadioGroup
              value={reviewType}
              onValueChange={(v) => setReviewType(v as PdpReviewType)}
              className="flex flex-col gap-2"
            >
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="mid_cycle" id="rt-mid" />
                <Label htmlFor="rt-mid" className="font-normal">Mid cycle</Label>
              </div>
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="end_cycle" id="rt-end" />
                <Label htmlFor="rt-end" className="font-normal">End cycle</Label>
              </div>
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="ad_hoc" id="rt-adhoc" />
                <Label htmlFor="rt-adhoc" className="font-normal">Ad hoc</Label>
              </div>
            </RadioGroup>
          </div>

          <div className="space-y-2">
            <Label htmlFor="rev-notes">Notes</Label>
            <Textarea
              id="rev-notes"
              rows={8}
              maxLength={4000}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Capture your review notes…"
            />
            <p className="text-xs text-muted-foreground">
              Markdown supported · {notes.length}/4000
            </p>
          </div>

          <div className="space-y-2">
            <Label>Outcome</Label>
            <Select value={outcome} onValueChange={(v) => setOutcome(v as PdpReviewOutcome | typeof NONE)}>
              <SelectTrigger>
                <SelectValue placeholder="Select an outcome" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NONE}>No outcome yet</SelectItem>
                <SelectItem value="on_track">On track</SelectItem>
                <SelectItem value="needs_action">Needs action</SelectItem>
                <SelectItem value="completed">Completed</SelectItem>
                <SelectItem value="not_completed">Not completed</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <SheetFooter className="gap-2 sm:gap-2">
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={createReview.isPending}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={createReview.isPending}>
            {createReview.isPending ? "Saving…" : "Save review"}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}

export default ReviewComposerDrawer;
