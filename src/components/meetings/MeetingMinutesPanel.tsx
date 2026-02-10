import { useState, useRef } from 'react';
import { format } from 'date-fns';
import {
  FileText, Save, Send, Loader2, CheckCircle2, Plus, Trash2, Download,
  RefreshCw, Sparkles, AlertTriangle, Check, X, ClipboardPaste,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { useTeamsMeetingMinutes, MinutesContent, AiProposedMinutes, CopilotExtracted } from '@/hooks/useTeamsMeetingMinutes';

interface MeetingMinutesPanelProps {
  meetingId: string;
  isVivacityTeam: boolean;
}

const EMPTY_ACTION = { action: '', owner: '', due_date: '', status: 'Open' };

// ── AI Preview component ─────────────────────────────────────────────
function AiPreviewPanel({
  proposed,
  onApply,
  onDiscard,
}: {
  proposed: AiProposedMinutes;
  onApply: () => void;
  onDiscard: () => void;
}) {
  const confidenceBadge = (level: string) => {
    const variant = level === 'high' ? 'default' : level === 'medium' ? 'secondary' : 'destructive';
    return <Badge variant={variant} className="text-[10px] ml-1">{level}</Badge>;
  };

  return (
    <div className="space-y-3 border rounded-lg p-4 bg-muted/30">
      <div className="flex items-center gap-2">
        <Sparkles className="h-4 w-4 text-primary" />
        <span className="text-sm font-medium">AI Draft Preview</span>
        <Badge variant="outline" className="text-[10px]">Review required</Badge>
      </div>

      <Alert>
        <AlertTriangle className="h-4 w-4" />
        <AlertDescription className="text-xs">
          Generated from transcript summary. Review all sections for accuracy before applying.
        </AlertDescription>
      </Alert>

      {proposed.agenda_items.length > 0 && (
        <div>
          <div className="text-xs font-medium text-muted-foreground flex items-center">
            Agenda {confidenceBadge(proposed.confidence?.agenda_items || 'medium')}
          </div>
          <ul className="list-disc list-inside text-xs mt-1 space-y-0.5">
            {proposed.agenda_items.map((item, i) => <li key={i}>{item}</li>)}
          </ul>
        </div>
      )}

      {proposed.discussion_notes && (
        <div>
          <div className="text-xs font-medium text-muted-foreground flex items-center">
            Discussion Notes {confidenceBadge(proposed.confidence?.discussion_notes || 'medium')}
          </div>
          <div className="text-xs whitespace-pre-wrap bg-background p-2 rounded mt-1 border">
            {proposed.discussion_notes}
          </div>
        </div>
      )}

      {proposed.decisions.length > 0 && (
        <div>
          <div className="text-xs font-medium text-muted-foreground flex items-center">
            Decisions {confidenceBadge(proposed.confidence?.decisions || 'medium')}
          </div>
          <ul className="list-disc list-inside text-xs mt-1 space-y-0.5">
            {proposed.decisions.map((d, i) => <li key={i}>{d}</li>)}
          </ul>
        </div>
      )}

      {proposed.actions.length > 0 && (
        <div>
          <div className="text-xs font-medium text-muted-foreground flex items-center">
            Actions {confidenceBadge(proposed.confidence?.actions || 'medium')}
          </div>
          <div className="border rounded overflow-hidden mt-1">
            <table className="w-full text-xs">
              <thead className="bg-muted/50">
                <tr>
                  <th className="text-left p-1.5 font-medium">Action</th>
                  <th className="text-left p-1.5 font-medium w-20">Owner</th>
                  <th className="text-left p-1.5 font-medium w-20">Due</th>
                  <th className="text-left p-1.5 font-medium w-16">Status</th>
                </tr>
              </thead>
              <tbody>
                {proposed.actions.map((a, i) => (
                  <tr key={i} className="border-t">
                    <td className="p-1.5">{a.action}</td>
                    <td className="p-1.5">{a.owner}</td>
                    <td className="p-1.5">{a.due_date || '—'}</td>
                    <td className="p-1.5">{a.status}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {proposed.risks?.length > 0 && (
        <div>
          <div className="text-xs font-medium text-muted-foreground">Risks</div>
          <ul className="list-disc list-inside text-xs mt-1 space-y-0.5">
            {proposed.risks.map((r, i) => <li key={i}>{r}</li>)}
          </ul>
        </div>
      )}

      {proposed.open_questions?.length > 0 && (
        <div>
          <div className="text-xs font-medium text-muted-foreground">Open Questions</div>
          <ul className="list-disc list-inside text-xs mt-1 space-y-0.5">
            {proposed.open_questions.map((q, i) => <li key={i}>{q}</li>)}
          </ul>
        </div>
      )}

      <Separator />

      <div className="flex gap-2">
        <Button size="sm" onClick={onApply} className="gap-1">
          <Check className="h-3.5 w-3.5" /> Apply to draft
        </Button>
        <Button size="sm" variant="outline" onClick={onDiscard} className="gap-1">
          <X className="h-3.5 w-3.5" /> Discard
        </Button>
      </div>
    </div>
  );
}

// ── Copilot Preview component ────────────────────────────────────────
function CopilotPreviewPanel({
  extracted,
  onApply,
  onDiscard,
}: {
  extracted: CopilotExtracted;
  onApply: () => void;
  onDiscard: () => void;
}) {
  const confidenceBadge = (level: string) => {
    const variant = level === 'high' ? 'default' : level === 'medium' ? 'secondary' : 'destructive';
    return <Badge variant={variant} className="text-[10px] ml-1">{level}</Badge>;
  };

  return (
    <div className="space-y-3 border rounded-lg p-4 bg-muted/30">
      <div className="flex items-center gap-2">
        <ClipboardPaste className="h-4 w-4 text-primary" />
        <span className="text-sm font-medium">Copilot Extract Preview</span>
        <Badge variant="outline" className="text-[10px]">Review required</Badge>
      </div>

      <Alert>
        <AlertTriangle className="h-4 w-4" />
        <AlertDescription className="text-xs">
          Imported from Teams Copilot. Review all sections for accuracy before applying.
        </AlertDescription>
      </Alert>

      {extracted.attendees.length > 0 && (
        <div>
          <div className="text-xs font-medium text-muted-foreground flex items-center">
            Attendees {confidenceBadge(extracted.confidence?.attendees || 'medium')}
          </div>
          <div className="text-xs mt-1">{extracted.attendees.join(', ')}</div>
        </div>
      )}

      {extracted.summary && (
        <div>
          <div className="text-xs font-medium text-muted-foreground flex items-center">
            Summary {confidenceBadge(extracted.confidence?.summary || 'medium')}
          </div>
          <div className="text-xs whitespace-pre-wrap bg-background p-2 rounded mt-1 border">
            {extracted.summary}
          </div>
        </div>
      )}

      {extracted.decisions.length > 0 && (
        <div>
          <div className="text-xs font-medium text-muted-foreground flex items-center">
            Decisions {confidenceBadge(extracted.confidence?.decisions || 'medium')}
          </div>
          <ul className="list-disc list-inside text-xs mt-1 space-y-0.5">
            {extracted.decisions.map((d, i) => <li key={i}>{d}</li>)}
          </ul>
        </div>
      )}

      {extracted.actions.length > 0 && (
        <div>
          <div className="text-xs font-medium text-muted-foreground flex items-center">
            Actions {confidenceBadge(extracted.confidence?.actions || 'medium')}
          </div>
          <div className="border rounded overflow-hidden mt-1">
            <table className="w-full text-xs">
              <thead className="bg-muted/50">
                <tr>
                  <th className="text-left p-1.5 font-medium">Action</th>
                  <th className="text-left p-1.5 font-medium w-20">Owner</th>
                  <th className="text-left p-1.5 font-medium w-20">Due</th>
                  <th className="text-left p-1.5 font-medium w-16">Status</th>
                </tr>
              </thead>
              <tbody>
                {extracted.actions.map((a, i) => (
                  <tr key={i} className="border-t">
                    <td className="p-1.5">{a.action}</td>
                    <td className="p-1.5">{a.owner}</td>
                    <td className="p-1.5">{a.due_date || '—'}</td>
                    <td className="p-1.5">{a.status}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <Separator />

      <div className="flex gap-2">
        <Button size="sm" onClick={onApply} className="gap-1">
          <Check className="h-3.5 w-3.5" /> Apply to draft
        </Button>
        <Button size="sm" variant="outline" onClick={onDiscard} className="gap-1">
          <X className="h-3.5 w-3.5" /> Discard
        </Button>
      </div>
    </div>
  );
}

// ── Main component ───────────────────────────────────────────────────

export function MeetingMinutesPanel({ meetingId, isVivacityTeam }: MeetingMinutesPanelProps) {
  const {
    minutes, isLoading, aiEnabled, aiRequireReview,
    saveDraft, isSaving, publishMinutes, isPublishing,
    generateFromTranscript, isGenerating,
    aiProposal, applyAiContent, discardAiContent, resetAiProposal,
    extractCopilot, isExtracting,
    copilotExtracted, copilotStoreRaw,
    applyCopilotContent, discardCopilotContent, resetCopilotExtraction,
  } = useTeamsMeetingMinutes(meetingId);

  const [isEditing, setIsEditing] = useState(false);
  const [editContent, setEditContent] = useState<MinutesContent | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [reviewConfirmed, setReviewConfirmed] = useState(false);
  const [showCopilotPanel, setShowCopilotPanel] = useState(false);
  const [copilotText, setCopilotText] = useState('');
  const copilotTextareaRef = useRef<HTMLTextAreaElement>(null);
  const copilotRawTextRef = useRef<string>('');

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
  const isAiDraft = content.ai_generated === true;
  const needsReviewGate = aiRequireReview && isAiDraft && !reviewConfirmed;

  const handleStartEdit = () => {
    setEditContent({ ...content });
    setEditTitle(minutes.title);
    setIsEditing(true);
  };

  const handleSave = () => {
    if (!editContent) return;
    saveDraft({ minutesId: minutes.id, content: editContent, title: editTitle || undefined });
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
    setEditContent({ ...editContent, actions: [...editContent.actions, { ...EMPTY_ACTION }] });
  };

  const removeAction = (idx: number) => {
    if (!editContent) return;
    setEditContent({ ...editContent, actions: editContent.actions.filter((_, i) => i !== idx) });
  };

  const updateAction = (idx: number, field: string, value: string) => {
    if (!editContent) return;
    const newActions = [...editContent.actions];
    newActions[idx] = { ...newActions[idx], [field]: value };
    setEditContent({ ...editContent, actions: newActions });
  };

  const hasMinimumFields = content.attendees?.length > 0 && (
    (content.decisions?.length > 0) || (content.actions?.length > 0) || (content.discussion_notes?.trim())
  );

  const handleApplyAi = () => {
    if (!aiProposal) return;
    applyAiContent(minutes.id, aiProposal, content);
    resetAiProposal();
  };

  const handleDiscardAi = () => {
    discardAiContent(minutes.id);
    resetAiProposal();
  };

  // ── Copilot handlers ───────────────────────────────────────────────
  const handleCopilotExtract = () => {
    if (!copilotText.trim()) return;
    copilotRawTextRef.current = copilotText;
    extractCopilot(copilotText);
  };

  const handleApplyCopilot = () => {
    if (!copilotExtracted) return;
    applyCopilotContent(
      minutes.id,
      copilotExtracted,
      content,
      copilotStoreRaw,
      copilotRawTextRef.current,
    );
    resetCopilotExtraction();
    setCopilotText('');
    setShowCopilotPanel(false);
  };

  const handleDiscardCopilot = () => {
    discardCopilotContent(minutes.id);
    resetCopilotExtraction();
  };

  const openCopilotPanel = () => {
    setShowCopilotPanel(true);
    setTimeout(() => copilotTextareaRef.current?.focus(), 100);
  };

  // ── Copilot extraction preview ─────────────────────────────────────
  if (copilotExtracted && isVivacityTeam) {
    return (
      <div className="space-y-4">
        <CopilotPreviewPanel
          extracted={copilotExtracted}
          onApply={handleApplyCopilot}
          onDiscard={handleDiscardCopilot}
        />
      </div>
    );
  }

  // ── AI proposal preview ────────────────────────────────────────────
  if (aiProposal && isVivacityTeam) {
    return (
      <div className="space-y-4">
        <AiPreviewPanel
          proposed={aiProposal}
          onApply={handleApplyAi}
          onDiscard={handleDiscardAi}
        />
      </div>
    );
  }

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

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">Meeting Type</Label>
              <Input value={editContent.meeting_type} onChange={(e) => updateField('meeting_type', e.target.value)} placeholder="e.g. Health Check, KickStart" />
            </div>
            <div>
              <Label className="text-xs">Duration (minutes)</Label>
              <Input type="number" value={editContent.duration_minutes || ''} onChange={(e) => updateField('duration_minutes', parseInt(e.target.value) || 0)} />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">Facilitator</Label>
              <Input value={editContent.facilitator} onChange={(e) => updateField('facilitator', e.target.value)} />
            </div>
            <div>
              <Label className="text-xs">Minute Taker</Label>
              <Input value={editContent.minute_taker} onChange={(e) => updateField('minute_taker', e.target.value)} />
            </div>
          </div>

          <div>
            <Label className="text-xs">Attendees (one per line)</Label>
            <Textarea rows={3} value={editContent.attendees.join('\n')} onChange={(e) => updateField('attendees', e.target.value.split('\n').filter(Boolean))} />
          </div>

          <div>
            <Label className="text-xs">Apologies (one per line)</Label>
            <Textarea rows={2} value={editContent.apologies.join('\n')} onChange={(e) => updateField('apologies', e.target.value.split('\n').filter(Boolean))} />
          </div>

          <div>
            <Label className="text-xs">Agenda Items (one per line)</Label>
            <Textarea rows={3} value={editContent.agenda_items.join('\n')} onChange={(e) => updateField('agenda_items', e.target.value.split('\n').filter(Boolean))} />
          </div>

          <div>
            <Label className="text-xs">Discussion Notes</Label>
            <Textarea rows={5} value={editContent.discussion_notes} onChange={(e) => updateField('discussion_notes', e.target.value)} />
          </div>

          <div>
            <Label className="text-xs">Decisions (one per line)</Label>
            <Textarea rows={3} value={editContent.decisions.join('\n')} onChange={(e) => updateField('decisions', e.target.value.split('\n').filter(Boolean))} />
          </div>

          <div>
            <div className="flex items-center justify-between mb-1">
              <Label className="text-xs">Action Items</Label>
              <Button size="sm" variant="ghost" onClick={addAction} className="h-6 px-2 text-xs gap-1">
                <Plus className="h-3 w-3" /> Add
              </Button>
            </div>
            {editContent.actions.map((action, idx) => (
              <div key={idx} className="flex gap-2 mb-2 items-start">
                <Input placeholder="Action" value={action.action} onChange={(e) => updateAction(idx, 'action', e.target.value)} className="flex-1" />
                <Input placeholder="Owner" value={action.owner} onChange={(e) => updateAction(idx, 'owner', e.target.value)} className="w-24" />
                <Input type="date" value={action.due_date} onChange={(e) => updateAction(idx, 'due_date', e.target.value)} className="w-32" />
                <Select value={action.status || 'Open'} onValueChange={(v) => updateAction(idx, 'status', v)}>
                  <SelectTrigger className="w-24 h-9"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Open">Open</SelectItem>
                    <SelectItem value="In Progress">In Progress</SelectItem>
                    <SelectItem value="Done">Done</SelectItem>
                  </SelectContent>
                </Select>
                <Button size="icon" variant="ghost" onClick={() => removeAction(idx)} className="h-9 w-9 shrink-0">
                  <Trash2 className="h-3.5 w-3.5 text-destructive" />
                </Button>
              </div>
            ))}
          </div>

          <div>
            <Label className="text-xs">Next Meeting</Label>
            <Input value={editContent.next_meeting} onChange={(e) => updateField('next_meeting', e.target.value)} placeholder="e.g. Tuesday 18 Feb 2026, 2:00pm" />
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
          {isAiDraft && (
            <Badge variant="outline" className="text-[10px] gap-1">
              <Sparkles className="h-3 w-3" /> AI draft
            </Badge>
          )}
          <span className="text-xs text-muted-foreground">v{minutes.version}</span>
        </div>
        <div className="text-xs text-muted-foreground">
          {format(new Date(minutes.updated_at), 'MMM d, HH:mm')}
        </div>
      </div>

      {isAiDraft && content.ai_notes && (
        <Alert>
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription className="text-xs">{content.ai_notes}</AlertDescription>
        </Alert>
      )}

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

        {(content.meeting_type || content.facilitator || content.minute_taker) && (
          <div className="grid grid-cols-2 gap-1 text-xs text-muted-foreground">
            {content.meeting_type && <div><span className="font-medium">Type:</span> {content.meeting_type}</div>}
            {content.facilitator && <div><span className="font-medium">Facilitator:</span> {content.facilitator}</div>}
            {content.minute_taker && <div><span className="font-medium">Minute Taker:</span> {content.minute_taker}</div>}
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
                    <th className="text-left p-1.5 font-medium w-20">Owner</th>
                    <th className="text-left p-1.5 font-medium w-20">Due</th>
                    <th className="text-left p-1.5 font-medium w-16">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {content.actions.map((a, i) => (
                    <tr key={i} className="border-t">
                      <td className="p-1.5">{a.action}</td>
                      <td className="p-1.5">{a.owner}</td>
                      <td className="p-1.5">{a.due_date}</td>
                      <td className="p-1.5">{a.status || 'Open'}</td>
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

          {/* AI review gate */}
          {needsReviewGate && !isPublished && (
            <div className="flex items-start gap-2 p-3 rounded border bg-muted/30">
              <Checkbox
                id="review-confirmed"
                checked={reviewConfirmed}
                onCheckedChange={(checked) => setReviewConfirmed(checked === true)}
              />
              <label htmlFor="review-confirmed" className="text-xs leading-tight cursor-pointer">
                I have reviewed and edited this AI-generated draft for accuracy before publishing.
              </label>
            </div>
          )}

          <div className="flex gap-2 flex-wrap">
            <Button size="sm" variant="outline" onClick={handleStartEdit}>
              Edit
            </Button>

            {/* Copilot paste shortcut */}
            {!isPublished && (
              <Button
                size="sm"
                variant="outline"
                className="gap-1"
                onClick={openCopilotPanel}
              >
                <ClipboardPaste className="h-4 w-4" />
                Paste Copilot minutes
              </Button>
            )}

            {/* AI generate button */}
            {aiEnabled && !isPublished && (
              <Button
                size="sm"
                variant="outline"
                className="gap-1"
                disabled={isGenerating}
                onClick={() => generateFromTranscript(minutes.id)}
              >
                {isGenerating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                Draft from transcript
              </Button>
            )}
            {!aiEnabled && isVivacityTeam && !isPublished && (
              <Button size="sm" variant="ghost" disabled className="gap-1 text-muted-foreground text-xs">
                <Sparkles className="h-3.5 w-3.5" /> AI disabled
              </Button>
            )}

            {!isPublished && (
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button size="sm" className="gap-2" disabled={isPublishing || !hasMinimumFields || needsReviewGate}>
                    {isPublishing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                    Publish Minutes
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Publish Meeting Minutes?</AlertDialogTitle>
                    <AlertDialogDescription>
                      This will generate a Vivacity-branded document and make it available in the client portal.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction onClick={() => publishMinutes(minutes.id)}>Publish</AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            )}

            {isPublished && (
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button size="sm" variant="outline" className="gap-2" disabled={isPublishing || !hasMinimumFields}>
                    {isPublishing ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                    Regenerate (v{(minutes.version || 1) + 1})
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Regenerate Minutes?</AlertDialogTitle>
                    <AlertDialogDescription>
                      This will create a new version (v{(minutes.version || 1) + 1}) and update the document in the client portal.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction onClick={() => publishMinutes(minutes.id)}>Regenerate</AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            )}

            {isPublished && minutes.pdf_storage_path && (
              <Button size="sm" variant="outline" className="gap-2">
                <Download className="h-4 w-4" />
                Download
              </Button>
            )}
          </div>

          {/* Copilot import panel */}
          {showCopilotPanel && !isPublished && (
            <>
              <Separator />
              <div className="space-y-3 border rounded-lg p-4 bg-muted/30">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <ClipboardPaste className="h-4 w-4 text-primary" />
                    <span className="text-sm font-medium">Import from Teams Copilot</span>
                  </div>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => { setShowCopilotPanel(false); setCopilotText(''); }}
                    className="h-6 w-6 p-0"
                  >
                    <X className="h-3.5 w-3.5" />
                  </Button>
                </div>
                <Textarea
                  ref={copilotTextareaRef}
                  placeholder="Paste Copilot meeting notes here..."
                  rows={8}
                  value={copilotText}
                  onChange={(e) => setCopilotText(e.target.value)}
                />
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    onClick={handleCopilotExtract}
                    disabled={isExtracting || !copilotText.trim()}
                    className="gap-1"
                  >
                    {isExtracting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
                    Extract
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => { setShowCopilotPanel(false); setCopilotText(''); }}
                  >
                    Cancel
                  </Button>
                </div>
              </div>
            </>
          )}
        </>
      )}

      {/* Client view: just show download if published */}
      {!isVivacityTeam && isPublished && minutes.pdf_storage_path && (
        <>
          <Separator />
          <Button size="sm" variant="outline" className="gap-2">
            <Download className="h-4 w-4" />
            Download Minutes
          </Button>
        </>
      )}
    </div>
  );
}
