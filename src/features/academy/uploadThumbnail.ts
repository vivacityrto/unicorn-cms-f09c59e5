import { supabase } from "@/integrations/supabase/client";

const ALLOWED_THUMBNAIL_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
const MAX_THUMBNAIL_BYTES = 5 * 1024 * 1024;

export interface ThumbnailUploadResult {
  ok: boolean;
  url: string | null;
  error: string | null;
}

/**
 * Validates and uploads a course/banner thumbnail to the academy-thumbnails
 * storage bucket, returning its public URL. Verbatim behavior preserved
 * from AcademyAddCoursePage.tsx's inline uploadThumbnailFile: JPG/PNG/WebP
 * only, 5 MB max, uploaded under `pending/<prefix><uuid>.<ext>`.
 */
export async function uploadThumbnail(file: File, prefix: string): Promise<ThumbnailUploadResult> {
  if (!ALLOWED_THUMBNAIL_TYPES.has(file.type)) {
    return { ok: false, url: null, error: "Choose a JPG, PNG, or WebP image" };
  }
  if (file.size > MAX_THUMBNAIL_BYTES) {
    return { ok: false, url: null, error: "Thumbnail images must be 5 MB or smaller" };
  }
  try {
    const extension = file.type.split("/")[1] === "jpeg" ? "jpg" : file.type.split("/")[1];
    const path = `pending/${prefix}${crypto.randomUUID()}.${extension}`;
    const { error } = await supabase.storage
      .from("academy-thumbnails")
      .upload(path, file, { contentType: file.type, upsert: false, cacheControl: "3600" });
    if (error) throw error;
    const url = supabase.storage.from("academy-thumbnails").getPublicUrl(path).data.publicUrl;
    return { ok: true, url, error: null };
  } catch (error: unknown) {
    return { ok: false, url: null, error: error instanceof Error ? error.message : "Failed to upload image" };
  }
}
