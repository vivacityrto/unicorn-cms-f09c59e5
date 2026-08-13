export const PDF_BUCKET = "resource-pdfs";
export const WORD_BUCKET = "resource-templates";
export const SIGNED_URL_TTL_SECONDS = 600;

export const ALLOWED_UPLOAD_EXTENSIONS = [".pdf", ".doc", ".docx"] as const;

export const REJECTED_FILE_MESSAGE =
  "Only PDF and Word documents (.pdf, .doc, .docx) can be uploaded.";

export type CourseResourceKind = "pdf" | "word" | "link";

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
  if (bucket === PDF_BUCKET || path.includes(".pdf")) return "pdf";
  if (bucket === WORD_BUCKET || /\.docx?\b/.test(path)) return "word";
  if (type === "file") return "pdf";
  if (resource.file_url && !resource.storage_path) return "link";
  return "pdf";
}
