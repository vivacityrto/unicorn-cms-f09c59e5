import { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { GripVertical, Trash2, FileSpreadsheet, FileText, File as FileIcon, Plus, ChevronsUpDown, Check, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

interface AttachmentRow {
  id: string;
  document_id: number;
  order_number: number | null;
  title: string;
  format: string | null;
  file_path: string | null;
}

interface CoreDoc {
  id: number;
  title: string;
  format: string | null;
}

interface Props {
  emailId: number;
  stageId: number | null;
}

function fileIcon(format: string | null) {
  const f = (format || '').toLowerCase();
  if (f === 'xlsx' || f === 'xls') return <FileSpreadsheet className="h-4 w-4 text-emerald-600" />;
  if (f === 'docx' || f === 'doc') return <FileText className="h-4 w-4 text-blue-600" />;
  return <FileIcon className="h-4 w-4 text-muted-foreground" />;
}

function SortableRow({ row, onRemove }: { row: AttachmentRow; onRemove: (r: AttachmentRow) => void }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: row.id });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.6 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="flex items-center gap-3 rounded-md border bg-card px-3 py-2"
    >
      <button
        type="button"
        className="cursor-grab touch-none text-muted-foreground hover:text-foreground"
        {...attributes}
        {...listeners}
        aria-label="Drag to reorder"
      >
        <GripVertical className="h-4 w-4" />
      </button>
      {fileIcon(row.format)}
      <span className="flex-1 truncate text-sm font-medium">{row.title}</span>
      {row.format && (
        <Badge variant="secondary" className="text-[10px] uppercase">
          {row.format}
        </Badge>
      )}
      {!row.file_path && (
        <Badge variant="outline" className="text-[10px] text-muted-foreground">
          No file
        </Badge>
      )}
      <Button
        size="icon"
        variant="ghost"
        className="h-7 w-7 text-destructive hover:bg-destructive/10 hover:text-destructive"
        onClick={() => onRemove(row)}
        aria-label="Remove attachment"
      >
        <Trash2 className="h-4 w-4" />
      </Button>
    </div>
  );
}

export function EmailAttachmentsManager({ emailId, stageId }: Props) {
  const qc = useQueryClient();
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickedDocId, setPickedDocId] = useState<number | null>(null);
  const [removeTarget, setRemoveTarget] = useState<AttachmentRow | null>(null);

  const attachmentsQuery = useQuery({
    queryKey: ['stage-email-attachments', emailId],
    enabled: !!emailId,
    queryFn: async (): Promise<AttachmentRow[]> => {
      const { data: links, error } = await supabase
        .from('email_attachments')
        .select('id, document_id, order_number, created_at')
        .eq('email_id', emailId)
        .order('order_number', { ascending: true, nullsFirst: false })
        .order('created_at', { ascending: true });
      if (error) throw error;
      const docIds = [...new Set((links || []).map((l: any) => l.document_id))];
      if (docIds.length === 0) return [];
      const [{ data: docs }, { data: files }] = await Promise.all([
        supabase.from('documents').select('id, title, format').in('id', docIds),
        supabase
          .from('document_files')
          .select('document_id, file_path, created_at')
          .in('document_id', docIds)
          .order('created_at', { ascending: false }),
      ]);
      const docMap = new Map((docs || []).map((d: any) => [d.id, d]));
      const fileMap = new Map<number, any>();
      (files || []).forEach((f: any) => {
        if (!fileMap.has(f.document_id)) fileMap.set(f.document_id, f);
      });
      return (links || [])
        .map((l: any) => {
          const d = docMap.get(l.document_id);
          if (!d) return null;
          const f = fileMap.get(l.document_id);
          return {
            id: l.id,
            document_id: l.document_id,
            order_number: l.order_number,
            title: d.title,
            format: d.format ?? null,
            file_path: f?.file_path ?? null,
          } as AttachmentRow;
        })
        .filter(Boolean) as AttachmentRow[];
    },
  });

  const coreDocsQuery = useQuery({
    queryKey: ['core-docs-for-stage', stageId],
    enabled: !!stageId,
    queryFn: async (): Promise<CoreDoc[]> => {
      const { data, error } = await supabase
        .from('documents')
        .select('id, title, format')
        .eq('is_core', true)
        .eq('stage', stageId!)
        .order('title', { ascending: true });
      if (error) throw error;
      return (data || []) as CoreDoc[];
    },
  });

  const rows = attachmentsQuery.data || [];
  const linkedIds = useMemo(() => new Set(rows.map((r) => r.document_id)), [rows]);
  const availableDocs = (coreDocsQuery.data || []).filter((d) => !linkedIds.has(d.id));

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const reorderMutation = useMutation({
    mutationFn: async (ordered: AttachmentRow[]) => {
      // Update each row's order_number
      await Promise.all(
        ordered.map((r, idx) =>
          supabase.from('email_attachments').update({ order_number: idx + 1 }).eq('id', r.id),
        ),
      );
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['stage-email-attachments', emailId] });
      toast.success('Order updated');
    },
    onError: (e: any) => toast.error(e.message || 'Failed to reorder'),
  });

  const addMutation = useMutation({
    mutationFn: async (documentId: number) => {
      const maxOrder = rows.reduce((m, r) => Math.max(m, r.order_number || 0), 0);
      const { error } = await supabase.from('email_attachments').insert({
        email_id: emailId,
        document_id: documentId,
        order_number: maxOrder + 1,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['stage-email-attachments', emailId] });
      setPickedDocId(null);
      toast.success('Attachment added');
    },
    onError: (e: any) => toast.error(e.message || 'Failed to add attachment'),
  });

  const removeMutation = useMutation({
    mutationFn: async (rowId: string) => {
      const { error } = await supabase.from('email_attachments').delete().eq('id', rowId);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['stage-email-attachments', emailId] });
      setRemoveTarget(null);
      toast.success('Attachment removed');
    },
    onError: (e: any) => toast.error(e.message || 'Failed to remove attachment'),
  });

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = rows.findIndex((r) => r.id === active.id);
    const newIndex = rows.findIndex((r) => r.id === over.id);
    if (oldIndex < 0 || newIndex < 0) return;
    const next = arrayMove(rows, oldIndex, newIndex);
    qc.setQueryData(['stage-email-attachments', emailId], next);
    reorderMutation.mutate(next);
  };

  const pickedDoc = availableDocs.find((d) => d.id === pickedDocId) || null;

  return (
    <div className="space-y-4">
      {/* Add attachment */}
      {stageId == null ? (
        <div className="rounded-md border border-dashed p-4 text-sm text-muted-foreground">
          This email is not associated with a stage — no core documents available to attach.
        </div>
      ) : (
        <div className="flex items-end gap-2">
          <div className="flex-1 space-y-1">
            <label className="text-xs font-medium">Add core document</label>
            <Popover open={pickerOpen} onOpenChange={setPickerOpen}>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  role="combobox"
                  className="w-full justify-between font-normal"
                  disabled={coreDocsQuery.isLoading}
                >
                  {pickedDoc ? pickedDoc.title : 'Select a core document for this stage…'}
                  <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-[480px] p-0" align="start">
                <Command>
                  <CommandInput placeholder="Search core documents…" />
                  <CommandList>
                    <CommandEmpty>
                      {availableDocs.length === 0
                        ? 'No core documents available for this stage.'
                        : 'No matches.'}
                    </CommandEmpty>
                    <CommandGroup>
                      {availableDocs.map((doc) => (
                        <CommandItem
                          key={doc.id}
                          value={`${doc.title} ${doc.format ?? ''}`}
                          onSelect={() => {
                            setPickedDocId(doc.id);
                            setPickerOpen(false);
                          }}
                        >
                          <Check
                            className={cn(
                              'mr-2 h-4 w-4',
                              pickedDocId === doc.id ? 'opacity-100' : 'opacity-0',
                            )}
                          />
                          {fileIcon(doc.format)}
                          <span className="ml-2 flex-1 truncate">{doc.title}</span>
                          {doc.format && (
                            <Badge variant="secondary" className="ml-2 text-[10px] uppercase">
                              {doc.format}
                            </Badge>
                          )}
                        </CommandItem>
                      ))}
                    </CommandGroup>
                  </CommandList>
                </Command>
              </PopoverContent>
            </Popover>
          </div>
          <Button
            onClick={() => pickedDocId && addMutation.mutate(pickedDocId)}
            disabled={!pickedDocId || addMutation.isPending}
          >
            {addMutation.isPending ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Plus className="mr-2 h-4 w-4" />
            )}
            Add
          </Button>
        </div>
      )}

      {/* List */}
      <div className="space-y-2">
        {attachmentsQuery.isLoading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading attachments…
          </div>
        ) : rows.length === 0 ? (
          <div className="rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground">
            No attachments linked to this email template.
          </div>
        ) : (
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
            <SortableContext items={rows.map((r) => r.id)} strategy={verticalListSortingStrategy}>
              <div className="space-y-2">
                {rows.map((row) => (
                  <SortableRow key={row.id} row={row} onRemove={setRemoveTarget} />
                ))}
              </div>
            </SortableContext>
          </DndContext>
        )}
      </div>

      <ConfirmDialog
        open={!!removeTarget}
        onOpenChange={(o) => !o && setRemoveTarget(null)}
        title="Remove attachment?"
        description="This unlinks the document from this email template. The document itself is not deleted."
        itemName={removeTarget?.title}
        confirmText="Remove"
        variant="destructive"
        isLoading={removeMutation.isPending}
        onConfirm={() => removeTarget && removeMutation.mutate(removeTarget.id)}
      />
    </div>
  );
}
