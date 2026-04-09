import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Pin } from 'lucide-react';
import DOMPurify from 'dompurify';

interface PackagePinnedNoteProps {
  tenantId: number;
  packageInstanceId: number;
}

interface PinnedNote {
  id: string;
  title: string | null;
  note_details: string;
}

export function PackagePinnedNote({ tenantId, packageInstanceId }: PackagePinnedNoteProps) {
  const [note, setNote] = useState<PinnedNote | null>(null);

  useEffect(() => {
    supabase
      .from('notes')
      .select('id, title, note_details')
      .eq('tenant_id', tenantId)
      .eq('parent_type', 'package_instance')
      .eq('parent_id', packageInstanceId)
      .eq('is_pinned', true)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()
      .then(({ data }) => {
        if (data) setNote(data as PinnedNote);
      });
  }, [tenantId, packageInstanceId]);

  if (!note) return null;

  const plainText = DOMPurify.sanitize(note.note_details || '', { ALLOWED_TAGS: [] });
  const preview = plainText.length > 200 ? plainText.slice(0, 200) + '…' : plainText;

  return (
    <div className="flex items-start gap-2 p-2.5 rounded-lg border border-primary/30 bg-primary/5 text-sm">
      <Pin className="h-3.5 w-3.5 text-primary shrink-0 mt-0.5" />
      <div className="min-w-0">
        <span className="font-medium text-primary">Pinned Note: </span>
        <span className="font-medium text-foreground">{note.title || 'Untitled'}</span>
        {preview && (
          <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{preview}</p>
        )}
      </div>
    </div>
  );
}
