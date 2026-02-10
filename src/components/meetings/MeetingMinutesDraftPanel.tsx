import { useState } from 'react';
import { format } from 'date-fns';
import { FileText, Save, Send, Loader2, CheckCircle2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { useMeetingMinutesDraft } from '@/hooks/useMeetingMinutesDraft';

interface MeetingMinutesDraftPanelProps {
  meetingId: string;
  isVivacityTeam: boolean;
}

export function MeetingMinutesDraftPanel({ meetingId, isVivacityTeam }: MeetingMinutesDraftPanelProps) {
  const { draft, isLoading, updateDraft, isUpdating, publishMinutes, isPublishing } = useMeetingMinutesDraft(meetingId);
  const [editContent, setEditContent] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState<string | null>(null);

  if (isLoading) {
    return <div className="text-sm text-muted-foreground">Loading minutes draft...</div>;
  }

  if (!draft) {
    return (
      <div className="text-center py-6">
        <FileText className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
        <p className="text-sm text-muted-foreground">No minutes draft yet</p>
        <p className="text-xs text-muted-foreground mt-1">
          Sync Microsoft artifacts to auto-create a minutes draft.
        </p>
      </div>
    );
  }

  const isEditing = editContent !== null;
  const isPublished = draft.status === 'published';

  const handleStartEdit = () => {
    setEditContent(draft.content);
    setEditTitle(draft.title);
  };

  const handleSave = () => {
    if (editContent === null) return;
    updateDraft({
      draftId: draft.id,
      content: editContent,
      title: editTitle || undefined,
    });
    setEditContent(null);
    setEditTitle(null);
  };

  const handleCancel = () => {
    setEditContent(null);
    setEditTitle(null);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <FileText className="h-4 w-4 text-muted-foreground" />
          <span className="text-sm font-medium">Meeting Minutes</span>
          <Badge variant={isPublished ? 'default' : 'secondary'}>
            {isPublished ? 'Published' : 'Draft'}
          </Badge>
        </div>
        <div className="text-xs text-muted-foreground">
          Updated {format(new Date(draft.updated_at), 'MMM d, HH:mm')}
        </div>
      </div>

      {isPublished && draft.published_at && (
        <Alert>
          <CheckCircle2 className="h-4 w-4" />
          <AlertDescription className="text-xs">
            Published to client portal on {format(new Date(draft.published_at), 'MMM d, yyyy HH:mm')}
          </AlertDescription>
        </Alert>
      )}

      <Separator />

      {isVivacityTeam && isEditing ? (
        <div className="space-y-3">
          <Input
            value={editTitle ?? ''}
            onChange={(e) => setEditTitle(e.target.value)}
            placeholder="Minutes title"
            className="font-medium"
          />
          <Textarea
            value={editContent ?? ''}
            onChange={(e) => setEditContent(e.target.value)}
            rows={12}
            placeholder="Enter meeting minutes..."
          />
          <div className="flex gap-2">
            <Button size="sm" onClick={handleSave} disabled={isUpdating}>
              {isUpdating ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Save className="h-4 w-4 mr-2" />}
              Save
            </Button>
            <Button size="sm" variant="outline" onClick={handleCancel}>
              Cancel
            </Button>
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          <h4 className="font-medium text-sm">{draft.title}</h4>
          <div className="text-sm whitespace-pre-wrap bg-muted/50 p-3 rounded-md min-h-[100px]">
            {draft.content || <span className="text-muted-foreground italic">No content yet</span>}
          </div>
          {isVivacityTeam && (
            <div className="flex gap-2">
              <Button size="sm" variant="outline" onClick={handleStartEdit}>
                Edit
              </Button>
              {!isPublished && (
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button size="sm" className="gap-2" disabled={isPublishing || !draft.content}>
                      {isPublishing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                      Publish Minutes to Client
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Publish Meeting Minutes?</AlertDialogTitle>
                      <AlertDialogDescription>
                        This will create a document in the client portal's documents area. The client will be able to view and download these minutes.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancel</AlertDialogCancel>
                      <AlertDialogAction onClick={() => publishMinutes(draft.id)}>
                        Publish
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
