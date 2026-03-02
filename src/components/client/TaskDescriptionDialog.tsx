import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { HelpCircle } from 'lucide-react';
import { cn } from '@/lib/utils';
import DOMPurify from 'dompurify';

interface TaskDescriptionDialogProps {
  taskName: string;
  description: string | null;
  className?: string;
}

export function TaskDescriptionButton({ taskName, description, className }: TaskDescriptionDialogProps) {
  const [open, setOpen] = useState(false);

  if (!description) return null;

  const sanitizedHtml = DOMPurify.sanitize(description);

  return (
    <>
      <Button
        variant="ghost"
        size="icon"
        className={cn("h-5 w-5 shrink-0 text-muted-foreground hover:text-foreground", className)}
        onClick={(e) => {
          e.stopPropagation();
          setOpen(true);
        }}
        title="View description"
      >
        <HelpCircle className="h-3.5 w-3.5" />
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent
          size={description.length > 300 ? "full" : "lg"}
          className="max-h-[80vh] overflow-y-auto"
        >
          <DialogHeader>
            <DialogTitle className="text-base">{taskName}</DialogTitle>
          </DialogHeader>
          <div
            className="prose prose-sm dark:prose-invert max-w-none break-words"
            dangerouslySetInnerHTML={{ __html: sanitizedHtml }}
          />
        </DialogContent>
      </Dialog>
    </>
  );
}
