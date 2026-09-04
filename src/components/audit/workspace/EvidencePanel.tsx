/**
 * EvidencePanel
 *
 * Wave 4 #1 — AI-suggested ratings from uploaded evidence.
 *
 * Renders inside QuestionCard for auditor_assessment context. Lets the
 * auditor (1) link tenant documents as evidence for this question,
 * (2) trigger the analyse-evidence edge function, and (3) accept,
 * override, or discard the AI suggestion.
 *
 * Loading copy: "This typically takes up to a minute" (per approved
 * amendment — TAS docs over 100 pages can land at 50+ seconds).
 */
import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Bot, FileText, Loader2, Paperclip, Plus, Trash2, X } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';

interface EvidencePanelProps {
  auditId: string;
  responseId: string | undefined;
  /** Tenant id of the audit's subject (bigint). Used to filter selectable documents. */
  subjectTenantId: number | null;
  /** Current saved rating, used so Accept doesn't blow away an explicit rating without warning. */
  currentRating: string | null | undefined;
  /** AI suggestion fields hydrated from client_audit_responses. */
  aiSuggestion: {
    rating: string | null;
    notes: string | null;
    confidence: number | null;
    analyzedAt: string | null;
    excerpts: { quote: string; source: string; verified_against?: string }[] | null;
    gaps: string[] | null;
  };
  /** Apply the accepted rating/notes through the existing rate + note handlers. */
  onAcceptRating: (rating: string, notes: string) => void;
  /** Persist override (auditor edited the suggestion before accepting). */
  onOverrideRating: (rating: string, notes: string) => void;
  /** Wipe the suggestion fields back to null. */
  onDiscardSuggestion: () => void;
}

interface LinkedDoc {
  id: string;
  document_id: number;
  document_title: string | null;
}

function formatAuDate(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
}

export function EvidencePanel(props: EvidencePanelProps) {
  const { auditId, responseId, subjectTenantId, currentRating, aiSuggestion } = props;
  const qc = useQueryClient();
  const [linkerOpen, setLinkerOpen] = useState(false);
  const [analysing, setAnalysing] = useState(false);
  const [editing, setEditing] = useState(false);
  const [editedRating, setEditedRating] = useState<string>('');
  const [editedNotes, setEditedNotes] = useState<string>('');

  // ── Linked docs ──────────────────────────────────────────────────
  const linkedQuery = useQuery({
    queryKey: ['response-evidence', responseId],
    enabled: !!responseId,
    queryFn: async () => {
      const { data: linkRows, error: linkErr } = await supabase
        .from('client_audit_response_documents')
        .select('id, document_id')
        .eq('response_id', responseId!);
      if (linkErr) throw linkErr;
      if (!linkRows || linkRows.length === 0) return [] as LinkedDoc[];
      const ids = linkRows.map((r) => r.document_id);
      const { data: docs, error: docsErr } = await supabase
        .from('documents')
        .select('id, title')
        .in('id', ids);
      if (docsErr) throw docsErr;
      const titleById = new Map<number, string>((docs ?? []).map((d) => [d.id, d.title]));
      return linkRows.map((l) => ({
        id: l.id,
        document_id: l.document_id,
        document_title: titleById.get(l.document_id) ?? null,
      })) as LinkedDoc[];
    },
  });

  const linked = linkedQuery.data ?? [];

  // ── Unlink ───────────────────────────────────────────────────────
  const unlinkMutation = useMutation({
    mutationFn: async (linkId: string) => {
      const { error } = await supabase
        .from('client_audit_response_documents')
        .delete()
        .eq('id', linkId);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['response-evidence', responseId] });
    },
    onError: (e) => toast.error(e?.message || 'Failed to unlink document'),
  });

  // ── Trigger AI analysis ─────────────────────────────────────────
  const runAnalysis = async () => {
    if (!responseId) return;
    if (linked.length === 0) {
      toast.error('Link at least one evidence document first.');
      return;
    }
    setAnalysing(true);
    try {
      const { data, error } = await supabase.functions.invoke('analyse-evidence', {
        body: { audit_id: auditId, response_id: responseId },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      toast.success(`Analysis complete (${data?.documents_analysed ?? 0} document${data?.documents_analysed === 1 ? '' : 's'}).`);
      qc.invalidateQueries({ queryKey: ['audit-responses', auditId] });
      qc.invalidateQueries({ queryKey: ['audit-workspace', auditId] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Analysis failed.');
    } finally {
      setAnalysing(false);
    }
  };

  const hasSuggestion = !!aiSuggestion.rating;

  useEffect(() => {
    if (hasSuggestion && !editing) {
      setEditedRating(aiSuggestion.rating || '');
      setEditedNotes(aiSuggestion.notes || '');
    }
  }, [hasSuggestion, aiSuggestion.rating, aiSuggestion.notes, editing]);

  const handleAccept = () => {
    if (!aiSuggestion.rating || !aiSuggestion.notes) return;
    if (currentRating && currentRating !== aiSuggestion.rating) {
      if (!window.confirm(`This will replace your current rating "${currentRating}" with "${aiSuggestion.rating}". Continue?`)) return;
    }
    props.onAcceptRating(aiSuggestion.rating, aiSuggestion.notes);
    toast.success('Suggestion accepted.');
  };

  const handleOverrideSave = () => {
    if (!editedRating) {
      toast.error('Choose a rating.');
      return;
    }
    props.onOverrideRating(editedRating, editedNotes);
    setEditing(false);
    toast.success('Override saved.');
  };

  const handleDiscard = () => {
    if (!window.confirm('Discard this AI suggestion? You can re-run analysis later.')) return;
    props.onDiscardSuggestion();
  };

  const confidencePct = aiSuggestion.confidence != null ? Math.round(aiSuggestion.confidence * 100) : null;

  return (
    <div className="space-y-2 rounded-md border border-accent/30 bg-accent/10 p-3">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 text-xs font-medium text-primary">
          <Paperclip className="h-3.5 w-3.5" />
          Evidence ({linked.length})
        </div>
        <div className="flex items-center gap-1.5">
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-7 text-xs"
            disabled={!responseId}
            onClick={() => setLinkerOpen(true)}
          >
            <Plus className="h-3 w-3 mr-1" />
            Link evidence
          </Button>
          <Button
            type="button"
            variant="default"
            size="sm"
            className="h-7 text-xs bg-cyan-600 hover:bg-cyan-700"
            disabled={!responseId || linked.length === 0 || analysing}
            onClick={runAnalysis}
          >
            {analysing ? (
              <>
                <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                Analysing…
              </>
            ) : (
              <>
                <Bot className="h-3 w-3 mr-1" />
                {hasSuggestion ? 'Re-analyse' : 'Analyse with AI'}
              </>
            )}
          </Button>
        </div>
      </div>

      {/* Linked docs */}
      {linkedQuery.isLoading ? (
        <div className="text-[11px] text-muted-foreground">Loading evidence…</div>
      ) : linked.length === 0 ? (
        <div className="text-[11px] text-muted-foreground italic">
          No evidence linked. Link one or more documents from this client's library, then analyse.
        </div>
      ) : (
        <ul className="space-y-1">
          {linked.map((l) => (
            <li key={l.id} className="flex items-center justify-between gap-2 rounded bg-card border border-accent/30 px-2 py-1 text-xs">
              <div className="flex items-center gap-1.5 min-w-0">
                <FileText className="h-3 w-3 text-primary flex-shrink-0" />
                <span className="truncate" title={l.document_title || ''}>{l.document_title || `Document #${l.document_id}`}</span>
              </div>
              <button
                type="button"
                className="text-muted-foreground hover:text-destructive"
                onClick={() => unlinkMutation.mutate(l.id)}
                title="Unlink"
              >
                <X className="h-3 w-3" />
              </button>
            </li>
          ))}
        </ul>
      )}

      {/* Loading state — explicit copy per approved amendment */}
      {analysing && (
        <div className="rounded-md border border-accent/30 bg-accent/10 p-3 text-xs text-foreground">
          <div className="flex items-center gap-2">
            <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" />
            <span className="font-medium">Analysing evidence…</span>
          </div>
          <p className="mt-1 text-muted-foreground">
            This typically takes up to a minute. Long documents and corpus retrieval can stretch toward 60 seconds.
          </p>
        </div>
      )}

      {/* AI suggestion display */}
      {hasSuggestion && !analysing && (
        <div className="rounded-md border border-accent/30 bg-accent/10 p-3 text-xs space-y-2">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-1.5 text-foreground font-medium">
              <Bot className="h-3.5 w-3.5" />
              AI suggestion
              {confidencePct != null && (
                <Badge variant="outline" className="text-[10px] h-5">
                  {confidencePct}% confidence
                </Badge>
              )}
              {aiSuggestion.analyzedAt && (
                <span className="text-[10px] text-muted-foreground">
                  · {formatAuDate(aiSuggestion.analyzedAt)}
                </span>
              )}
            </div>
            <button
              type="button"
              onClick={handleDiscard}
              className="text-muted-foreground hover:text-destructive"
              title="Discard suggestion"
            >
              <Trash2 className="h-3 w-3" />
            </button>
          </div>

          {!editing ? (
            <>
              <div className="text-[11px]">
                <span className="text-muted-foreground">Suggested rating: </span>
                <span className="font-medium">{aiSuggestion.rating}</span>
              </div>
              {aiSuggestion.notes && (
                <p className="text-foreground whitespace-pre-wrap">{aiSuggestion.notes}</p>
              )}
              {aiSuggestion.excerpts && aiSuggestion.excerpts.length > 0 && (
                <div className="space-y-1">
                  <div className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">
                    Verified excerpts
                  </div>
                  <ul className="space-y-1">
                    {aiSuggestion.excerpts.map((ex, i) => (
                      <li key={i} className="rounded bg-accent/10 border-l-2 border-primary/40 px-2 py-1">
                        <div className="italic">"{ex.quote}"</div>
                        <div className="text-[10px] text-muted-foreground mt-0.5">— {ex.source}</div>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {aiSuggestion.gaps && aiSuggestion.gaps.length > 0 && (
                <div className="space-y-1">
                  <div className="text-[10px] font-medium text-amber-800 dark:text-amber-400 uppercase tracking-wide">
                    Gaps identified
                  </div>
                  <ul className="list-disc pl-4 text-amber-900 dark:text-amber-300">
                    {aiSuggestion.gaps.map((g, i) => <li key={i}>{g}</li>)}
                  </ul>
                </div>
              )}
              <div className="flex flex-wrap gap-1.5 pt-1">
                <Button type="button" size="sm" className="h-7 text-xs bg-cyan-600 hover:bg-cyan-700" onClick={handleAccept}>
                  Accept
                </Button>
                <Button type="button" size="sm" variant="outline" className="h-7 text-xs" onClick={() => setEditing(true)}>
                  Override
                </Button>
                <Button type="button" size="sm" variant="ghost" className="h-7 text-xs text-muted-foreground" onClick={handleDiscard}>
                  Discard
                </Button>
              </div>
            </>
          ) : (
            <div className="space-y-2">
              <div>
                <label className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">Rating</label>
                <select
                  value={editedRating}
                  onChange={(e) => setEditedRating(e.target.value)}
                  className="mt-1 w-full rounded border border-input bg-background px-2 py-1 text-xs"
                >
                  <option value="">Choose…</option>
                  <option value="compliant">Compliant</option>
                  <option value="at_risk">At Risk</option>
                  <option value="non_compliant">Non-Compliant</option>
                  <option value="na">N/A</option>
                </select>
              </div>
              <div>
                <label className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">Notes</label>
                <textarea
                  value={editedNotes}
                  onChange={(e) => setEditedNotes(e.target.value)}
                  rows={4}
                  className="mt-1 w-full rounded border border-input bg-background px-2 py-1 text-xs"
                />
              </div>
              <div className="flex gap-1.5">
                <Button type="button" size="sm" className="h-7 text-xs bg-cyan-600 hover:bg-cyan-700" onClick={handleOverrideSave}>
                  Save override
                </Button>
                <Button type="button" size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setEditing(false)}>
                  Cancel
                </Button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Linker dialog */}
      {linkerOpen && responseId && (
        <DocumentLinkerDialog
          open={linkerOpen}
          onOpenChange={setLinkerOpen}
          responseId={responseId}
          subjectTenantId={subjectTenantId}
          alreadyLinkedIds={new Set(linked.map((l) => l.document_id))}
          onLinked={() => {
            qc.invalidateQueries({ queryKey: ['response-evidence', responseId] });
          }}
        />
      )}
    </div>
  );
}

// ─── Document linker dialog ─────────────────────────────────────────
interface DocumentLinkerDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  responseId: string;
  subjectTenantId: number | null;
  alreadyLinkedIds: Set<number>;
  onLinked: () => void;
}

function DocumentLinkerDialog(props: DocumentLinkerDialogProps) {
  const { open, onOpenChange, responseId, subjectTenantId, alreadyLinkedIds, onLinked } = props;
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [saving, setSaving] = useState(false);

  const docsQuery = useQuery({
    queryKey: ['linker-tenant-documents', subjectTenantId, search],
    enabled: open && subjectTenantId != null,
    queryFn: async () => {
      let q = supabase
        .from('documents')
        .select('id, title, document_category, file_names')
        .eq('tenant_id', subjectTenantId!)
        .not('uploaded_files', 'is', null)
        .order('updated_at', { ascending: false })
        .limit(100);
      if (search.trim().length > 0) {
        q = q.ilike('title', `%${search.trim()}%`);
      }
      const { data, error } = await q;
      if (error) throw error;
      return data ?? [];
    },
  });

  const handleSave = async () => {
    if (selected.size === 0) {
      onOpenChange(false);
      return;
    }
    setSaving(true);
    try {
      const { data: userRes } = await supabase.auth.getUser();
      const userId = userRes?.user?.id;
      if (!userId) throw new Error('Not authenticated');
      const rows = Array.from(selected).map((document_id) => ({
        response_id: responseId,
        document_id,
        linked_by: userId,
      }));
      const { error } = await supabase
        .from('client_audit_response_documents')
        .insert(rows);
      if (error) throw error;
      toast.success(`Linked ${rows.length} document${rows.length === 1 ? '' : 's'}.`);
      setSelected(new Set());
      onLinked();
      onOpenChange(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to link documents.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Link evidence documents</DialogTitle>
          <DialogDescription>
            Choose tenant documents to link as evidence for this audit question. Only documents from this client's library are shown.
          </DialogDescription>
        </DialogHeader>

        {subjectTenantId == null && (
          <div className="text-xs text-amber-800 dark:text-amber-300 bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 rounded p-2">
            This audit has no subject tenant — cannot list documents.
          </div>
        )}

        <Input
          placeholder="Search documents by title…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="text-sm"
        />

        <ScrollArea className="h-72 rounded border">
          {docsQuery.isLoading ? (
            <div className="p-3 text-xs text-muted-foreground">Loading…</div>
          ) : (docsQuery.data ?? []).length === 0 ? (
            <div className="p-3 text-xs text-muted-foreground italic">
              No documents found for this client.
            </div>
          ) : (
            <ul className="divide-y">
              {(docsQuery.data ?? []).map((d) => {
                const already = alreadyLinkedIds.has(d.id);
                const isSelected = selected.has(d.id);
                return (
                  <li key={d.id} className="flex items-start gap-2 p-2 text-xs hover:bg-muted/50">
                    <Checkbox
                      checked={isSelected}
                      disabled={already}
                      onCheckedChange={(checked) => {
                        const next = new Set(selected);
                        if (checked) next.add(d.id); else next.delete(d.id);
                        setSelected(next);
                      }}
                      className="mt-0.5"
                    />
                    <div className="flex-1 min-w-0">
                      <div className="font-medium truncate">{d.title || `Document #${d.id}`}</div>
                      <div className="text-[10px] text-muted-foreground">
                        {d.document_category || 'Uncategorised'}
                        {already && <span className="ml-2 text-primary">· already linked</span>}
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </ScrollArea>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button
            onClick={handleSave}
            disabled={saving || selected.size === 0}
            className="bg-cyan-600 hover:bg-cyan-700"
          >
            {saving ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : null}
            Link {selected.size > 0 ? `(${selected.size})` : ''}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
