import { useStageNotes } from '@/hooks/useStageNotes';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { StickyNote, AlertTriangle } from 'lucide-react';
import { format } from 'date-fns';
import DOMPurify from 'dompurify';

interface StageNotesSectionProps {
  tenantId: number;
  packageId: number;
}

const PRIORITY_COLORS: Record<string, string> = {
  high: 'text-destructive',
  medium: 'text-amber-600',
  low: 'text-muted-foreground',
};

export function StageNotesSection({ tenantId, packageId }: StageNotesSectionProps) {
  const { notes, loading, totalCount } = useStageNotes({ tenantId, packageId });

  if (loading) {
    return (
      <div className="space-y-2 px-4 py-3 border-t bg-muted/20">
        <Skeleton className="h-4 w-24" />
        {[1, 2].map(i => <Skeleton key={i} className="h-8 w-full" />)}
      </div>
    );
  }

  if (totalCount === 0) {
    return (
      <div className="px-4 py-3 border-t bg-muted/20 text-center text-muted-foreground text-sm">
        No notes for this client.
      </div>
    );
  }

  const stripHtml = (html: string) => {
    const clean = DOMPurify.sanitize(html, { ALLOWED_TAGS: [] });
    return clean.slice(0, 120) + (clean.length > 120 ? '…' : '');
  };

  return (
    <div className="border-t bg-muted/20">
      <div className="px-4 py-2 border-b bg-muted/30 flex items-center justify-between">
        <span className="text-sm font-medium flex items-center gap-1.5">
          <StickyNote className="h-3.5 w-3.5" />
          Client Notes
        </span>
        <Badge variant="outline" className="text-xs">{totalCount} total</Badge>
      </div>
      <div className="divide-y">
        {notes.map((note) => (
          <div key={note.id} className="flex items-start gap-3 px-4 py-2">
            {note.priority === 'high' ? (
              <AlertTriangle className="h-4 w-4 shrink-0 text-destructive mt-0.5" />
            ) : (
              <StickyNote className="h-4 w-4 shrink-0 text-muted-foreground mt-0.5" />
            )}
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium truncate">{note.title}</p>
              <p className="text-xs text-muted-foreground line-clamp-2">
                {stripHtml(note.note_details)}
              </p>
            </div>
            <div className="flex flex-col items-end gap-1 shrink-0">
              {note.created_at && (
                <span className="text-xs text-muted-foreground">
                  {format(new Date(note.created_at), 'dd MMM yyyy')}
                </span>
              )}
              <Badge variant="outline" className="text-xs">{note.note_type}</Badge>
            </div>
          </div>
        ))}
      </div>
      {totalCount > 10 && (
        <div className="px-4 py-2 border-t text-center">
          <button className="text-xs text-primary hover:underline">
            View all {totalCount} notes
          </button>
        </div>
      )}
    </div>
  );
}
