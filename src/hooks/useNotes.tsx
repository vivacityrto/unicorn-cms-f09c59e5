import { useState, useEffect, useCallback, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

export type NoteParentType = 'tenant' | 'package_instance' | 'stage' | 'document';

export interface Note {
  id: string;
  tenant_id: number;
  parent_type: string;
  parent_id: number;
  parent_uuid: string | null;
  package_id: number | null;
  title: string | null;
  note_details: string;
  note_type: string | null;
  priority: string | null;
  is_pinned: boolean;
  tags: string[];
  started_date: string | null;
  completed_date: string | null;
  duration: number;
  uploaded_files: string[];
  file_names: string[];
  assignees: string[];
  created_by: string;
  created_at: string;
  updated_at: string;
  creator?: {
    first_name: string | null;
    last_name: string | null;
    avatar_url: string | null;
    email?: string | null;
  };
}

export interface CreateNoteInput {
  title?: string;
  note_details: string;
  note_type?: string;
  priority?: string;
  is_pinned?: boolean;
  tags?: string[];
  started_date?: string;
  completed_date?: string;
  duration?: number;
  uploaded_files?: string[];
  file_names?: string[];
  assignees?: string[];
  package_id?: number | null;
  parent_type_override?: NoteParentType;
  parent_id_override?: number;
}

export interface UpdateNoteInput {
  title?: string | null;
  note_details?: string;
  note_type?: string | null;
  priority?: string | null;
  is_pinned?: boolean;
  tags?: string[];
  started_date?: string | null;
  completed_date?: string | null;
  duration?: number;
  uploaded_files?: string[];
  file_names?: string[];
  assignees?: string[];
  package_id?: number | null;
}

export interface NotesFilterOptions {
  searchQuery?: string;
  priority?: string;
  noteType?: string;
  packageId?: number | null;
}

interface UseNotesParams {
  parentType: NoteParentType | NoteParentType[];
  parentId: number;
  tenantId: number;
  packageId?: number | null;
}

// Helper: Calculate total duration in minutes from notes
export function calculateTotalDuration(notes: Note[]): number {
  return notes.reduce((sum, note) => {
    if (note.started_date && note.completed_date) {
      const start = new Date(note.started_date);
      const end = new Date(note.completed_date);
      const diffMs = end.getTime() - start.getTime();
      const diffMins = Math.floor(diffMs / 60000);
      return sum + (diffMins > 0 ? diffMins : 0);
    }
    return sum;
  }, 0);
}

// Helper: Format duration in minutes to human-readable string
export function formatDuration(minutes: number): string {
  if (minutes <= 0) return '0 mins';
  
  const days = Math.floor(minutes / 1440);
  const hours = Math.floor((minutes % 1440) / 60);
  const mins = minutes % 60;
  
  const parts: string[] = [];
  if (days > 0) parts.push(`${days} day${days > 1 ? 's' : ''}`);
  if (hours > 0) parts.push(`${hours} hour${hours > 1 ? 's' : ''}`);
  if (mins > 0) parts.push(`${mins} min${mins > 1 ? 's' : ''}`);
  
  return parts.length > 0 ? parts.join(' ') : '0 mins';
}

// Helper: Format elapsed time in milliseconds
export function formatElapsedTime(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  
  const parts: string[] = [];
  if (days > 0) parts.push(`${days} day${days > 1 ? 's' : ''}`);
  if (hours > 0) parts.push(`${hours} hour${hours > 1 ? 's' : ''}`);
  if (minutes > 0) parts.push(`${minutes} min${minutes > 1 ? 's' : ''}`);
  if (seconds > 0 || parts.length === 0) parts.push(`${seconds} sec${seconds > 1 ? 's' : ''}`);
  
  return parts.join(' ');
}

// Helper: Filter notes based on options
export function filterNotes(notes: Note[], options: NotesFilterOptions): Note[] {
  let filtered = [...notes];
  
  if (options.searchQuery) {
    const query = options.searchQuery.toLowerCase();
    filtered = filtered.filter(note => 
      note.note_details.toLowerCase().includes(query) ||
      note.note_type?.toLowerCase().includes(query) ||
      note.title?.toLowerCase().includes(query) ||
      note.creator?.first_name?.toLowerCase().includes(query) ||
      note.creator?.last_name?.toLowerCase().includes(query) ||
      note.creator?.email?.toLowerCase().includes(query)
    );
  }
  
  if (options.priority && options.priority !== 'all') {
    filtered = filtered.filter(note => note.priority === options.priority);
  }
  
  if (options.noteType && options.noteType !== 'all') {
    filtered = filtered.filter(note => note.note_type === options.noteType);
  }
  
  if (options.packageId) {
    filtered = filtered.filter(note => note.package_id === options.packageId);
  }
  
  return filtered;
}

// Helper: Sort notes by priority
export function sortNotesByPriority(notes: Note[]): Note[] {
  const priorityOrder: Record<string, number> = { urgent: 0, high: 1, normal: 2, low: 3 };
  
  return [...notes].sort((a, b) => {
    const aPriority = priorityOrder[a.priority || ''] ?? 4;
    const bPriority = priorityOrder[b.priority || ''] ?? 4;
    return aPriority - bPriority;
  });
}

export function useNotes({ parentType, parentId, tenantId, packageId }: UseNotesParams) {
  const [notes, setNotes] = useState<Note[]>([]);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();
  
  // Serialize parentType for stable dependency comparison
  const parentTypeKey = Array.isArray(parentType) ? parentType.join(',') : parentType;

  const fetchNotes = useCallback(async () => {
    if (!tenantId || !parentId) {
      setNotes([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      let query = supabase
        .from('notes')
        .select('*')
        .eq('tenant_id', tenantId);
      
      // Handle single or multiple parent types
      if (Array.isArray(parentType)) {
        query = query.in('parent_type', parentType);
      } else {
        query = query.eq('parent_type', parentType).eq('parent_id', parentId);
      }
      
      query = query
        .order('is_pinned', { ascending: false })
        .order('created_at', { ascending: false });
      
      // Filter by package_id if provided
      if (packageId) {
        query = query.eq('package_id', packageId);
      }

      const { data, error } = await query;

      if (error) throw error;

      // Batch fetch creator details (instead of loop)
      const creatorIds = [...new Set((data || []).map(n => n.created_by).filter(Boolean))];
      let creatorsMap = new Map<string, { first_name: string | null; last_name: string | null; avatar_url: string | null; email: string | null }>();
      
      if (creatorIds.length > 0) {
        const { data: usersData } = await supabase
          .from('users')
          .select('user_uuid, first_name, last_name, avatar_url, email')
          .in('user_uuid', creatorIds);
        
        if (usersData) {
          usersData.forEach(user => {
            creatorsMap.set(user.user_uuid, {
              first_name: user.first_name,
              last_name: user.last_name,
              avatar_url: user.avatar_url,
              email: user.email
            });
          });
        }
      }

      const notesWithCreators: Note[] = (data || []).map(note => ({
        ...note,
        package_id: note.package_id || null,
        tags: note.tags || [],
        uploaded_files: note.uploaded_files || [],
        file_names: note.file_names || [],
        assignees: note.assignees || [],
        creator: creatorsMap.get(note.created_by) || undefined
      }));

      setNotes(notesWithCreators);
    } catch (error) {
      console.error('Error fetching notes:', error);
      toast({
        title: 'Error',
        description: 'Failed to load notes',
        variant: 'destructive'
      });
    } finally {
      setLoading(false);
    }
  }, [tenantId, parentTypeKey, parentId, packageId, toast]);

  useEffect(() => {
    fetchNotes();
  }, [fetchNotes]);

  const createNote = async (input: CreateNoteInput): Promise<string | null> => {
    try {
      const { data: userData } = await supabase.auth.getUser();
      if (!userData.user) throw new Error('Not authenticated');

      // For multi-parent-type mode, default to 'tenant' for new notes
      const effectiveParentType = input.parent_type_override || (Array.isArray(parentType) ? 'tenant' : parentType);
      const effectiveParentId = input.parent_id_override || parentId;
      
      const { data, error } = await supabase
        .from('notes')
        .insert({
          tenant_id: tenantId,
          parent_type: effectiveParentType,
          parent_id: effectiveParentId,
          package_id: input.package_id || packageId || null,
          title: input.title || null,
          note_details: input.note_details,
          note_type: input.note_type || 'general',
          priority: input.priority || null,
          is_pinned: input.is_pinned || false,
          tags: input.tags || [],
          started_date: input.started_date || null,
          completed_date: input.completed_date || null,
          duration: input.duration || 0,
          uploaded_files: input.uploaded_files || [],
          file_names: input.file_names || [],
          assignees: input.assignees || [],
          created_by: userData.user.id
        })
        .select('id')
        .single();

      if (error) throw error;

      toast({
        title: 'Note created',
        description: 'Your note has been saved'
      });

      await fetchNotes();
      return data.id;
    } catch (error) {
      console.error('Error creating note:', error);
      toast({
        title: 'Error',
        description: 'Failed to create note',
        variant: 'destructive'
      });
      return null;
    }
  };

  const updateNote = async (id: string, updates: UpdateNoteInput): Promise<void> => {
    try {
      const { error } = await supabase
        .from('notes')
        .update({
          ...updates,
          updated_at: new Date().toISOString()
        })
        .eq('id', id);

      if (error) throw error;

      toast({
        title: 'Note updated',
        description: 'Your changes have been saved'
      });

      await fetchNotes();
    } catch (error) {
      console.error('Error updating note:', error);
      toast({
        title: 'Error',
        description: 'Failed to update note',
        variant: 'destructive'
      });
    }
  };

  const deleteNote = async (id: string): Promise<void> => {
    try {
      const { error } = await supabase
        .from('notes')
        .delete()
        .eq('id', id);

      if (error) throw error;

      toast({
        title: 'Note deleted',
        description: 'The note has been removed'
      });

      await fetchNotes();
    } catch (error) {
      console.error('Error deleting note:', error);
      toast({
        title: 'Error',
        description: 'Failed to delete note',
        variant: 'destructive'
      });
    }
  };

  const togglePin = async (id: string, isPinned: boolean): Promise<void> => {
    await updateNote(id, { is_pinned: !isPinned });
  };

  // Memoized derived states
  const pinnedNotes = useMemo(() => notes.filter(n => n.is_pinned), [notes]);
  const unpinnedNotes = useMemo(() => notes.filter(n => !n.is_pinned), [notes]);
  const totalDuration = useMemo(() => calculateTotalDuration(notes), [notes]);

  return {
    notes,
    pinnedNotes,
    unpinnedNotes,
    loading,
    totalDuration,
    createNote,
    updateNote,
    deleteNote,
    togglePin,
    refresh: fetchNotes
  };
}
