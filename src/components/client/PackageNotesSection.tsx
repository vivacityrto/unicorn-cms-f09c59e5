import { useState } from 'react';
import { format } from 'date-fns';
import { useNotes, Note, CreateNoteInput, filterNotes } from '@/hooks/useNotes';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
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
  Trash2
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

const PRIORITY_OPTIONS = [
  { value: 'low', label: 'Low', color: 'bg-muted text-muted-foreground' },
  { value: 'normal', label: 'Normal', color: 'bg-secondary text-secondary-foreground' },
  { value: 'high', label: 'High', color: 'bg-amber-100 text-amber-700' },
  { value: 'urgent', label: 'Urgent', color: 'bg-destructive/10 text-destructive' },
];

export function PackageNotesSection({ tenantId, packageInstanceId, packageId }: PackageNotesSectionProps) {
  const { notes, loading, createNote, updateNote, deleteNote, togglePin } = useNotes({
    parentType: 'package_instance',
    parentId: packageInstanceId,
    tenantId,
  });

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
    setDialogOpen(true);
  };

  const openEditDialog = (note: Note) => {
    setEditingNote(note);
    setFormTitle(note.title || '');
    setFormDetails(note.note_details);
    setFormType(note.note_type || 'general');
    setFormPriority(note.priority || 'normal');
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

      {/* Notes list */}
      {filteredNotes.length === 0 ? (
        <div className="text-center py-8 text-muted-foreground">
          <StickyNote className="h-8 w-8 mx-auto mb-2 opacity-50" />
          <p>{notes.length === 0 ? 'No notes yet' : 'No matching notes'}</p>
        </div>
      ) : (
        <div className="space-y-3">
          {filteredNotes.map((note) => {
            const TypeIcon = getTypeIcon(note.note_type);
            const priorityOption = PRIORITY_OPTIONS.find(p => p.value === note.priority);

            return (
              <Card key={note.id} className={cn(
                "transition-colors",
                note.is_pinned && "border-primary/50 bg-primary/5"
              )}>
                <CardContent className="p-4">
                  <div className="flex items-start gap-3">
                    <div className="h-8 w-8 rounded-full bg-muted flex items-center justify-center shrink-0">
                      <TypeIcon className="h-4 w-4" />
                    </div>
                    <div className="flex-1 min-w-0 space-y-2">
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-center gap-2 flex-wrap">
                          {note.title && (
                            <span className="font-medium">{note.title}</span>
                          )}
                          {note.is_pinned && (
                            <Pin className="h-3 w-3 text-primary" />
                          )}
                          {priorityOption && priorityOption.value !== 'normal' && (
                            <Badge variant="outline" className={cn("text-xs", priorityOption.color)}>
                              {priorityOption.label}
                            </Badge>
                          )}
                        </div>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" className="h-8 w-8">
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
                      </div>
                      <p className="text-sm text-muted-foreground whitespace-pre-wrap">
                        {note.note_details}
                      </p>
                      <div className="flex items-center gap-3 text-xs text-muted-foreground">
                        {note.creator && (
                          <div className="flex items-center gap-1">
                            <Avatar className="h-4 w-4">
                              <AvatarImage src={note.creator.avatar_url || undefined} />
                              <AvatarFallback className="text-[8px]">
                                {note.creator.first_name?.[0]}{note.creator.last_name?.[0]}
                              </AvatarFallback>
                            </Avatar>
                            <span>{note.creator.first_name} {note.creator.last_name}</span>
                          </div>
                        )}
                        <span>{format(new Date(note.created_at), 'd MMM yyyy HH:mm')}</span>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Create/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingNote ? 'Edit Note' : 'Add Note'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Title (optional)</label>
              <Input
                placeholder="Note title..."
                value={formTitle}
                onChange={(e) => setFormTitle(e.target.value)}
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
              <label className="text-sm font-medium">Details</label>
              <Textarea
                placeholder="Write your note..."
                value={formDetails}
                onChange={(e) => setFormDetails(e.target.value)}
                rows={4}
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
