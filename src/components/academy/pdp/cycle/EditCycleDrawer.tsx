import { useEffect, useState } from "react";
import { format, parseISO } from "date-fns";
import { CalendarIcon } from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { useUpdateCycle } from "@/features/pdp/hooks";
import type { PdpCycle } from "@/features/pdp/types";

interface Props {
  cycle: PdpCycle;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function EditCycleDrawer({ cycle, open, onOpenChange }: Props) {
  const [target, setTarget] = useState<string>(String(cycle.target_pd_hours ?? ""));
  const [endDate, setEndDate] = useState<Date | undefined>(
    cycle.cycle_end_date ? parseISO(cycle.cycle_end_date) : undefined,
  );
  const [notes, setNotes] = useState<string>(cycle.notes ?? "");
  const update = useUpdateCycle(cycle.id);

  useEffect(() => {
    if (open) {
      setTarget(String(cycle.target_pd_hours ?? ""));
      setEndDate(cycle.cycle_end_date ? parseISO(cycle.cycle_end_date) : undefined);
      setNotes(cycle.notes ?? "");
    }
  }, [open, cycle]);

  const onSave = async () => {
    await update.mutateAsync({
      cycleId: cycle.id,
      target_pd_hours: Number(target) || 0,
      cycle_end_date: endDate ? format(endDate, "yyyy-MM-dd") : cycle.cycle_end_date ?? undefined,
      notes: notes.trim() ? notes : null,
    });
    onOpenChange(false);
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="sm:max-w-md">
        <SheetHeader>
          <SheetTitle>Edit cycle</SheetTitle>
          <SheetDescription>Adjust your target hours, end date, or notes.</SheetDescription>
        </SheetHeader>

        <div className="mt-6 space-y-4">
          <div className="space-y-2">
            <Label htmlFor="target">Target PD hours</Label>
            <Input
              id="target"
              type="number"
              min={0}
              step={0.5}
              value={target}
              onChange={(e) => setTarget(e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label>Cycle end date</Label>
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  className={cn(
                    "w-full justify-start text-left font-normal",
                    !endDate && "text-muted-foreground",
                  )}
                >
                  <CalendarIcon className="mr-2 h-4 w-4" />
                  {endDate ? format(endDate, "dd/MM/yyyy") : "Pick a date"}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar
                  mode="single"
                  selected={endDate}
                  onSelect={setEndDate}
                  initialFocus
                  className={cn("p-3 pointer-events-auto")}
                />
              </PopoverContent>
            </Popover>
          </div>

          <div className="space-y-2">
            <Label htmlFor="notes">Notes</Label>
            <Textarea
              id="notes"
              rows={5}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Optional planning notes for this cycle."
            />
          </div>
        </div>

        <SheetFooter className="mt-6">
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={onSave} disabled={update.isPending}>
            {update.isPending ? "Saving…" : "Save changes"}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
