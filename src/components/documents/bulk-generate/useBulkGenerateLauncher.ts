import { supabase } from "@/integrations/supabase/client";
import { FunctionsHttpError } from "@supabase/supabase-js";

export type PreviewRow = {
  eligible_count: number;
  distinct_tenants: number;
  distinct_packages: number;
  distinct_stages: number;
  distinct_documents: number;
  fully_provisioned_tenants: number;
  needs_provisioning_tenants: number;
  missing_shared_tenants: number;
  missing_governance_tenants: number;
};

export type LauncherFilters = {
  scope: "all" | "selected";
  tenant_ids?: number[] | null;
  package_ids?: number[] | null;
  stage_ids?: number[] | null;
  document_ids?: number[] | null;
};

async function invokeLauncher<T>(body: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke(
    "bulk-generate-documents-launcher",
    { body },
  );
  if (error) {
    let details = error.message;
    if (error instanceof FunctionsHttpError) {
      try {
        details = await error.context.text();
      } catch {
        // ignore
      }
    }
    throw new Error(details);
  }
  return data as T;
}

export function launcherPreview(filters: LauncherFilters): Promise<PreviewRow> {
  return invokeLauncher<PreviewRow>({ action: "preview", ...filters });
}

export function launcherCreate(
  filters: LauncherFilters,
): Promise<{ job_id: string }> {
  return invokeLauncher<{ job_id: string }>({ action: "create", ...filters });
}

export function launcherCancel(
  job_id: string,
  reason?: string,
): Promise<{ ok: boolean; result: unknown }> {
  return invokeLauncher<{ ok: boolean; result: unknown }>({
    action: "cancel",
    job_id,
    reason,
  });
}

export function launcherResume(
  job_id: string,
): Promise<{ ok: boolean; job: Record<string, unknown> | null }> {
  return invokeLauncher<{ ok: boolean; job: Record<string, unknown> | null }>({
    action: "resume",
    job_id,
  });
}
