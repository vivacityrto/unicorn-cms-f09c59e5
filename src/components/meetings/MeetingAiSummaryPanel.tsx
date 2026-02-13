import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { 
  Sparkles, AlertTriangle, Check, Loader2, 
  ChevronDown, ChevronUp, Edit3, Save 
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Checkbox } from '@/components/ui/checkbox';
import { useAuth } from '@/hooks/useAuth';
import { toast } from 'sonner';

interface MeetingAiSummaryPanelProps {
  meetingId: string;
  tenantId: number;
}

interface MeetingSummary {
  meeting_summary_id: string;
  tenant_id: number;
  meeting_id: string;
  created_by_user_id: string;
  source: string;
  summary_text: string;
  decisions: Array<{ text: string }>;
  action_items: Array<{ description: string; assignee?: string }>;
  risks_raised: Array<{ text: string }>;
  confidence: number | null;
  ai_event_id: string | null;
  created_at: string;
}

export function MeetingAiSummaryPanel({ meetingId, tenantId }: MeetingAiSummaryPanelProps) {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const [transcriptText, setTranscriptText] = useState('');
  const [sourceType, setSourceType] = useState<'transcript' | 'notes'>('transcript');
  const [isEditing, setIsEditing] = useState(false);
  const [editedSummary, setEditedSummary] = useState('');
  const [editedDecisions, setEditedDecisions] = useState('');
  const [editedRisks, setEditedRisks] = useState('');
  const [selectedActionItems, setSelectedActionItems] = useState<Set<number>>(new Set());
  const [showInput, setShowInput] = useState(false);

  // Fetch existing summary
  const { data: existingSummary, isLoading } = useQuery({
    queryKey: ['meeting-ai-summary', meetingId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('meeting_summaries')
        .select('*')
        .eq('meeting_id', meetingId)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (error) throw error;
      return data as MeetingSummary | null;
    },
  });

  // Generate summary mutation
  const generateMutation = useMutation({
    mutationFn: async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) throw new Error('Not authenticated');

      const response = await supabase.functions.invoke('generate-meeting-summary', {
        headers: { Authorization: `Bearer ${session.access_token}` },
        body: {
          meeting_id: meetingId,
          tenant_id: tenantId,
          source: sourceType,
          text: transcriptText.trim(),
        },
      });

      if (response.error) throw response.error;
      return response.data;
    },
    onSuccess: () => {
      toast.success('Summary generated');
      setTranscriptText('');
      setShowInput(false);
      queryClient.invalidateQueries({ queryKey: ['meeting-ai-summary', meetingId] });
    },
    onError: (error) => {
      console.error('Summary generation failed:', error);
      toast.error('Failed to generate summary');
    },
  });

  // Save approved summary mutation
  const approveMutation = useMutation({
    mutationFn: async () => {
      if (!existingSummary) throw new Error('No summary to approve');

      const updates: Record<string, unknown> = {};
      if (isEditing) {
        updates.summary_text = editedSummary;
        updates.decisions = editedDecisions
          .split('\n')
          .filter(d => d.trim())
          .map(d => ({ text: d.trim() }));
        updates.risks_raised = editedRisks
          .split('\n')
          .filter(r => r.trim())
          .map(r => ({ text: r.trim() }));
      }

      const { error } = await supabase
        .from('meeting_summaries')
        .update(updates)
        .eq('meeting_summary_id', existingSummary.meeting_summary_id);

      if (error) throw error;

      // Create action items from selected items if any
      if (selectedActionItems.size > 0 && existingSummary.action_items) {
        const { data: { session } } = await supabase.auth.getSession();
        for (const idx of selectedActionItems) {
          const item = existingSummary.action_items[idx];
          if (item) {
            await supabase.from('meeting_action_items').insert({
              meeting_id: meetingId,
              description: item.description,
              assigned_to: item.assignee || null,
              created_by: user?.id,
            });
          }
        }
      }
    },
    onSuccess: () => {
      toast.success('Summary approved and saved');
      setIsEditing(false);
      queryClient.invalidateQueries({ queryKey: ['meeting-ai-summary', meetingId] });
      queryClient.invalidateQueries({ queryKey: ['meeting-action-items', meetingId] });
    },
    onError: (error) => {
      console.error('Save failed:', error);
      toast.error('Failed to save summary');
    },
  });

  const handleStartEdit = () => {
    if (!existingSummary) return;
    setEditedSummary(existingSummary.summary_text);
    setEditedDecisions(
      (existingSummary.decisions || []).map((d: any) => d.text || d).join('\n')
    );
    setEditedRisks(
      (existingSummary.risks_raised || []).map((r: any) => r.text || r).join('\n')
    );
    setIsEditing(true);
  };

  const toggleActionItem = (idx: number) => {
    setSelectedActionItems(prev => {
      const next = new Set(prev);
      if (next.has(idx)) next.delete(idx);
      else next.add(idx);
      return next;
    });
  };

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground p-4">
        <Loader2 className="h-4 w-4 animate-spin" />
        Loading AI summary...
      </div>
    );
  }

  // No summary yet — show generate UI
  if (!existingSummary) {
    return (
      <div className="space-y-4 p-1">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-primary" />
            <span className="font-medium text-sm">AI Summary</span>
          </div>
          {!showInput && (
            <Button
              size="sm"
              variant="outline"
              onClick={() => setShowInput(true)}
              className="gap-2"
            >
              <Sparkles className="h-3 w-3" />
              Generate summary
            </Button>
          )}
        </div>

        {showInput && (
          <div className="space-y-3">
            <div className="flex gap-2">
              <Button
                size="sm"
                variant={sourceType === 'transcript' ? 'default' : 'outline'}
                onClick={() => setSourceType('transcript')}
              >
                Transcript
              </Button>
              <Button
                size="sm"
                variant={sourceType === 'notes' ? 'default' : 'outline'}
                onClick={() => setSourceType('notes')}
              >
                Notes
              </Button>
            </div>

            <Textarea
              placeholder={
                sourceType === 'transcript'
                  ? 'Paste Teams transcript here...'
                  : 'Enter meeting notes...'
              }
              value={transcriptText}
              onChange={(e) => setTranscriptText(e.target.value)}
              rows={8}
              className="text-sm"
            />

            <div className="flex gap-2">
              <Button
                size="sm"
                onClick={() => generateMutation.mutate()}
                disabled={!transcriptText.trim() || generateMutation.isPending}
                className="gap-2"
              >
                {generateMutation.isPending ? (
                  <Loader2 className="h-3 w-3 animate-spin" />
                ) : (
                  <Sparkles className="h-3 w-3" />
                )}
                Generate
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => { setShowInput(false); setTranscriptText(''); }}
              >
                Cancel
              </Button>
            </div>
          </div>
        )}

        {!showInput && (
          <p className="text-xs text-muted-foreground">
            No AI summary yet. Generate one from a transcript or notes.
          </p>
        )}
      </div>
    );
  }

  // Summary exists — show it
  return (
    <div className="space-y-4 p-1">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-primary" />
          <span className="font-medium text-sm">AI Summary</span>
          <Badge variant="secondary" className="text-[10px]">
            {existingSummary.source}
          </Badge>
        </div>
        <div className="flex gap-1">
          {!isEditing && (
            <Button size="sm" variant="ghost" onClick={handleStartEdit}>
              <Edit3 className="h-3 w-3" />
            </Button>
          )}
        </div>
      </div>

      {/* AI Draft Warning */}
      <Alert className="border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/30">
        <AlertTriangle className="h-4 w-4 text-amber-600" />
        <AlertDescription className="text-xs text-amber-800 dark:text-amber-200">
          AI draft — needs human approval before sharing.
        </AlertDescription>
      </Alert>

      {/* Summary text */}
      <div>
        <h4 className="text-xs font-medium text-muted-foreground mb-1">Summary</h4>
        {isEditing ? (
          <Textarea
            value={editedSummary}
            onChange={(e) => setEditedSummary(e.target.value)}
            rows={5}
            className="text-sm"
          />
        ) : (
          <p className="text-sm whitespace-pre-wrap">{existingSummary.summary_text}</p>
        )}
      </div>

      <Separator />

      {/* Decisions */}
      <div>
        <h4 className="text-xs font-medium text-muted-foreground mb-1">Key Decisions</h4>
        {isEditing ? (
          <Textarea
            value={editedDecisions}
            onChange={(e) => setEditedDecisions(e.target.value)}
            rows={3}
            placeholder="One decision per line"
            className="text-sm"
          />
        ) : (
          <ul className="text-sm space-y-1">
            {(existingSummary.decisions || []).length === 0 && (
              <li className="text-muted-foreground text-xs">None identified</li>
            )}
            {(existingSummary.decisions || []).map((d: any, i: number) => (
              <li key={i} className="flex gap-2">
                <span className="text-muted-foreground">•</span>
                <span>{d.text || d}</span>
              </li>
            ))}
          </ul>
        )}
      </div>

      <Separator />

      {/* Action Items with selection checkboxes */}
      <div>
        <h4 className="text-xs font-medium text-muted-foreground mb-1">
          Action Items
          {(existingSummary.action_items || []).length > 0 && (
            <span className="ml-1 text-muted-foreground">
              (select to create as tasks)
            </span>
          )}
        </h4>
        <div className="space-y-2">
          {(existingSummary.action_items || []).length === 0 && (
            <p className="text-muted-foreground text-xs">None identified</p>
          )}
          {(existingSummary.action_items || []).map((item: any, i: number) => (
            <div key={i} className="flex items-start gap-2">
              <Checkbox
                checked={selectedActionItems.has(i)}
                onCheckedChange={() => toggleActionItem(i)}
              />
              <div className="text-sm">
                <span>{item.description}</span>
                {item.assignee && (
                  <span className="text-muted-foreground ml-1">
                    → {item.assignee}
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      <Separator />

      {/* Risks */}
      <div>
        <h4 className="text-xs font-medium text-muted-foreground mb-1">Risks Raised</h4>
        {isEditing ? (
          <Textarea
            value={editedRisks}
            onChange={(e) => setEditedRisks(e.target.value)}
            rows={2}
            placeholder="One risk per line"
            className="text-sm"
          />
        ) : (
          <ul className="text-sm space-y-1">
            {(existingSummary.risks_raised || []).length === 0 && (
              <li className="text-muted-foreground text-xs">None identified</li>
            )}
            {(existingSummary.risks_raised || []).map((r: any, i: number) => (
              <li key={i} className="flex gap-2">
                <AlertTriangle className="h-3 w-3 text-amber-500 mt-0.5 shrink-0" />
                <span>{r.text || r}</span>
              </li>
            ))}
          </ul>
        )}
      </div>

      <Separator />

      {/* Approve / Save button */}
      <div className="flex gap-2">
        <Button
          size="sm"
          onClick={() => approveMutation.mutate()}
          disabled={approveMutation.isPending}
          className="gap-2"
        >
          {approveMutation.isPending ? (
            <Loader2 className="h-3 w-3 animate-spin" />
          ) : (
            <Check className="h-3 w-3" />
          )}
          {isEditing ? 'Save approved summary' : 'Approve summary'}
          {selectedActionItems.size > 0 && ` (+ ${selectedActionItems.size} tasks)`}
        </Button>
        {isEditing && (
          <Button size="sm" variant="ghost" onClick={() => setIsEditing(false)}>
            Cancel
          </Button>
        )}
      </div>

      {/* Re-generate option */}
      <Button
        size="sm"
        variant="link"
        className="text-xs p-0 h-auto"
        onClick={() => setShowInput(true)}
      >
        Re-generate from new input
      </Button>

      {showInput && (
        <div className="space-y-3 border rounded-md p-3">
          <div className="flex gap-2">
            <Button
              size="sm"
              variant={sourceType === 'transcript' ? 'default' : 'outline'}
              onClick={() => setSourceType('transcript')}
            >
              Transcript
            </Button>
            <Button
              size="sm"
              variant={sourceType === 'notes' ? 'default' : 'outline'}
              onClick={() => setSourceType('notes')}
            >
              Notes
            </Button>
          </div>
          <Textarea
            placeholder={
              sourceType === 'transcript'
                ? 'Paste Teams transcript here...'
                : 'Enter meeting notes...'
            }
            value={transcriptText}
            onChange={(e) => setTranscriptText(e.target.value)}
            rows={6}
            className="text-sm"
          />
          <div className="flex gap-2">
            <Button
              size="sm"
              onClick={() => generateMutation.mutate()}
              disabled={!transcriptText.trim() || generateMutation.isPending}
              className="gap-2"
            >
              {generateMutation.isPending ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : (
                <Sparkles className="h-3 w-3" />
              )}
              Re-generate
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => { setShowInput(false); setTranscriptText(''); }}
            >
              Cancel
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
