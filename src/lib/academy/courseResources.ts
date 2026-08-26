import { supabase } from "@/integrations/supabase/client";

export const PDF_BUCKET = "resource-pdfs";
export const WORD_BUCKET = "resource-templates";
export const SIGNED_URL_TTL_SECONDS = 600;

export const ALLOWED_UPLOAD_EXTENSIONS = [".pdf", ".doc", ".docx", ".xlsx", ".xls", ".md"] as const;

export const REJECTED_FILE_MESSAGE =
  "Only PDF, Word, Excel, and Markdown documents (.pdf, .doc, .docx, .xlsx, .xls, .md) can be uploaded.";

export type CourseResourceKind = "pdf" | "word" | "excel" | "markdown" | "link";

/**
 * Client-side equivalent of public.can_manage_academy_resources():
 * is_super_admin() OR unicorn_role IN ('Team Leader', 'Team Member').
 * Intentionally narrower than academy.builder.edit (which also grants BGT).
 */
export function canManageAcademyResources(
  unicornRole: string | null | undefined,
  isSuperAdmin: boolean,
): boolean {
  return isSuperAdmin || unicornRole === "Team Leader" || unicornRole === "Team Member";
}

export function fileExtension(filename: string): string {
  const i = filename.lastIndexOf(".");
  return i >= 0 ? filename.slice(i).toLowerCase() : "";
}

export function isAllowedUploadFile(file: { name: string }): boolean {
  return (ALLOWED_UPLOAD_EXTENSIONS as readonly string[]).includes(fileExtension(file.name));
}

export function bucketForUpload(file: { name: string }): typeof PDF_BUCKET | typeof WORD_BUCKET {
  return fileExtension(file.name) === ".pdf" ? PDF_BUCKET : WORD_BUCKET;
}

export function mimeForUpload(file: { name: string; type?: string }): string {
  if (file.type) return file.type;
  const ext = fileExtension(file.name);
  if (ext === ".pdf") return "application/pdf";
  if (ext === ".doc") return "application/msword";
  if (ext === ".docx") return "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
  if (ext === ".xls") return "application/vnd.ms-excel";
  if (ext === ".xlsx") return "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
  if (ext === ".md") return "text/markdown";
  return "application/octet-stream";
}

export function storageFilename(filename: string): string {
  return filename.replace(/[/\\]/g, "_").replace(/\0/g, "");
}

export function storagePathForResource(resourceId: string, filename: string): string {
  return `${resourceId}/${storageFilename(filename)}`;
}

export function titleFromFilename(filename: string): string {
  const ext = fileExtension(filename);
  const base = ext ? filename.slice(0, -ext.length) : filename;
  return base.trim() || filename;
}

export function isHttpsUrl(value: string): boolean {
  try {
    const url = new URL(value.trim());
    return url.protocol === "https:";
  } catch {
    return false;
  }
}

export function resourceKind(resource: {
  resource_type?: string | null;
  storage_bucket?: string | null;
  storage_path?: string | null;
  file_url?: string | null;
  file_name?: string | null;
}): CourseResourceKind {
  const type = (resource.resource_type || "").toLowerCase();
  if (type === "link") return "link";

  const bucket = (resource.storage_bucket || "").toLowerCase();
  const path = `${resource.storage_path || ""} ${resource.file_name || ""}`.toLowerCase();
  if (path.includes(".pdf")) return "pdf";
  if (/\.xlsx?\b/.test(path)) return "excel";
  if (/\.md\b/.test(path)) return "markdown";
  if (bucket === PDF_BUCKET) return "pdf";
  if (bucket === WORD_BUCKET || /\.docx?\b/.test(path)) return "word";
  if (type === "file") return "pdf";
  if (resource.file_url && !resource.storage_path) return "link";
  return "pdf";
}

export interface OpenableResource {
  kind: CourseResourceKind;
  resourceType?: string | null;
  fileUrl: string | null;
  storageBucket: string | null;
  storagePath: string | null;
}

export async function openAcademyResource(resource: OpenableResource): Promise<void> {
  if (resource.kind === "link" || resource.resourceType === "link") {
    if (!resource.fileUrl) throw new Error("This link has no URL");
    window.open(resource.fileUrl, "_blank", "noopener,noreferrer");
    return;
  }
  if (!resource.storageBucket || !resource.storagePath) {
    throw new Error("This file is missing storage details");
  }
  const { data, error } = await supabase.storage
    .from(resource.storageBucket)
    .createSignedUrl(resource.storagePath, SIGNED_URL_TTL_SECONDS);
  if (error || !data?.signedUrl) {
    throw new Error(error?.message || "Could not generate a download link");
  }
  window.open(data.signedUrl, "_blank", "noopener,noreferrer");
}
