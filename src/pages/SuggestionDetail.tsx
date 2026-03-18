import { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { DashboardLayout } from '@/components/DashboardLayout';
import { useAuth } from '@/hooks/useAuth';
import { useSuggestItem, useUpdateSuggestItem } from '@/hooks/useSuggestItems';
import { useSuggestDropdowns } from '@/hooks/useSuggestDropdowns';
import { useSuggestAttachments, useUploadSuggestAttachment, getAttachmentSignedUrl } from '@/hooks/useSuggestAttachments';
import { useVivacityTeamUsers } from '@/hooks/useVivacityTeamUsers';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { Loader2, ArrowLeft, Upload, FileText, Image as ImageIcon, Wand2, Copy, X } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { format } from 'date-fns';
import { toast } from '@/hooks/use-toast';

function userName(user: { first_name: string | null; last_name: string | null } | null | undefined): string {
  if (!user) return '—';
  return [user.first_name, user.last_name].filter(Boolean).join(' ') || '—';
}

export default function SuggestionDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { data: item, isLoading } = useSuggestItem(id);
  const updateItem = useUpdateSuggestItem();
  const dropdowns = useSuggestDropdowns();
  const { data: attachments } = useSuggestAttachments(id);
  const uploadAttachment = useUploadSuggestAttachment();
  const { data: teamUsers } = useVivacityTeamUsers();

  // Editable fields
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [typeId, setTypeId] = useState('');
  const [statusId, setStatusId] = useState('');
  const [priorityId, setPriorityId] = useState('');
  const [impactId, setImpactId] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [releaseStatusId, setReleaseStatusId] = useState('');
  const [assignedTo, setAssignedTo] = useState('');
  const [resolutionNotes, setResolutionNotes] = useState('');
  const [releaseVersion, setReleaseVersion] = useState('');
  const [releaseNotes, setReleaseNotes] = useState('');
  const [sourcePageUrl, setSourcePageUrl] = useState('');
  const [sourcePageLabel, setSourcePageLabel] = useState('');
  const [sourceArea, setSourceArea] = useState('');
  const [sourceComponent, setSourceComponent] = useState('');
  const [dirty, setDirty] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [promptDialogOpen, setPromptDialogOpen] = useState(false);
  const [promptText, setPromptText] = useState('');

  // Populate from loaded item
  useEffect(() => {
    if (!item) return;
    setTitle(item.title);
    setDescription(item.description);
    setTypeId(item.suggest_item_type_id);
    setStatusId(item.suggest_status_id);
    setPriorityId(item.suggest_priority_id);
    setImpactId(item.suggest_impact_rating_id);
    setCategoryId(item.suggest_category_id ?? '');
    setReleaseStatusId(item.suggest_release_status_id);
    setAssignedTo(item.assigned_to ?? '');
    setResolutionNotes(item.resolution_notes ?? '');
    setReleaseVersion(item.release_version ?? '');
    setReleaseNotes(item.release_notes ?? '');
    setSourcePageUrl(item.source_page_url ?? '');
    setSourcePageLabel(item.source_page_label ?? '');
    setSourceArea(item.source_area ?? '');
    setSourceComponent(item.source_component ?? '');
    setDirty(false);
  }, [item]);

  // Helper to resolve dropdown ID to label
  const resolveLabel = (list: { id: string; label: string }[], id: string) =>
    list.find(x => x.id === id)?.label ?? '';

  // Build and show Lovable prompt in dialog
  const buildPrompt = useCallback(() => {
    if (!item) return '';

    const typeLabel = resolveLabel(dropdowns.itemTypes, typeId);
    const priorityLabel = resolveLabel(dropdowns.priorities, priorityId);
    const categoryLabel = resolveLabel(dropdowns.categories, categoryId);
    const statusLabel = resolveLabel(dropdowns.statuses, statusId);
    const impactLabel = resolveLabel(dropdowns.impactRatings, impactId);

    const lines: string[] = [];
    lines.push(`## Fix: ${title}`);
    lines.push('');

    const meta = [
      typeLabel && `**Type:** ${typeLabel}`,
      priorityLabel && `**Priority:** ${priorityLabel}`,
      categoryLabel && `**Category:** ${categoryLabel}`,
    ].filter(Boolean).join(' | ');
    if (meta) lines.push(meta);

    const meta2 = [
      statusLabel && `**Status:** ${statusLabel}`,
      impactLabel && `**Impact:** ${impactLabel}`,
    ].filter(Boolean).join(' | ');
    if (meta2) lines.push(meta2);

    if (meta || meta2) lines.push('');

    if (description) {
      lines.push('### Description');
      lines.push(description);
      lines.push('');
    }

    const hasContext = sourcePageUrl || sourceArea || sourceComponent;
    if (hasContext) {
      lines.push('### Source Context');
      if (sourcePageUrl) lines.push(`- Page: ${sourcePageUrl}${sourcePageLabel ? ` (${sourcePageLabel})` : ''}`);
      if (sourceArea) lines.push(`- Area: ${sourceArea}`);
      if (sourceComponent) lines.push(`- Component: ${sourceComponent}`);
      lines.push('');
    }

    if (resolutionNotes) {
      lines.push('### Resolution Notes');
      lines.push(resolutionNotes);
      lines.push('');
    }

    if (attachments && attachments.length > 0) {
      lines.push('### Attachments');
      attachments.forEach(a => lines.push(`- ${a.file_name}`));
      lines.push('');
    }

    lines.push('Please fix this issue.');
    return lines.join('\n');
  }, [item, title, description, typeId, statusId, priorityId, impactId, categoryId, sourcePageUrl, sourcePageLabel, sourceArea, sourceComponent, resolutionNotes, attachments, dropdowns]);

  const handleShowPrompt = useCallback(() => {
    const text = buildPrompt();
    if (!text) return;
    setPromptText(text);
    setPromptDialogOpen(true);
  }, [buildPrompt]);

  const handleCopyPromptToClipboard = useCallback(() => {
    navigator.clipboard.writeText(promptText).then(() => {
      toast({ title: 'Prompt copied to clipboard' });
    });
  }, [promptText]);

  // Paste screenshot handler
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
        await uploadAttachment.mutateAsync({
          file,
          itemId: id,
          tenantId: item.tenant_id,
          userId: user.id,
        });
        toast({ title: 'Screenshot uploaded' });
      }
    }
  }, [id, item, user, uploadAttachment]);

  // Drag-and-drop handlers
  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  const handleDrop = useCallback(async (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (!id || !item || !user) return;
    const files = e.dataTransfer.files;
    for (const file of Array.from(files)) {
      await uploadAttachment.mutateAsync({
        file,
        itemId: id,
        tenantId: item.tenant_id,
        userId: user.id,
      });
    }
  }, [id, item, user, uploadAttachment]);

  const handleSave = async () => {
    if (!id || !user) return;
    const resolvedStatus = dropdowns.statuses.find(s => s.code === 'resolved');
    const releasedStatus = dropdowns.releaseStatuses.find(r => r.code === 'released');
    const isResolving = resolvedStatus && statusId === resolvedStatus.id && item?.suggest_status_id !== resolvedStatus.id;
    const isReleasing = releasedStatus && releaseStatusId === releasedStatus.id && item?.suggest_release_status_id !== releasedStatus.id;

    await updateItem.mutateAsync({
      id,
      title,
      description,
      suggest_item_type_id: typeId,
      suggest_status_id: statusId,
      suggest_priority_id: priorityId,
      suggest_impact_rating_id: impactId,
      suggest_category_id: categoryId || null,
      suggest_release_status_id: releaseStatusId,
      assigned_to: assignedTo || null,
      resolution_notes: resolutionNotes || null,
      release_version: releaseVersion || null,
      release_notes: releaseNotes || null,
      source_page_url: sourcePageUrl || null,
      source_page_label: sourcePageLabel || null,
      source_area: sourceArea || null,
      source_component: sourceComponent || null,
      updated_by: user.id,
      ...(isResolving ? { resolved_at: new Date().toISOString(), resolved_by: user.id } : {}),
      ...(isReleasing ? { released_at: new Date().toISOString(), released_by: user.id } : {}),
    });
    setDirty(false);
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files?.length || !id || !item || !user) return;
    for (const file of Array.from(files)) {
      await uploadAttachment.mutateAsync({
        file,
        itemId: id,
        tenantId: item.tenant_id,
        userId: user.id,
      });
    }
    e.target.value = '';
  };

  const handleViewAttachment = async (filePath: string) => {
    const url = await getAttachmentSignedUrl(filePath);
    if (url) window.open(url, '_blank');
    else toast({ title: 'Could not load file', variant: 'destructive' });
  };

  const markDirty = <T,>(setter: React.Dispatch<React.SetStateAction<T>>) => (val: T) => {
    setter(val);
    setDirty(true);
  };

  if (isLoading) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      </DashboardLayout>
    );
  }

  if (!item) {
    return (
      <DashboardLayout>
        <div className="text-center py-20 text-muted-foreground">Item not found.</div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="max-w-4xl mx-auto space-y-6" onPaste={handlePaste}>
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => navigate('/suggestions')}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <h1 className="text-2xl font-bold text-foreground truncate flex-1">{item.title}</h1>
          <Button variant="outline" size="icon" onClick={handleShowPrompt} title="Generate Lovable prompt">
            <Wand2 className="h-4 w-4" />
          </Button>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Main content */}
          <div className="lg:col-span-2 space-y-5">
            <Card>
              <CardContent className="pt-6 space-y-4">
                <div className="space-y-2">
                  <Label>Title</Label>
                  <Input value={title} onChange={e => markDirty(setTitle)(e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label>Description</Label>
                  <Textarea value={description} onChange={e => markDirty(setDescription)(e.target.value)} rows={5} />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Item Type</Label>
                    <Select value={typeId} onValueChange={markDirty(setTypeId)}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {dropdowns.itemTypes.map(t => <SelectItem key={t.id} value={t.id}>{t.label}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Category</Label>
                    <Select value={categoryId} onValueChange={markDirty(setCategoryId)}>
                      <SelectTrigger><SelectValue placeholder="None" /></SelectTrigger>
                      <SelectContent>
                        {dropdowns.categories.map(c => <SelectItem key={c.id} value={c.id}>{c.label}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Priority</Label>
                    <Select value={priorityId} onValueChange={markDirty(setPriorityId)}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {dropdowns.priorities.map(p => <SelectItem key={p.id} value={p.id}>{p.label}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Impact Rating</Label>
                    <Select value={impactId} onValueChange={markDirty(setImpactId)}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {dropdowns.impactRatings.map(i => <SelectItem key={i.id} value={i.id}>{i.label}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Status</Label>
                    <Select value={statusId} onValueChange={markDirty(setStatusId)}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {dropdowns.statuses.map(s => <SelectItem key={s.id} value={s.id}>{s.label}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Assigned To</Label>
                    <Select value={assignedTo} onValueChange={markDirty(setAssignedTo)}>
                      <SelectTrigger><SelectValue placeholder="Unassigned" /></SelectTrigger>
                      <SelectContent>
                        {(teamUsers ?? []).map(u => (
                          <SelectItem key={u.user_uuid} value={u.user_uuid}>
                            {[u.first_name, u.last_name].filter(Boolean).join(' ')}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <Separator />

                {/* Resolution */}
                <div className="space-y-2">
                  <Label>Resolution Notes</Label>
                  <Textarea value={resolutionNotes} onChange={e => markDirty(setResolutionNotes)(e.target.value)} rows={3} placeholder="Notes on how this was resolved…" />
                </div>

                <Separator />

                {/* Release */}
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Release Status</Label>
                    <Select value={releaseStatusId} onValueChange={markDirty(setReleaseStatusId)}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {dropdowns.releaseStatuses.map(r => <SelectItem key={r.id} value={r.id}>{r.label}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Release Version</Label>
                    <Input value={releaseVersion} onChange={e => markDirty(setReleaseVersion)(e.target.value)} placeholder="e.g. 2.4.1" />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>Release Notes</Label>
                  <Textarea value={releaseNotes} onChange={e => markDirty(setReleaseNotes)(e.target.value)} rows={3} placeholder="What was released…" />
                </div>

                {/* Source context */}
                <details className="text-sm">
                  <summary className="cursor-pointer text-muted-foreground font-medium">Source Page Context</summary>
                  <div className="grid grid-cols-2 gap-3 mt-3">
                    <div className="space-y-1">
                      <Label className="text-xs">Page URL</Label>
                      <Input value={sourcePageUrl} onChange={e => markDirty(setSourcePageUrl)(e.target.value)} className="text-xs" />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Page Label</Label>
                      <Input value={sourcePageLabel} onChange={e => markDirty(setSourcePageLabel)(e.target.value)} className="text-xs" />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Area</Label>
                      <Input value={sourceArea} onChange={e => markDirty(setSourceArea)(e.target.value)} className="text-xs" />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Component</Label>
                      <Input value={sourceComponent} onChange={e => markDirty(setSourceComponent)(e.target.value)} className="text-xs" />
                    </div>
                  </div>
                </details>

                {/* Save */}
                <div className="flex justify-end pt-2">
                  <Button onClick={handleSave} disabled={!dirty || updateItem.isPending}>
                    {updateItem.isPending && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
                    Save Changes
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Sidebar */}
          <div className="space-y-5">
            {/* Metadata */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm">Details</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 text-sm">
                <div className="flex justify-between"><span className="text-muted-foreground">Tenant</span><span>{item.tenant?.name ?? '—'}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Reported By</span><span>{userName(item.reported_by_user)}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Created</span><span>{format(new Date(item.created_at), 'dd MMM yyyy HH:mm')}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Updated</span><span>{format(new Date(item.updated_at), 'dd MMM yyyy HH:mm')}</span></div>
                {item.resolved_at && (
                  <div className="flex justify-between"><span className="text-muted-foreground">Resolved</span><span>{format(new Date(item.resolved_at), 'dd MMM yyyy')}</span></div>
                )}
                {item.released_at && (
                  <div className="flex justify-between"><span className="text-muted-foreground">Released</span><span>{format(new Date(item.released_at), 'dd MMM yyyy')}</span></div>
                )}
              </CardContent>
            </Card>

            {/* Attachments */}
            <Card
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
              className={isDragging ? 'border-2 border-dashed border-primary' : ''}
            >
              <CardHeader className="pb-3">
                <CardTitle className="text-sm">Attachments</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <label className="flex items-center gap-2 cursor-pointer text-sm text-primary hover:underline">
                  <Upload className="h-4 w-4" />
                  Upload File
                  <input type="file" multiple className="hidden" onChange={handleFileUpload} />
                </label>
                {uploadAttachment.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
                {(attachments ?? []).map(a => (
                  <button
                    key={a.id}
                    onClick={() => handleViewAttachment(a.file_path)}
                    className="flex items-center gap-2 text-sm text-foreground hover:text-primary w-full text-left"
                  >
                    {a.mime_type?.startsWith('image/') ? <ImageIcon className="h-4 w-4 text-muted-foreground" /> : <FileText className="h-4 w-4 text-muted-foreground" />}
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
    </DashboardLayout>
  );
}
