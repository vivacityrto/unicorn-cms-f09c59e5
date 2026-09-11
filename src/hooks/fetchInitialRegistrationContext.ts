import { supabase } from "@/integrations/supabase/client";

function isInitialRegistrationText(value?: string | null): boolean {
  return !!value && /initial|registration/i.test(value);
}

/**
 * Determines whether a tenant is in an initial-registration context. The
 * caller owns cancellation and state updates; this adapter preserves the
 * existing lifecycle-first and package-fallback query behavior.
 */
export async function fetchInitialRegistrationContext(tenantId: number): Promise<boolean> {
  const { data: tenantRow } = await supabase
    .from("tenants")
    .select("lifecycle_status")
    .eq("id", tenantId)
    .maybeSingle();

  if (isInitialRegistrationText(tenantRow?.lifecycle_status)) {
    return true;
  }

  const { data: packageInstances } = await supabase
    .from("package_instances")
    .select("package_id")
    .eq("tenant_id", tenantId);
  const packageIds = Array.from(
    new Set((packageInstances || []).map((instance) => instance.package_id).filter(Boolean))
  );

  if (packageIds.length === 0) {
    return false;
  }

  const { data: packages } = await supabase
    .from("packages")
    .select("name, slug")
    .in("id", packageIds);

  return (packages || []).some(
    (pkg) => isInitialRegistrationText(pkg?.name) || isInitialRegistrationText(pkg?.slug)
  );
}
