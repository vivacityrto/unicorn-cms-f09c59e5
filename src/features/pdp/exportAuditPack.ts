import { supabase } from "@/integrations/supabase/client";

export interface ExportPdpAuditPackResult {
  staff_count: number;
  filename: string;
}

interface FunctionErrorBody {
  error?: string;
}

async function readFunctionError(
  error: unknown,
): Promise<{ status: number | null; body: FunctionErrorBody | null }> {
  const context = (error as { context?: Response | { response?: Response } } | null)?.context;
  const response = context instanceof Response ? context : context?.response;
  if (!response) return { status: null, body: null };

  try {
    return {
      status: response.status,
      body: (await response.clone().json()) as FunctionErrorBody,
    };
  } catch {
    return { status: response.status, body: null };
  }
}

function slugify(value: string): string {
  const slug = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return slug || "tenant";
}

/** Calendar date in Australia/Sydney as yyyy-MM-dd (filename-safe). */
export function todayDateAU(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Australia/Sydney",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

function triggerPdfDownload(base64: string, filename: string): void {
  const byteCharacters = atob(base64);
  const byteNumbers = new Array(byteCharacters.length);
  for (let i = 0; i < byteCharacters.length; i++) {
    byteNumbers[i] = byteCharacters.charCodeAt(i);
  }
  const blob = new Blob([new Uint8Array(byteNumbers)], { type: "application/pdf" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

export async function exportPdpAuditPack(options: {
  tenantId: number;
  tenantName: string;
  userId?: string;
  staffName?: string;
}): Promise<ExportPdpAuditPackResult> {
  const body: { tenant_id: number; user_id?: string } = {
    tenant_id: options.tenantId,
  };
  if (options.userId) body.user_id = options.userId;

  const { data, error } = await supabase.functions.invoke("export-pdp-audit-pack", {
    body,
  });

  if (error) {
    const { body: errBody } = await readFunctionError(error);
    throw new Error(errBody?.error || error.message || "Export failed");
  }

  if (data && typeof data === "object" && "error" in data && (data as { error?: string }).error) {
    throw new Error(String((data as { error: string }).error));
  }

  const pdf = (data as { pdf?: string } | null)?.pdf;
  const staffCount = Number((data as { staff_count?: number } | null)?.staff_count ?? 0);
  if (!pdf || typeof pdf !== "string") {
    throw new Error("No PDF data returned");
  }

  const today = todayDateAU();
  const tenantSlug = slugify(options.tenantName);
  const filename = options.staffName
    ? `PDP-Audit-Pack-${tenantSlug}-${slugify(options.staffName)}-${today}.pdf`
    : `PDP-Audit-Pack-${tenantSlug}-${today}.pdf`;

  triggerPdfDownload(pdf, filename);

  return { staff_count: staffCount, filename };
}

export async function resolveTenantName(
  tenantId: number,
  fallbackFromRows?: string | null,
): Promise<string> {
  if (fallbackFromRows && fallbackFromRows !== "(Unknown tenant)" && fallbackFromRows !== "(No tenant)") {
    return fallbackFromRows;
  }
  const { data, error } = await supabase
    .from("tenants")
    .select("name")
    .eq("id", tenantId)
    .maybeSingle();
  if (error) throw error;
  return data?.name?.trim() || `tenant-${tenantId}`;
}
