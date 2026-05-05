import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { useSuggestItem, useUpdateSuggestItem } from '@/hooks/useSuggestItems';
import {
  useSuggestAttachments,
  useUploadSuggestAttachment,
  getAttachmentSignedUrl,
} from '@/hooks/useSuggestAttachments';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Loader2, ArrowLeft, Upload, FileText, Image as ImageIcon } from 'lucide-react';
import { format } from 'date-fns';
import { toast } from '@/hooks/use-toast';

const STATUS_VARIANT: Record<string, 'default' | 'secondary' | 'destructive' | 'outline'> = {
  new: 'outline', triaged: 'secondary', in_progress: 'secondary',
  blocked: 'destructive', resolved: 'default', closed: 'default',
};

function userName(u: { first_name: string | null; last_name: string | null } | null | undefined) {
  if (!u) return '—';
  return [u.first_name, u.last_name].filter(Boolean).join(' ') || '—';
}

export default function ClientSuggestionDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { data: item, isLoading } = useSuggestItem(id);
  const updateItem = useUpdateSuggestItem();
  const { data: attachments } = useSuggestAttachments(id);
  const uploadAttachment = useUploadSuggestAttachment();

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [dirty, setDirty] = useState(false);
  const [isDragging, setIsDragging] = useState(false);

  useEffect(() => {
    if (!item) return;
    setTitle(item.title);
    setDescription(item.description);
    setDirty(false);
  }, [item]);

  const handlePaste = useCallback(async (e: React.ClipboardEvent) => {
    if (!id || !item || !user) return;
    const items = e.clipboardData?.items;
    if (!items) return;
    for (const clipItem of Array.from(items)) {
      if (clipItem.type.startsWith('image/')) {
        e.preventDefault();
        const blob = clipItem.getAsFile();
        if (!blob) continue;
        const file = new File([blob], `screenshot-${Date.now()}.png`, { type: 'image/png' });
        await uploadAttachment.mutateAsync({ file, itemId: id, tenantId: item.tenant_id, userId: user.id });
        toast({ title: 'Screenshot uploaded' });
      }
    }
  }, [id, item, user, uploadAttachment]);

  const handleDragOver = useCallback((e: React.DragEvent) => { e.preventDefault(); setIsDragging(true); }, []);
  const handleDragLeave = useCallback((e: React.DragEvent) => { e.preventDefault(); setIsDragging(false); }, []);
  const handleDrop = useCallback(async (e: React.DragEvent) => {
    e.preventDefault(); setIsDragging(false);
    if (!id || !item || !user) return;
    for (const file of Array.from(e.dataTransfer.files)) {
      await uploadAttachment.mutateAsync({ file, itemId: id, tenantId: item.tenant_id, userId: user.id });
    }
  }, [id, item, user, uploadAttachment]);

  const handleSave = async () => {
    if (!id || !user) return;
    await updateItem.mutateAsync({ id, title, description, updated_by: user.id });
    setDirty(false);
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files?.length || !id || !item || !user) return;
    for (const file of Array.from(files)) {
      await uploadAttachment.mutateAsync({ file, itemId: id, tenantId: item.tenant_id, userId: user.id });
    }
    e.target.value = '';
  };

  const handleViewAttachment = async (filePath: string) => {
    const url = await getAttachmentSignedUrl(filePath);
    if (url) window.open(url, '_blank');
    else toast({ title: 'Could not load file', variant: 'destructive' });
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }
  if (!item) {
    return <div className="text-center py-20 text-muted-foreground">Item not found.</div>;
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6" onPaste={handlePaste}>
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => navigate('/client/suggestions')}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <h1 className="text-2xl font-bold text-foreground truncate flex-1">{item.title}</h1>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-5">
          <Card>
            <CardContent className="pt-6 space-y-4">
              <div className="space-y-2">
                <Label>Title</Label>
                <Input value={title} onChange={e => { setTitle(e.target.value); setDirty(true); }} />
              </div>
              <div className="space-y-2">
                <Label>Description</Label>
                <Textarea value={description} onChange={e => { setDescription(e.target.value); setDirty(true); }} rows={5} />
              </div>

              {item.resolution_notes && (
                <div className="space-y-2">
                  <Label className="text-muted-foreground">Resolution</Label>
                  <div className="rounded-md border bg-muted/40 p-3 text-sm whitespace-pre-wrap text-foreground">
                    {item.resolution_notes}
                  </div>
                </div>
              )}

              {item.release_notes && (
                <div className="space-y-2">
                  <Label className="text-muted-foreground">What was released</Label>
                  <div className="rounded-md border bg-muted/40 p-3 text-sm whitespace-pre-wrap text-foreground">
                    {item.release_notes}
                  </div>
                </div>
              )}

              <div className="flex justify-end pt-2">
                <Button onClick={handleSave} disabled={!dirty || updateItem.isPending}>
                  {updateItem.isPending && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
                  Save Changes
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="space-y-5">
          <Card>
            <CardHeader className="pb-3"><CardTitle className="text-sm">Details</CardTitle></CardHeader>
            <CardContent className="space-y-2 text-sm">
              <div className="flex justify-between items-center">
                <span className="text-muted-foreground">Status</span>
                <Badge variant={STATUS_VARIANT[item.status?.code ?? ''] ?? 'outline'} className="text-xs">
                  {item.status?.label ?? '—'}
                </Badge>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-muted-foreground">Type</span>
                <Badge variant="outline" className="text-xs">{item.item_type?.label ?? '—'}</Badge>
              </div>
              <div className="flex justify-between"><span className="text-muted-foreground">Category</span><span>{item.category?.label ?? '—'}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Priority</span><span>{item.priority?.label ?? '—'}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Reported By</span><span>{userName(item.reported_by_user)}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Created</span><span>{format(new Date(item.created_at), 'dd/MM/yyyy HH:mm')}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Updated</span><span>{format(new Date(item.updated_at), 'dd/MM/yyyy HH:mm')}</span></div>
              {item.resolved_at && (
                <div className="flex justify-between"><span className="text-muted-foreground">Resolved</span><span>{format(new Date(item.resolved_at), 'dd/MM/yyyy')}</span></div>
              )}
              {item.released_at && (
                <div className="flex justify-between"><span className="text-muted-foreground">Released</span><span>{format(new Date(item.released_at), 'dd/MM/yyyy')}</span></div>
              )}
            </CardContent>
          </Card>

          <Card onDragOver={handleDragOver} onDragLeave={handleDragLeave} onDrop={handleDrop}
            className={isDragging ? 'border-2 border-dashed border-primary' : ''}>
            <CardHeader className="pb-3"><CardTitle className="text-sm">Attachments</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              <label className="flex items-center gap-2 cursor-pointer text-sm text-primary hover:underline">
                <Upload className="h-4 w-4" />
                Upload File
                <input type="file" multiple className="hidden" onChange={handleFileUpload} />
              </label>
              {uploadAttachment.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
              {(attachments ?? []).map(a => (
                <button key={a.id} onClick={() => handleViewAttachment(a.file_path)}
                  className="flex items-center gap-2 text-sm text-foreground hover:text-primary w-full text-left">
                  {a.mime_type?.startsWith('image/')
                    ? <ImageIcon className="h-4 w-4 text-muted-foreground" />
                    : <FileText className="h-4 w-4 text-muted-foreground" />}
                  <span className="truncate">{a.file_name}</span>
                </button>
              ))}
              {(attachments ?? []).length === 0 && !uploadAttachment.isPending && (
                <p className="text-xs text-muted-foreground">Paste screenshot anywhere or drag files here.</p>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
