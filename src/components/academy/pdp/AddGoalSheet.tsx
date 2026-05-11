import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  cycleId: number | null;
}

// Placeholder — full goal form implemented in a later prompt.
export function AddGoalSheet({ open, onOpenChange }: Props) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="sm:max-w-md">
        <SheetHeader>
          <SheetTitle>Add a goal</SheetTitle>
          <SheetDescription>
            The full Goal form is coming soon. For now this drawer is a placeholder.
          </SheetDescription>
        </SheetHeader>
        <div className="mt-6 text-sm text-muted-foreground">
          SMART goal capture and linked-evidence selection will be added in the next iteration.
        </div>
      </SheetContent>
    </Sheet>
  );
}
