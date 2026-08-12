import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Send, Pencil, Check, X } from 'lucide-react';
import { format } from 'date-fns';
import { toast } from 'sonner';

interface Version {
  id: string;
  version_number: number;
  display_version: string | null;
  status: string;
  file_name: string;
  checksum_sha256: string | null;
  notes: string | null;
  created_at: string;
  published_at: string | null;
}

interface GovernanceVersionHistoryProps {
  versions: Version[] | null | undefined;
  onPublish: (versionId: string) => void;
  onNotesSaved?: () => void;
}

function getStatusBadge(status: string) {
  switch (status) {
    case 'published':
      return <Badge variant="default" className="bg-emerald-600">Published</Badge>;
    case 'draft':
      return <Badge variant="secondary">Draft</Badge>;
    case 'archived':
      return <Badge variant="outline">Archived</Badge>;
    default:
      return <Badge variant="outline">{status}</Badge>;
  }
}

export function GovernanceVersionHistory({ versions, onPublish, onNotesSaved }: GovernanceVersionHistoryProps) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draftNotes, setDraftNotes] = useState('');
  const [saving, setSaving] = useState(false);

  const startEdit = (v: Version) => {
    setEditingId(v.id);
    setDraftNotes(v.notes || '');
  };

  const cancelEdit = () => {
    setEditingId(null);
    setDraftNotes('');
  };

  const saveNotes = async (versionId: string) => {
    setSaving(true);
    try {
      const { error } = await supabase
        .from('document_versions')
        .update({ notes: draftNotes || null })
        .eq('id', versionId);
      if (error) throw error;
      toast.success('Notes saved');
      setEditingId(null);
      onNotesSaved?.();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Failed to save notes');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm font-medium">Version History</CardTitle>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Version</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>File</TableHead>
              <TableHead>Notes</TableHead>
              <TableHead>Checksum</TableHead>
              <TableHead>Created</TableHead>
              <TableHead>Published</TableHead>
              <TableHead></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {!versions?.length ? (
              <TableRow>
                <TableCell colSpan={8} className="text-center py-4 text-muted-foreground">
                  No versions yet
                </TableCell>
              </TableRow>
            ) : (
              versions.map((v) => (
                <TableRow key={v.id}>
                  <TableCell className="font-mono">{v.display_version || `v${v.version_number}`}</TableCell>
                  <TableCell>{getStatusBadge(v.status)}</TableCell>
                  <TableCell className="text-sm">{v.file_name}</TableCell>
                  <TableCell className="max-w-[220px]">
                    {editingId === v.id ? (
                      <div className="flex items-center gap-1">
                        <Input
                          value={draftNotes}
                          onChange={(e) => setDraftNotes(e.target.value)}
                          className="h-7 text-xs"
                          placeholder="Add a note…"
                          autoFocus
                        />
                        <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => saveNotes(v.id)} disabled={saving}>
                          <Check className="h-3.5 w-3.5" />
                        </Button>
                        <Button size="icon" variant="ghost" className="h-7 w-7" onClick={cancelEdit} disabled={saving}>
                          <X className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={() => startEdit(v)}
                        className="group flex items-center gap-1.5 text-left text-xs text-muted-foreground hover:text-foreground w-full"
                      >
                        <span className="truncate">{v.notes || 'Add a note…'}</span>
                        <Pencil className="h-3 w-3 opacity-0 group-hover:opacity-100 flex-shrink-0" />
                      </button>
                    )}
                  </TableCell>
                  <TableCell>
                    {v.checksum_sha256 ? (
                      <span className="text-xs font-mono text-muted-foreground" title={v.checksum_sha256}>
                        {v.checksum_sha256.slice(0, 12)}…
                      </span>
                    ) : '—'}
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {format(new Date(v.created_at), 'dd MMM yyyy')}
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {v.published_at ? format(new Date(v.published_at), 'dd MMM yyyy') : '—'}
                  </TableCell>
                  <TableCell>
                    {v.status === 'draft' && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => onPublish(v.id)}
                      >
                        <Send className="h-3 w-3 mr-1" /> Publish
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
