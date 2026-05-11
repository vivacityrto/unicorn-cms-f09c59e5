import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer";
import type { PdpEvidenceItem } from "@/features/pdp/types";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  evidence: PdpEvidenceItem | null;
}

// Placeholder — full reflection form implemented in a later prompt.
export function AddReflectionDrawer({ open, onOpenChange, evidence }: Props) {
  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent>
        <DrawerHeader>
          <DrawerTitle>Add reflection</DrawerTitle>
          <DrawerDescription>
            {evidence
              ? `For: ${evidence.title}`
              : "Reflection capture is coming soon."}
          </DrawerDescription>
        </DrawerHeader>
        <div className="px-4 pb-6 text-sm text-muted-foreground">
          The reflection prompt and response form will be added in the next iteration.
        </div>
      </DrawerContent>
    </Drawer>
  );
}
