import { useState } from 'react';
import { useNotes, Note } from '@/hooks/useNotes';
import { useClientActionItems } from '@/hooks/useClientManagementData';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Skeleton } from '@/components/ui/skeleton';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { 
  Plus, StickyNote, Pin, MoreHorizontal, Edit, Trash2, 
  ArrowRight, Tag, Clock, MessageSquare, AlertTriangle, 
  CheckCircle, Users, FileText, Loader2
} from 'lucide-react';
import { formatDistanceToNow, format } from 'date-fns';

interface ClientStructuredNotesTabProps {
  tenantId: number;
  clientId: string;
}

const NOTE_TYPES = [
  { value: 'general', label: 'General', icon: StickyNote, color: 'bg-slate-100 text-slate-700' },
  { value: 'meeting', label: 'Meeting', icon: Users, color: 'bg-blue-100 text-blue-700' },
  { value: 'decision', label: 'Decision', icon: CheckCircle, color: 'bg-green-100 text-green-700' },
  { value: 'risk', label: 'Risk', icon: AlertTriangle, color: 'bg-red-100 text-red-700' },
  { value: 'follow_up', label: 'Follow-up', icon: ArrowRight, color: 'bg-purple-100 text-purple-700' },
  { value: 'escalation', label: 'Escalation', icon: AlertTriangle, color: 'bg-orange-100 text-orange-700' }
];

export function ClientStructuredNotesTab({ tenantId, clientId }: ClientStructuredNotesTabProps) {
  const { notes, loading, createNote, updateNote, deleteNote, refresh } = useNotes({
    parentType: 'tenant',
    parentId: tenantId,
    tenantId
  });
  const { createItem: createActionItem } = useClientActionItems(tenantId, clientId);
  
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [isConvertDialogOpen, setIsConvertDialogOpen] = useState(false);
  const [selectedNote, setSelectedNote] = useState<Note | null>(null);
  const [saving, setSaving] = useState(false);
  
  // Form state
  const [noteType, setNoteType] = useState('general');
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [tags, setTags] = useState<string[]>([]);
  const [tagInput, setTagInput] = useState('');
  const [isPinned, setIsPinned] = useState(false);
  
  // Convert to action item state
  const [actionTitle, setActionTitle] = useState('');
  const [actionDescription, setActionDescription] = useState('');

  const resetForm = () => {
    setNoteType('general');
    setTitle('');
    setContent('');
    setTags([]);
    setTagInput('');
    setIsPinned(false);
    setSelectedNote(null);
  };

  const handleOpenAdd = () => {
    resetForm();
    setIsAddDialogOpen(true);
  };

  const handleOpenEdit = (note: Note) => {
    setSelectedNote(note);
    setNoteType(note.note_type || 'general');
    setTitle(note.title || '');
    setContent(note.note_details);
    setTags(note.tags || []);
    setIsPinned(note.is_pinned);
    setIsAddDialogOpen(true);
  };

  const handleSave = async () => {
    if (!content.trim()) return;
    
    setSaving(true);
    try {
      if (selectedNote) {
        await updateNote(selectedNote.id, {
          note_type: noteType,
          title: title || null,
          note_details: content,
          tags,
          is_pinned: isPinned
        });
      } else {
        await createNote({
          note_type: noteType,
          title: title || undefined,
          note_details: content,
          tags,
          is_pinned: isPinned
        });
      }
      setIsAddDialogOpen(false);
      resetForm();
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!selectedNote) return;
    await deleteNote(selectedNote.id);
    setIsDeleteDialogOpen(false);
    setSelectedNote(null);
  };

  const handleAddTag = () => {
    if (tagInput.trim() && !tags.includes(tagInput.trim())) {
      setTags([...tags, tagInput.trim()]);
      setTagInput('');
    }
  };

  const handleRemoveTag = (tag: string) => {
    setTags(tags.filter(t => t !== tag));
  };

  const handleOpenConvert = (note: Note) => {
    setSelectedNote(note);
    setActionTitle(note.title || `Follow-up: ${note.note_details.substring(0, 50)}...`);
    setActionDescription(note.note_details);
    setIsConvertDialogOpen(true);
  };

  const handleConvertToAction = async () => {
    if (!selectedNote || !actionTitle.trim()) return;
    
    setSaving(true);
    try {
      await createActionItem({
        title: actionTitle,
        description: actionDescription,
        source: 'note',
        source_note_id: selectedNote.id
      });
      setIsConvertDialogOpen(false);
      setSelectedNote(null);
    } finally {
      setSaving(false);
    }
  };

  const getNoteTypeConfig = (type: string) => {
    return NOTE_TYPES.find(t => t.value === type) || NOTE_TYPES[0];
  };

  if (loading && notes.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <StickyNote className="h-5 w-5" />
            Structured Notes
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {[1, 2, 3].map(i => (
              <Skeleton key={i} className="h-24 w-full" />
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2">
              <StickyNote className="h-5 w-5" />
              Structured Notes
              <Badge variant="secondary" className="ml-2">{notes.length}</Badge>
            </CardTitle>
            <Button size="sm" onClick={handleOpenAdd}>
              <Plus className="h-4 w-4 mr-1" />
              Add Note
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {notes.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <StickyNote className="h-10 w-10 mx-auto mb-3 opacity-50" />
              <p>No notes yet</p>
              <p className="text-sm mt-1">Create notes to track meetings, decisions, and follow-ups</p>
              <Button size="sm" className="mt-4" onClick={handleOpenAdd}>
                <Plus className="h-4 w-4 mr-1" />
                Create First Note
              </Button>
            </div>
          ) : (
            <ScrollArea className="h-[500px]">
              <div className="space-y-3">
                {notes.map(note => {
                  const typeConfig = getNoteTypeConfig(note.note_type);
                  const TypeIcon = typeConfig.icon;
                  
                  return (
                    <div 
                      key={note.id} 
                      className={`p-4 rounded-lg border bg-card hover:bg-muted/30 transition-colors ${
                        note.is_pinned ? 'border-primary/50 bg-primary/5' : ''
                      }`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex items-start gap-3 flex-1 min-w-0">
                          <div className={`p-2 rounded-lg shrink-0 ${typeConfig.color}`}>
                            <TypeIcon className="h-4 w-4" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              {note.is_pinned && (
                                <Pin className="h-3 w-3 text-primary shrink-0" />
                              )}
                              {note.title && (
                                <span className="font-medium">{note.title}</span>
                              )}
                              <Badge variant="outline" className="text-xs">
                                {typeConfig.label}
                              </Badge>
                            </div>
                            <p className="text-sm text-muted-foreground mt-1 line-clamp-3">
                              {note.note_details}
                            </p>
                            
                            {/* Tags */}
                            {note.tags.length > 0 && (
                              <div className="flex items-center gap-1 mt-2 flex-wrap">
                                <Tag className="h-3 w-3 text-muted-foreground" />
                                {note.tags.map(tag => (
                                  <Badge key={tag} variant="secondary" className="text-xs">
                                    {tag}
                                  </Badge>
                                ))}
                              </div>
                            )}
                            
                            {/* Meta */}
                            <div className="flex items-center gap-3 mt-2 text-xs text-muted-foreground">
                              <span className="flex items-center gap-1">
                                <Clock className="h-3 w-3" />
                                {formatDistanceToNow(new Date(note.created_at), { addSuffix: true })}
                              </span>
                              {note.creator && (
                                <span className="flex items-center gap-1">
                                  <Avatar className="h-4 w-4">
                                    <AvatarImage src={note.creator.avatar_url || undefined} />
                                    <AvatarFallback className="text-[8px]">
                                      {note.creator.first_name?.[0]}{note.creator.last_name?.[0]}
                                    </AvatarFallback>
                                  </Avatar>
                                  {note.creator.first_name}
                                </span>
                              )}
                            </div>
                          </div>
                        </div>
                        
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0">
                              <MoreHorizontal className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={() => handleOpenEdit(note)}>
                              <Edit className="h-4 w-4 mr-2" />
                              Edit
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => handleOpenConvert(note)}>
                              <ArrowRight className="h-4 w-4 mr-2" />
                              Convert to Action
                            </DropdownMenuItem>
                            <DropdownMenuItem 
                              onClick={() => {
                                setSelectedNote(note);
                                setIsDeleteDialogOpen(true);
                              }}
                              className="text-destructive"
                            >
                              <Trash2 className="h-4 w-4 mr-2" />
                              Delete
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                    </div>
                  );
                })}
              </div>
            </ScrollArea>
          )}
        </CardContent>
      </Card>

      {/* Add/Edit Note Dialog */}
      <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>
              {selectedNote ? 'Edit Note' : 'Add Note'}
            </DialogTitle>
          </DialogHeader>
          
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Type</Label>
                <Select value={noteType} onValueChange={setNoteType}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {NOTE_TYPES.map(type => (
                      <SelectItem key={type.value} value={type.value}>
                        <span className="flex items-center gap-2">
                          <type.icon className="h-4 w-4" />
                          {type.label}
                        </span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              
              <div className="space-y-2">
                <Label>Title (optional)</Label>
                <Input 
                  value={title}
                  onChange={e => setTitle(e.target.value)}
                  placeholder="Note title..."
                />
              </div>
            </div>
            
            <div className="space-y-2">
              <Label>Content *</Label>
              <Textarea 
                value={content}
                onChange={e => setContent(e.target.value)}
                placeholder="Write your note..."
                rows={4}
              />
            </div>
            
            <div className="space-y-2">
              <Label>Tags</Label>
              <div className="flex gap-2">
                <Input 
                  value={tagInput}
                  onChange={e => setTagInput(e.target.value)}
                  placeholder="Add tag..."
                  onKeyDown={e => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      handleAddTag();
                    }
                  }}
                />
                <Button type="button" variant="outline" onClick={handleAddTag}>
                  Add
                </Button>
              </div>
              {tags.length > 0 && (
                <div className="flex flex-wrap gap-1 mt-2">
                  {tags.map(tag => (
                    <Badge key={tag} variant="secondary" className="cursor-pointer" onClick={() => handleRemoveTag(tag)}>
                      {tag} ×
                    </Badge>
                  ))}
                </div>
              )}
            </div>
            
            <div className="flex items-center gap-2">
              <Switch 
                id="pinned"
                checked={isPinned}
                onCheckedChange={setIsPinned}
              />
              <Label htmlFor="pinned" className="cursor-pointer">Pin this note</Label>
            </div>
          </div>
          
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsAddDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleSave} disabled={!content.trim() || saving}>
              {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              {selectedNote ? 'Save Changes' : 'Create Note'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <AlertDialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
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

      {/* Convert to Action Item Dialog */}
      <Dialog open={isConvertDialogOpen} onOpenChange={setIsConvertDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Convert to Action Item</DialogTitle>
          </DialogHeader>
          
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Title *</Label>
              <Input 
                value={actionTitle}
                onChange={e => setActionTitle(e.target.value)}
                placeholder="Action item title..."
              />
            </div>
            
            <div className="space-y-2">
              <Label>Description</Label>
              <Textarea 
                value={actionDescription}
                onChange={e => setActionDescription(e.target.value)}
                placeholder="Description..."
                rows={3}
              />
            </div>
          </div>
          
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsConvertDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleConvertToAction} disabled={!actionTitle.trim() || saving}>
              {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Create Action Item
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
