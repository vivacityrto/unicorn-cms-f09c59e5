import { useState, useEffect } from 'react';
import { format } from 'date-fns';
import {
  FileText, Save, Send, Loader2, CheckCircle2, Plus, Trash2, Download,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Label } from '@/components/ui/label';
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
import { useTeamsMeetingMinutes, MinutesContent } from '@/hooks/useTeamsMeetingMinutes';

interface MeetingMinutesPanelProps {
  meetingId: string;
  isVivacityTeam: boolean;
}

const EMPTY_ACTION = { action: '', owner: '', due_date: '' };

export function MeetingMinutesPanel({ meetingId, isVivacityTeam }: MeetingMinutesPanelProps) {
  const { minutes, isLoading, saveDraft, isSaving, publishMinutes, isPublishing } = useTeamsMeetingMinutes(meetingId);
  const [isEditing, setIsEditing] = useState(false);
  const [editContent, setEditContent] = useState<MinutesContent | null>(null);
  const [editTitle, setEditTitle] = useState('');

  if (isLoading) {
    return <div className="text-sm text-muted-foreground">Loading minutes...</div>;
  }

  if (!minutes) {
    return (
      <div className="text-center py-6">
        <FileText className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
        <p className="text-sm text-muted-foreground">No minutes yet</p>
        <p className="text-xs text-muted-foreground mt-1">
          Sync Microsoft artifacts to auto-create a minutes draft.
        </p>
      </div>
    );
  }

  const isPublished = minutes.status === 'published';
  const content = minutes.content;

  const handleStartEdit = () => {
    setEditContent({ ...content });
    setEditTitle(minutes.title);
    setIsEditing(true);
  };

  const handleSave = () => {
    if (!editContent) return;
    saveDraft({
      minutesId: minutes.id,
      content: editContent,
      title: editTitle || undefined,
    });
    setIsEditing(false);
    setEditContent(null);
  };

  const handleCancel = () => {
    setIsEditing(false);
    setEditContent(null);
  };

  const updateField = <K extends keyof MinutesContent>(field: K, value: MinutesContent[K]) => {
    if (!editContent) return;
    setEditContent({ ...editContent, [field]: value });
  };

  const addAction = () => {
    if (!editContent) return;
    setEditContent({
      ...editContent,
      actions: [...editContent.actions, { ...EMPTY_ACTION }],
    });
  };

  const removeAction = (idx: number) => {
    if (!editContent) return;
    setEditContent({
      ...editContent,
      actions: editContent.actions.filter((_, i) => i !== idx),
    });
  };

  const updateAction = (idx: number, field: string, value: string) => {
    if (!editContent) return;
    const newActions = [...editContent.actions];
    newActions[idx] = { ...newActions[idx], [field]: value };
    setEditContent({ ...editContent, actions: newActions });
  };

  const hasMinimumFields = content.attendees?.length > 0 && (
    (content.decisions?.length > 0) ||
    (content.actions?.length > 0) ||
    (content.discussion_notes?.trim())
  );

  // ── Editing mode ───────────────────────────────────────────────────
  if (isVivacityTeam && isEditing && editContent) {
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium">Editing Minutes</span>
          <div className="flex gap-2">
            <Button size="sm" onClick={handleSave} disabled={isSaving}>
              {isSaving ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Save className="h-4 w-4 mr-1" />}
              Save
            </Button>
            <Button size="sm" variant="outline" onClick={handleCancel}>Cancel</Button>
          </div>
        </div>

        <Separator />

        <div className="space-y-3">
          <div>
            <Label className="text-xs">Title</Label>
            <Input value={editTitle} onChange={(e) => setEditTitle(e.target.value)} />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">Date</Label>
              <Input value={editContent.meeting_date} onChange={(e) => updateField('meeting_date', e.target.value)} />
            </div>
            <div>
              <Label className="text-xs">Time</Label>
              <Input value={editContent.meeting_time} onChange={(e) => updateField('meeting_time', e.target.value)} />
            </div>
          </div>

          <div>
            <Label className="text-xs">Attendees (one per line)</Label>
            <Textarea
              rows={3}
              value={editContent.attendees.join('\n')}
              onChange={(e) => updateField('attendees', e.target.value.split('\n').filter(Boolean))}
            />
          </div>

          <div>
            <Label className="text-xs">Apologies (one per line)</Label>
            <Textarea
              rows={2}
              value={editContent.apologies.join('\n')}
              onChange={(e) => updateField('apologies', e.target.value.split('\n').filter(Boolean))}
            />
          </div>

          <div>
            <Label className="text-xs">Agenda Items (one per line)</Label>
            <Textarea
              rows={3}
              value={editContent.agenda_items.join('\n')}
              onChange={(e) => updateField('agenda_items', e.target.value.split('\n').filter(Boolean))}
            />
          </div>

          <div>
            <Label className="text-xs">Discussion Notes</Label>
            <Textarea
              rows={5}
              value={editContent.discussion_notes}
              onChange={(e) => updateField('discussion_notes', e.target.value)}
            />
          </div>

          <div>
            <Label className="text-xs">Decisions (one per line)</Label>
            <Textarea
              rows={3}
              value={editContent.decisions.join('\n')}
              onChange={(e) => updateField('decisions', e.target.value.split('\n').filter(Boolean))}
            />
          </div>

          <div>
            <div className="flex items-center justify-between mb-1">
              <Label className="text-xs">Action Items</Label>
              <Button size="sm" variant="ghost" onClick={addAction} className="h-6 px-2 text-xs gap-1">
                <Plus className="h-3 w-3" /> Add
              </Button>
            </div>
            {editContent.actions.map((action, idx) => (
              <div key={idx} className="flex gap-2 mb-2">
                <Input
                  placeholder="Action"
                  value={action.action}
                  onChange={(e) => updateAction(idx, 'action', e.target.value)}
                  className="flex-1"
                />
                <Input
                  placeholder="Owner"
                  value={action.owner}
                  onChange={(e) => updateAction(idx, 'owner', e.target.value)}
                  className="w-28"
                />
                <Input
                  type="date"
                  value={action.due_date}
                  onChange={(e) => updateAction(idx, 'due_date', e.target.value)}
                  className="w-32"
                />
                <Button size="icon" variant="ghost" onClick={() => removeAction(idx)} className="h-9 w-9 shrink-0">
                  <Trash2 className="h-3.5 w-3.5 text-destructive" />
                </Button>
              </div>
            ))}
          </div>

          <div>
            <Label className="text-xs">Next Meeting</Label>
            <Input
              value={editContent.next_meeting}
              onChange={(e) => updateField('next_meeting', e.target.value)}
              placeholder="e.g. Tuesday 18 Feb 2026, 2:00pm"
            />
          </div>
        </div>
      </div>
    );
  }

  // ── Read-only view ─────────────────────────────────────────────────
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
          v{minutes.version} · {format(new Date(minutes.updated_at), 'MMM d, HH:mm')}
        </div>
      </div>

      {isPublished && minutes.published_at && (
        <Alert>
          <CheckCircle2 className="h-4 w-4" />
          <AlertDescription className="text-xs">
            Published to client portal on {format(new Date(minutes.published_at), 'MMM d, yyyy HH:mm')}
          </AlertDescription>
        </Alert>
      )}

      <Separator />

      {/* Structured content display */}
      <div className="space-y-3 text-sm">
        <h4 className="font-medium">{minutes.title}</h4>

        {content.meeting_date && (
          <div className="text-xs text-muted-foreground">
            {content.meeting_date} {content.meeting_time && `at ${content.meeting_time}`}
            {content.duration_minutes > 0 && ` (${content.duration_minutes} min)`}
          </div>
        )}

        {content.attendees?.length > 0 && (
          <div>
            <div className="text-xs font-medium text-muted-foreground mb-1">Attendees</div>
            <div className="text-sm">{content.attendees.join(', ')}</div>
          </div>
        )}

        {content.apologies?.length > 0 && (
          <div>
            <div className="text-xs font-medium text-muted-foreground mb-1">Apologies</div>
            <div className="text-sm">{content.apologies.join(', ')}</div>
          </div>
        )}

        {content.agenda_items?.length > 0 && (
          <div>
            <div className="text-xs font-medium text-muted-foreground mb-1">Agenda</div>
            <ul className="list-disc list-inside text-sm space-y-0.5">
              {content.agenda_items.map((item, i) => <li key={i}>{item}</li>)}
            </ul>
          </div>
        )}

        {content.discussion_notes && (
          <div>
            <div className="text-xs font-medium text-muted-foreground mb-1">Discussion</div>
            <div className="text-sm whitespace-pre-wrap bg-muted/50 p-2 rounded">{content.discussion_notes}</div>
          </div>
        )}

        {content.decisions?.length > 0 && (
          <div>
            <div className="text-xs font-medium text-muted-foreground mb-1">Decisions</div>
            <ul className="list-disc list-inside text-sm space-y-0.5">
              {content.decisions.map((d, i) => <li key={i}>{d}</li>)}
            </ul>
          </div>
        )}

        {content.actions?.length > 0 && (
          <div>
            <div className="text-xs font-medium text-muted-foreground mb-1">Actions</div>
            <div className="border rounded overflow-hidden">
              <table className="w-full text-xs">
                <thead className="bg-muted/50">
                  <tr>
                    <th className="text-left p-1.5 font-medium">Action</th>
                    <th className="text-left p-1.5 font-medium w-24">Owner</th>
                    <th className="text-left p-1.5 font-medium w-24">Due</th>
                  </tr>
                </thead>
                <tbody>
                  {content.actions.map((a, i) => (
                    <tr key={i} className="border-t">
                      <td className="p-1.5">{a.action}</td>
                      <td className="p-1.5">{a.owner}</td>
                      <td className="p-1.5">{a.due_date}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {content.next_meeting && (
          <div>
            <div className="text-xs font-medium text-muted-foreground mb-1">Next Meeting</div>
            <div className="text-sm">{content.next_meeting}</div>
          </div>
        )}
      </div>

      {/* Vivacity team actions */}
      {isVivacityTeam && (
        <>
          <Separator />
          <div className="flex gap-2">
            {!isPublished && (
              <Button size="sm" variant="outline" onClick={handleStartEdit}>
                Edit
              </Button>
            )}
            {!isPublished && (
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button size="sm" className="gap-2" disabled={isPublishing || !hasMinimumFields}>
                    {isPublishing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                    Publish Minutes (PDF)
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Publish Meeting Minutes?</AlertDialogTitle>
                    <AlertDialogDescription>
                      This will generate a PDF and make it available in the client portal documents area. The client will be able to view and download these minutes.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction onClick={() => publishMinutes(minutes.id)}>
                      Publish
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            )}
            {isPublished && minutes.pdf_storage_path && (
              <Button size="sm" variant="outline" className="gap-2">
                <Download className="h-4 w-4" />
                Download PDF
              </Button>
            )}
          </div>
        </>
      )}

      {/* Client view: just show download if published */}
      {!isVivacityTeam && isPublished && minutes.pdf_storage_path && (
        <>
          <Separator />
          <Button size="sm" variant="outline" className="gap-2">
            <Download className="h-4 w-4" />
            Download Minutes PDF
          </Button>
        </>
      )}
    </div>
  );
}
