import type { SupabaseClient } from "@supabase/supabase-js";

export const ALLOWED_MIME = [
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
] as const;

export const ALLOWED_EXT = [
  "jpg", "jpeg", "png", "gif", "webp",
  "pdf", "doc", "docx", "xls", "xlsx",
] as const;

export const MAX_BYTES = 10 * 1024 * 1024;
export const MAX_FILES_PER_MESSAGE = 5;
export const BUCKET = "message-attachments";
export const SIGNED_URL_TTL_SECONDS = 60 * 60 * 24 * 7;

export interface MessageAttachmentRow {
  id: string;
  message_id: string;
  storage_path: string;
  filename: string;
  mime_type: string | null;
  file_size: number | null;
  created_at: string;
}

export function isImageMime(mime: string | null | undefined): boolean {
  return !!mime && mime.startsWith("image/");
}
export function isPdfMime(mime: string | null | undefined): boolean {
  return mime === "application/pdf";
}
export function isOfficeMime(mime: string | null | undefined): boolean {
  return mime === "application/msword"
    || mime === "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
    || mime === "application/vnd.ms-excel"
    || mime === "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function getExt(name: string): string {
  const i = name.lastIndexOf(".");
  return i >= 0 ? name.slice(i + 1).toLowerCase() : "";
}

export function sanitiseFilename(name: string): string {
  const base = name.replace(/^.*[\\/]/, "");
  const cleaned = base.replace(/[^A-Za-z0-9._-]+/g, "_").replace(/_+/g, "_");
  const trimmed = cleaned.replace(/^_+|_+$/g, "");
  const finalName = trimmed.length ? trimmed : `file_${Date.now()}`;
  return finalName.length > 150 ? finalName.slice(-150) : finalName;
}

export function validateAttachment(file: File): void {
  if (file.size > MAX_BYTES) {
    throw new Error(`"${file.name}" is too large. Maximum size is 10 MB.`);
  }
  const ext = getExt(file.name);
  const extOk = (ALLOWED_EXT as readonly string[]).includes(ext);
  const mimeOk = !!file.type && (ALLOWED_MIME as readonly string[]).includes(file.type);
  if (!extOk || !mimeOk) {
    throw new Error(
      `"${file.name}" is not an allowed file type. Allowed: images (jpg/png/gif/webp), PDF, Word, Excel.`
    );
  }
}

export async function uploadMessageAttachment(
  supabase: SupabaseClient,
  file: File,
  tenantId: string | number,
  conversationId: string,
  messageId: string,
): Promise<MessageAttachmentRow> {
  validateAttachment(file);

  const path = `${tenantId}/${conversationId}/${messageId}/${sanitiseFilename(file.name)}`;

  const { error: upErr } = await supabase
    .storage
    .from(BUCKET)
    .upload(path, file, { contentType: file.type, upsert: false });
  if (upErr) throw upErr;

  const { data, error: insErr } = await supabase
    .from("tenant_message_attachments" as any)
    .insert({
      message_id: messageId,
      storage_path: path,
      filename: file.name,
      mime_type: file.type,
      file_size: file.size,
    } as any)
    .select("*")
    .single();

  if (insErr) {
    // Best-effort cleanup
    await supabase.storage.from(BUCKET).remove([path]).catch(() => {});
    throw insErr;
  }

  return data as MessageAttachmentRow;
}

export async function getAttachmentUrl(
  supabase: SupabaseClient,
  storagePath: string,
): Promise<string> {
  const { data, error } = await supabase
    .storage
    .from(BUCKET)
    .createSignedUrl(storagePath, SIGNED_URL_TTL_SECONDS);
  if (error) throw error;
  if (!data?.signedUrl) throw new Error("Failed to create signed URL");
  return data.signedUrl;
}
