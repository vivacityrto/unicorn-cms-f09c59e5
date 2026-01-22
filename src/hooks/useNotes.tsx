import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

export type NoteParentType = 'tenant' | 'package_instance' | 'stage' | 'document';

export interface Note {
  id: string;
  tenant_id: number;
  parent_type: string;
  parent_id: number;
  parent_uuid: string | null;
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
}

interface UseNotesParams {
  parentType: NoteParentType;
  parentId: number;
  tenantId: number;
}

export function useNotes({ parentType, parentId, tenantId }: UseNotesParams) {
  const [notes, setNotes] = useState<Note[]>([]);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();

  const fetchNotes = useCallback(async () => {
    if (!tenantId || !parentId) {
      setNotes([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('notes')
        .select('*')
        .eq('tenant_id', tenantId)
        .eq('parent_type', parentType)
        .eq('parent_id', parentId)
        .order('is_pinned', { ascending: false })
        .order('created_at', { ascending: false });

      if (error) throw error;

      // Fetch creator details for each note
      const notesWithCreators: Note[] = [];
      for (const note of data || []) {
        let creator = null;
        if (note.created_by) {
          const { data: userData } = await supabase
            .from('users')
            .select('first_name, last_name, avatar_url')
            .eq('user_uuid', note.created_by)
            .single();
          creator = userData;
        }
        notesWithCreators.push({
          ...note,
          tags: note.tags || [],
          uploaded_files: note.uploaded_files || [],
          file_names: note.file_names || [],
          assignees: note.assignees || [],
          creator
        });
      }

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
  }, [tenantId, parentType, parentId, toast]);

  useEffect(() => {
    fetchNotes();
  }, [fetchNotes]);

  const createNote = async (input: CreateNoteInput): Promise<string | null> => {
    try {
      const { data: userData } = await supabase.auth.getUser();
      if (!userData.user) throw new Error('Not authenticated');

      const { data, error } = await supabase
        .from('notes')
        .insert({
          tenant_id: tenantId,
          parent_type: parentType,
          parent_id: parentId,
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

  // Get pinned notes separately
  const pinnedNotes = notes.filter(n => n.is_pinned);
  const unpinnedNotes = notes.filter(n => !n.is_pinned);

  return {
    notes,
    pinnedNotes,
    unpinnedNotes,
    loading,
    createNote,
    updateNote,
    deleteNote,
    togglePin,
    refresh: fetchNotes
  };
}
