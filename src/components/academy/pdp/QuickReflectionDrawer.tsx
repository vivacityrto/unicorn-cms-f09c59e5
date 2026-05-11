import { useEffect, useState } from "react";
import { X, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useAddReflection } from "@/features/pdp/hooks";
import { toast } from "sonner";

export interface QuickReflectionDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  lessonProgressId: number | null;
  cycleId: number | null;
  lessonTitle?: string | null;
}

const PROMPT = "What's one thing you'll do differently because of this lesson?";
const MAX = 1000;

export function QuickReflectionDrawer({
  open,
  onOpenChange,
  lessonProgressId,
  cycleId,
  lessonTitle,
}: QuickReflectionDrawerProps) {
  const [response, setResponse] = useState("");
  const addReflection = useAddReflection(cycleId);

  useEffect(() => {
    if (!open) setResponse("");
  }, [open]);

  if (!open || lessonProgressId == null) return null;

  const trimmed = response.trim();
  const disabled = !trimmed || addReflection.isPending;

  const handleSave = () => {
    addReflection.mutate(
      {
        lesson_progress_id: lessonProgressId,
        prompt: PROMPT,
        response: trimmed,
        ...(cycleId != null ? { cycle_id: cycleId } : {}),
      },
      {
        onSuccess: () => {
          toast.success("Reflection saved");
          onOpenChange(false);
        },
      },
    );
  };

  return (
    <div
      className="fixed bottom-4 right-4 z-50 w-[min(92vw,400px)] rounded-lg border bg-background shadow-2xl animate-in slide-in-from-bottom-4 fade-in"
      role="dialog"
      aria-label="Quick reflection"
    >
      <div className="flex items-start justify-between gap-2 border-b px-4 py-3">
        <div className="flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-primary" />
          <div>
            <h3 className="text-sm font-semibold">Quick reflection (optional)</h3>
            {lessonTitle ? (
              <p className="text-xs text-muted-foreground line-clamp-1">{lessonTitle}</p>
            ) : null}
          </div>
        </div>
        <button
          type="button"
          onClick={() => onOpenChange(false)}
          className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
          aria-label="Close"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="space-y-2 px-4 py-3">
        <p className="text-sm text-foreground">{PROMPT}</p>
        <Textarea
          rows={3}
          maxLength={MAX}
          value={response}
          onChange={(e) => setResponse(e.target.value)}
          placeholder="Jot down a quick thought…"
          className="resize-none"
        />
        <div className="text-right text-xs text-muted-foreground">
          {response.length}/{MAX}
        </div>
      </div>

      <div className="flex items-center justify-between gap-2 border-t px-4 py-3">
        <button
          type="button"
          onClick={() => onOpenChange(false)}
          className="text-sm text-muted-foreground underline-offset-2 hover:underline"
          disabled={addReflection.isPending}
        >
          Skip
        </button>
        <Button type="button" size="sm" onClick={handleSave} disabled={disabled}>
          {addReflection.isPending ? "Saving…" : "Save reflection"}
        </Button>
      </div>
    </div>
  );
}

export default QuickReflectionDrawer;
