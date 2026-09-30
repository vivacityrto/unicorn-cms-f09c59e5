import { useState } from 'react';
import { formatDistanceToNow } from 'date-fns';
import { ChevronDown, ChevronUp, Clock, Pin, PinOff } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { usePinnedNotes, useSetNotePinned } from '@/hooks/usePinnedNotes';
import { noteHtmlToPlainText } from '@/lib/noteHtml';
import { sanitizeHtml } from '@/lib/sanitize';
import { cn } from '@/lib/utils';

interface PinnedNotesCardProps {
  tenantId: number;
  className?: string;
}

/**
 * The one place pinned notes are listed for a client. Shows client-level and
 * package-level pins together (each labelled), and renders nothing when there
 * are none, so it can sit on any tab without leaving an empty card behind.
 */
export function PinnedNotesCard({ tenantId, className }: PinnedNotesCardProps) {
  const { data: pinned = [] } = usePinnedNotes(tenantId);
  const setPinned = useSetNotePinned(tenantId);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  if (pinned.length === 0) return null;

  const toggleExpanded = (id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  return (
    <Card className={cn('border-amber-200 dark:border-amber-800', className)} data-testid="pinned-notes-card">
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-base">
          <Pin className="h-4 w-4 text-amber-600" />
          Pinned notes
          <Badge variant="secondary" className="text-xs">{pinned.length}</Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {pinned.map((note) => {
          const isExpanded = expanded.has(note.id);
          const preview = noteHtmlToPlainText(note.note_details);
          const isPackageNote = note.parent_type === 'package_instance';
          return (
            <div
              key={note.id}
              data-testid="pinned-note"
              className="p-3 rounded-lg bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="font-medium text-sm">{note.title || 'Untitled note'}</p>
                    <Badge variant="outline" className="text-xs">
                      {isPackageNote ? note.package_name || 'Package' : 'Client'}
                    </Badge>
                  </div>
                  {isExpanded ? (
                    <div
                      className="prose prose-sm dark:prose-invert max-w-none mt-1"
                      dangerouslySetInnerHTML={{ __html: sanitizeHtml(note.note_details || '') }}
                    />
                  ) : (
                    <p className="text-sm text-muted-foreground mt-1 line-clamp-2">{preview}</p>
                  )}
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  {preview.length > 100 && (
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6"
                      onClick={() => toggleExpanded(note.id)}
                      title={isExpanded ? 'Collapse note' : 'Expand note'}
                    >
                      {isExpanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                    </Button>
                  )}
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6 text-amber-600 hover:text-amber-700"
                    onClick={() => setPinned.mutate({ noteId: note.id, pinned: false })}
                    title="Unpin note"
                  >
                    <PinOff className="h-3 w-3" />
                  </Button>
                </div>
              </div>
              <div className="flex items-center gap-3 mt-2 text-xs text-muted-foreground">
                <span className="flex items-center gap-1">
                  <Clock className="h-3 w-3" />
                  {formatDistanceToNow(new Date(note.updated_at), { addSuffix: true })}
                </span>
                {note.creator && (
                  <span className="flex items-center gap-1">
                    <Avatar className="h-4 w-4">
                      <AvatarImage src={note.creator.avatar_url || undefined} />
                      <AvatarFallback className="text-[8px]">
                        {note.creator.first_name?.[0]}{note.creator.last_name?.[0]}
                      </AvatarFallback>
                    </Avatar>
                    {note.creator.first_name} {note.creator.last_name}
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}
