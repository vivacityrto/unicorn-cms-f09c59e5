import { useState, useCallback, useEffect, useRef } from 'react';
import { format } from 'date-fns';
import { useNavigate } from 'react-router-dom';
import { useNotes, Note, CreateNoteInput, filterNotes } from '@/hooks/useNotes';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Card, CardContent } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Skeleton } from '@/components/ui/skeleton';

import { 
  Plus, 
  Search, 
  StickyNote, 
  Phone, 
  AlertTriangle, 
  FileText, 
  MessageSquare,
  Pin,
  MoreHorizontal,
  Pencil,
  Trash2,
  Mic,
  MicOff,
  Loader2
} from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle
} from '@/components/ui/alert-dialog';
import { cn } from '@/lib/utils';
import { useSpeechToText } from '@/hooks/useSpeechToText';
import { supabase } from '@/integrations/supabase/client';
import { useActionPriorityOptions } from '@/hooks/useActionPriorityOptions';

interface PackageNotesSectionProps {
  tenantId: number;
  packageInstanceId: number;
  packageId: number;
}

const NOTE_TYPES = [
  { value: 'general', label: 'General', icon: StickyNote },
  { value: 'phone', label: 'Phone Call', icon: Phone },
  { value: 'risk', label: 'Risk', icon: AlertTriangle },
  { value: 'meeting', label: 'Meeting', icon: MessageSquare },
  { value: 'document', label: 'Document', icon: FileText },
];

const PRIORITY_COLOR_MAP: Record<string, string> = {
  low: 'bg-muted text-muted-foreground',
  normal: 'bg-secondary text-secondary-foreground',
  medium: 'bg-blue-100 text-blue-700',
  high: 'bg-amber-100 text-amber-700',
  urgent: 'bg-destructive/10 text-destructive',
};

export function PackageNotesSection({ tenantId, packageInstanceId, packageId }: PackageNotesSectionProps) {
  const navigate = useNavigate();
  const { notes, loading, createNote, updateNote, deleteNote, togglePin } = useNotes({
    parentType: 'package_instance',
    parentId: packageInstanceId,
    tenantId,
  });
  const { priorities: priorityOptions } = useActionPriorityOptions();

  const [searchQuery, setSearchQuery] = useState('');
  const [typeFilter, setTypeFilter] = useState('all');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingNote, setEditingNote] = useState<Note | null>(null);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);

  // Form state
  const [formTitle, setFormTitle] = useState('');
  const [formDetails, setFormDetails] = useState('');
  const [formType, setFormType] = useState('general');
  const [formPriority, setFormPriority] = useState('normal');
  const [titleManuallyEdited, setTitleManuallyEdited] = useState(false);
  const [extractingTitle, setExtractingTitle] = useState(false);
  const titleExtractTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const speech = useSpeechToText();

  // Auto-extract title from content using AI
  const extractTitle = useCallback(async (text: string) => {
    if (!text || text.trim().length < 10) return;
    setExtractingTitle(true);
    try {
      const { data, error } = await supabase.functions.invoke('extract-note-title', {
        body: { content: text.trim() },
      });
      if (!error && data?.title) {
        setFormTitle(data.title);
      }
    } catch (e) {
      console.error('Title extraction failed:', e);
    } finally {
      setExtractingTitle(false);
    }
  }, []);

  // Debounced title extraction when content changes and title hasn't been manually edited
  useEffect(() => {
    if (titleManuallyEdited || !formDetails || formDetails.trim().length < 10) return;
    if (titleExtractTimer.current) clearTimeout(titleExtractTimer.current);
    titleExtractTimer.current = setTimeout(() => {
      extractTitle(formDetails);
    }, 1500);
    return () => {
      if (titleExtractTimer.current) clearTimeout(titleExtractTimer.current);
    };
  }, [formDetails, titleManuallyEdited, extractTitle]);

  const filteredNotes = filterNotes(notes, {
    searchQuery,
    noteType: typeFilter !== 'all' ? typeFilter : undefined
  });

  const openCreateDialog = () => {
    setEditingNote(null);
    setFormTitle('');
    setFormDetails('');
    setFormType('general');
    setFormPriority('normal');
    setTitleManuallyEdited(false);
    setDialogOpen(true);
  };

  const openEditDialog = (note: Note) => {
    setEditingNote(note);
    setFormTitle(note.title || '');
    setFormDetails(note.note_details);
    setFormType(note.note_type || 'general');
    setFormPriority(note.priority || 'normal');
    setTitleManuallyEdited(true);
    setDialogOpen(true);
  };

  const handleSubmit = async () => {
    if (!formDetails.trim()) return;

    if (editingNote) {
      await updateNote(editingNote.id, {
        title: formTitle || null,
        note_details: formDetails,
        note_type: formType,
        priority: formPriority
      });
    } else {
      await createNote({
        title: formTitle || undefined,
        note_details: formDetails,
        note_type: formType,
        priority: formPriority,
        package_id: packageId
      });
    }
    setDialogOpen(false);
  };

  const handleDelete = async () => {
    if (deleteConfirmId) {
      await deleteNote(deleteConfirmId);
      setDeleteConfirmId(null);
    }
  };

  const getTypeIcon = (type: string | null) => {
    const noteType = NOTE_TYPES.find(t => t.value === type);
    return noteType?.icon || StickyNote;
  };

  if (loading) {
    return (
      <div className="space-y-3 p-4">
        {[1, 2, 3].map(i => (
          <Skeleton key={i} className="h-24 w-full" />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-4 p-4">
      {/* Header with search and add */}
      <div className="flex items-center gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search notes..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9"
          />
        </div>
        <Select value={typeFilter} onValueChange={setTypeFilter}>
          <SelectTrigger className="w-[140px]">
            <SelectValue placeholder="All types" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Types</SelectItem>
            {NOTE_TYPES.map(type => (
              <SelectItem key={type.value} value={type.value}>
                <div className="flex items-center gap-2">
                  <type.icon className="h-4 w-4" />
                  {type.label}
                </div>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button onClick={openCreateDialog} size="sm">
          <Plus className="h-4 w-4 mr-1" />
          Add Note
        </Button>
      </div>

      {/* Notes Table */}
      <Card>
        <CardContent className="p-0">
          {filteredNotes.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <StickyNote className="h-8 w-8 mx-auto mb-2 opacity-50" />
              <p>{notes.length === 0 ? 'No notes yet' : 'No matching notes'}</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Title</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Priority</TableHead>
                  <TableHead>Author</TableHead>
                  <TableHead>Details</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredNotes.map((note) => {
                  const TypeIcon = getTypeIcon(note.note_type);
                  const priorityOption = priorityOptions.find(p => p.value === note.priority);

                  return (
                    <TableRow key={note.id} className={cn(note.is_pinned && "bg-primary/5")}>
                      <TableCell className="whitespace-nowrap text-sm">
                        {format(new Date(note.created_at), 'd MMM yyyy')}
                      </TableCell>
                      <TableCell className="font-medium">
                        <div className="flex items-center gap-1.5">
                          {note.is_pinned && <Pin className="h-3 w-3 text-primary shrink-0" />}
                          <span className="truncate max-w-[200px]">{note.title || '—'}</span>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className="text-xs capitalize gap-1">
                          <TypeIcon className="h-3 w-3" />
                          {note.note_type || 'general'}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        {priorityOption && priorityOption.value !== 'normal' ? (
                          <Badge variant="outline" className={cn("text-xs", PRIORITY_COLOR_MAP[priorityOption.value] || 'bg-secondary text-secondary-foreground')}>
                            {priorityOption.label}
                          </Badge>
                        ) : (
                          <span className="text-xs text-muted-foreground">Normal</span>
                        )}
                      </TableCell>
                      <TableCell className="text-sm whitespace-nowrap">
                        {note.creator
                          ? `${note.creator.first_name} ${note.creator.last_name}`
                          : '—'}
                      </TableCell>
                      <TableCell className="max-w-[250px] text-xs text-muted-foreground">
                        <p className="line-clamp-2">{note.note_details}</p>
                      </TableCell>
                      <TableCell className="text-right">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" className="h-7 w-7">
                              <MoreHorizontal className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={() => togglePin(note.id, note.is_pinned)}>
                              <Pin className="h-4 w-4 mr-2" />
                              {note.is_pinned ? 'Unpin' : 'Pin'}
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => openEditDialog(note)}>
                              <Pencil className="h-4 w-4 mr-2" />
                              Edit
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              onClick={() => setDeleteConfirmId(note.id)}
                              className="text-destructive"
                            >
                              <Trash2 className="h-4 w-4 mr-2" />
                              Delete
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Create/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="w-[90vw] max-w-[1400px] max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingNote ? 'Edit Note' : 'Add Note'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-sm font-medium">Title (optional)</label>
                <span className="flex items-center gap-1 text-xs text-muted-foreground italic">
                  {extractingTitle && <Loader2 className="h-3 w-3 animate-spin" />}
                  {!titleManuallyEdited && formTitle && 'AI generated from Content'}
                </span>
              </div>
              <Input
                placeholder="Auto-generated from content..."
                value={formTitle}
                onChange={(e) => {
                  setFormTitle(e.target.value);
                  setTitleManuallyEdited(true);
                }}
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">Type</label>
                <Select value={formType} onValueChange={setFormType}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {NOTE_TYPES.map(type => (
                      <SelectItem key={type.value} value={type.value}>
                        <div className="flex items-center gap-2">
                          <type.icon className="h-4 w-4" />
                          {type.label}
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Priority</label>
                <Select value={formPriority} onValueChange={setFormPriority}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {PRIORITY_OPTIONS.map(priority => (
                      <SelectItem key={priority.value} value={priority.value}>
                        {priority.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-sm font-medium">Details</label>
                {speech.isSupported && (
                  <Button
                    type="button"
                    variant={speech.isRecording ? "destructive" : "ghost"}
                    size="sm"
                    className="gap-1.5 h-7 text-xs"
                    onClick={() => {
                      if (speech.isRecording) {
                        speech.stopRecording();
                      } else {
                        speech.startRecording((text) => {
                          setFormDetails(prev => prev ? `${prev} ${text}` : text);
                        });
                      }
                    }}
                  >
                    {speech.isRecording ? (
                      <><MicOff className="h-3.5 w-3.5" /> Stop</>
                    ) : (
                      <><Mic className="h-3.5 w-3.5" /> Speak</>
                    )}
                  </Button>
                )}
              </div>
              <Textarea
                placeholder="Write your note..."
                value={speech.isRecording && speech.interimTranscript 
                  ? (formDetails ? `${formDetails} ${speech.interimTranscript}` : speech.interimTranscript)
                  : formDetails}
                onChange={(e) => setFormDetails(e.target.value)}
                rows={20}
                className={speech.isRecording ? 'border-destructive' : ''}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleSubmit} disabled={!formDetails.trim()}>
              {editingNote ? 'Save Changes' : 'Add Note'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <AlertDialog open={!!deleteConfirmId} onOpenChange={(open) => !open && setDeleteConfirmId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Note</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this note? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground">
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
