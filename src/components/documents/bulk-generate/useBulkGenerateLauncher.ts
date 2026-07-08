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

async function refreshSessionBestEffort() {
  try {
    await supabase.auth.refreshSession();
  } catch (e) {
    console.warn("[bulk-generate] refreshSession failed; proceeding anyway", e);
  }
}

export function launcherPreview(filters: LauncherFilters): Promise<PreviewRow> {
  return invokeLauncher<PreviewRow>({ action: "preview", ...filters });
}

export async function launcherCreate(
  filters: LauncherFilters,
): Promise<{ job_id: string }> {
  await refreshSessionBestEffort();
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

export function launcherRetry(
  job_id: string,
): Promise<{ ok: boolean; job_id: string }> {
  return invokeLauncher<{ ok: boolean; job_id: string }>({
    action: "retry",
    job_id,
  });
}

export type TargetedSelection = {
  tenant_id: number;
  package_id: number;
  stage_ids: number[];
};

export function launcherPreviewTargeted(
  selections: TargetedSelection[],
  document_ids?: number[] | null,
): Promise<PreviewRow> {
  return invokeLauncher<PreviewRow>({
    action: "preview_targeted",
    selections,
    document_ids: document_ids ?? null,
  });
}

export function launcherCreateTargeted(
  selections: TargetedSelection[],
  document_ids?: number[] | null,
): Promise<{ job_id: string }> {
  return invokeLauncher<{ job_id: string }>({
    action: "create_targeted",
    selections,
    document_ids: document_ids ?? null,
  });
}
