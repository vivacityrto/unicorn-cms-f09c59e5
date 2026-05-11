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

// Placeholder — full form implemented in a later prompt.
export function AddEvidenceSheet({ open, onOpenChange }: Props) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="sm:max-w-md">
        <SheetHeader>
          <SheetTitle>Log evidence</SheetTitle>
          <SheetDescription>
            The full Add Evidence form is coming soon. For now this drawer is a placeholder.
          </SheetDescription>
        </SheetHeader>
        <div className="mt-6 text-sm text-muted-foreground">
          Evidence types, document upload, and goal linking will be added in the next iteration.
        </div>
      </SheetContent>
    </Sheet>
  );
}
