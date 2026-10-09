import { supabase } from '@/integrations/supabase/client';

const BUCKET = 'tenant-note-files';

export const NOTE_ATTACHMENT_MAX_FILES = 5;
export const NOTE_ATTACHMENT_MAX_BYTES = 10 * 1024 * 1024; // 10 MB

const ALLOWED_EXTENSIONS = new Set([
  'pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 'csv', 'txt', 'png', 'jpg', 'jpeg',
]);

/** Value for an <input type="file" accept> attribute. */
export const NOTE_ATTACHMENT_ACCEPT = Array.from(ALLOWED_EXTENSIONS).map((e) => `.${e}`).join(',');

export const NOTE_ATTACHMENT_HINT = 'PDF, Word, Excel, PowerPoint, CSV, TXT, PNG or JPG. Up to 5 files, 10 MB each.';

export interface NoteAttachmentCheck {
  accepted: File[];
  errors: string[];
}

/**
 * Splits a picked file list into the files that can be attached and a
 * human-readable reason for each one that can't. `currentCount` is the number
 * of files already on the note (existing + newly picked, minus removed).
 */
export function checkNoteAttachments(picked: File[], currentCount: number): NoteAttachmentCheck {
  const accepted: File[] = [];
  const errors: string[] = [];
  for (const file of picked) {
    const ext = file.name.includes('.') ? file.name.split('.').pop()!.toLowerCase() : '';
    if (!ALLOWED_EXTENSIONS.has(ext)) {
      errors.push(`${file.name}: file type not allowed`);
    } else if (file.size > NOTE_ATTACHMENT_MAX_BYTES) {
      errors.push(`${file.name}: larger than 10 MB`);
    } else if (currentCount + accepted.length >= NOTE_ATTACHMENT_MAX_FILES) {
      errors.push(`${file.name}: a note can have at most ${NOTE_ATTACHMENT_MAX_FILES} files`);
    } else {
      accepted.push(file);
    }
  }
  return { accepted, errors };
}

function safeFileName(name: string): string {
  return name.replace(/[^A-Za-z0-9._-]+/g, '_');
}

/**
 * Uploads files to the private tenant-note-files bucket. The first path
 * segment must be the tenant id: the bucket's RLS uses it to decide which
 * client users may read the file.
 */
export async function uploadNoteAttachments(
  tenantId: number,
  files: File[],
): Promise<{ paths: string[]; names: string[] }> {
  const paths: string[] = [];
  const names: string[] = [];
  for (const file of files) {
    const objectPath = `${tenantId}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}-${safeFileName(file.name)}`;
    const { data, error } = await supabase.storage.from(BUCKET).upload(objectPath, file);
    if (error) throw error;
    paths.push(data.path);
    names.push(file.name);
  }
  return { paths, names };
}

/** Existing attachments minus any flagged for removal, plus newly uploaded ones. */
export function mergeNoteAttachments(
  existing: { path: string; name: string }[],
  filesToRemove: string[],
  uploaded: { paths: string[]; names: string[] },
): { paths: string[]; names: string[] } {
  const kept = existing.filter((f) => !filesToRemove.includes(f.path));
  return {
    paths: [...kept.map((f) => f.path), ...uploaded.paths],
    names: [...kept.map((f) => f.name), ...uploaded.names],
  };
}

/** Opens a note attachment in a new tab via a short-lived signed URL. */
export async function openNoteAttachment(path: string): Promise<void> {
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(path, 60 * 5);
  if (error || !data?.signedUrl) throw error ?? new Error('Could not open file');
  window.open(data.signedUrl, '_blank', 'noopener,noreferrer');
}
