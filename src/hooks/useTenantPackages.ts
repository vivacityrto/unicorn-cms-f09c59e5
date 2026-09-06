import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface TenantPackageInfo {
  id: number;
  name: string;
  full_text: string | null;
  slug: string | null;
}

export interface TenantPackagesData {
  all_packages: TenantPackageInfo[];
  next_renewal_date: string | null;
  hours_used_minutes: number;
  hours_included_minutes: number;
}

export type TenantPackagesMap = Record<number, TenantPackagesData>;

/**
 * Aggregates active package instances, package metadata, and burndown
 * minutes for a list of tenants. Returns a map keyed by tenant_id.
 */
export function useTenantPackages(tenantIds: number[]) {
  // Stable key: sort to avoid spurious refetches when the order changes.
  const sortedIds = [...tenantIds].sort((a, b) => a - b);

  return useQuery({
    queryKey: ["tenants", "packages", sortedIds],
    enabled: sortedIds.length > 0,
    staleTime: 3 * 60 * 1000,
    queryFn: async (): Promise<TenantPackagesMap> => {
      const { data: piData, error: piErr } = await supabase
        .from("package_instances")
        .select("id, tenant_id, package_id, next_renewal_date, included_minutes, hours_included, hours_added, hours_used, parent_instance_id, is_complete")
        .eq("is_complete", false)
        .in("tenant_id", sortedIds);
      if (piErr) throw piErr;

      const packageIds = [...new Set((piData || []).map(pi => pi.package_id).filter(Boolean) as number[])];
      const { data: packagesData } = packageIds.length > 0
        ? await supabase
            .from("packages")
            .select("id, name, full_text, slug, package_type")
            .in("id", packageIds)
        : { data: [] };

      const packageLookup = (packagesData || []).reduce((acc, pkg) => {
        acc[pkg.id] = { name: pkg.name, full_text: pkg.full_text, slug: pkg.slug, package_type: pkg.package_type };
        return acc;
      }, {} as Record<number, { name: string; full_text: string | null; slug: string | null; package_type: string | null }>);

      const allPackagesMap: Record<number, TenantPackageInfo[]> = {};
      const renewalMap: Record<number, string> = {};
      const includedMap: Record<number, number> = {};
      const usedMap: Record<number, number> = {};

      (piData || []).forEach((pi) => {
        if (pi.package_id && packageLookup[pi.package_id]) {
          const pkg = packageLookup[pi.package_id];
          if (!allPackagesMap[pi.tenant_id]) allPackagesMap[pi.tenant_id] = [];
          if (!allPackagesMap[pi.tenant_id].some(p => p.id === pi.package_id)) {
            allPackagesMap[pi.tenant_id].push({
              id: pi.package_id,
              name: pkg.name,
              full_text: pkg.full_text,
              slug: pkg.slug,
            });
          }
          if (pi.next_renewal_date && pkg.package_type !== "regulatory_submission") {
            if (!renewalMap[pi.tenant_id] || pi.next_renewal_date < renewalMap[pi.tenant_id]) {
              renewalMap[pi.tenant_id] = pi.next_renewal_date;
            }
          }
        }

        // Included: every active instance (parent AND child) contributes its own
        // allowance — base included_minutes plus any hours_added top-up. Matches
        // rpc_get_package_usage / v_package_burndown.
        const baseMins = pi.included_minutes || ((pi.hours_included || 0) * 60);
        const addedMins = (pi.hours_added || 0) * 60;
        includedMap[pi.tenant_id] = (includedMap[pi.tenant_id] || 0) + baseMins + addedMins;

        // Used: only top-level instances. The DB trigger already rolls each child's
        // usage into its parent's hours_used, so adding children would double-count.
        if (!pi.parent_instance_id) {
          let usedMins = Math.round(Number(pi.hours_used || 0) * 60);
          if (usedMins < 0) {
            console.warn(
              `[useTenantPackages] Negative hours_used on package_instance ${pi.id} (tenant ${pi.tenant_id}): ${pi.hours_used}. Clamping to 0.`
            );
            usedMins = 0;
          }
          usedMap[pi.tenant_id] = (usedMap[pi.tenant_id] || 0) + usedMins;
        }
      });

      const result: TenantPackagesMap = {};
      sortedIds.forEach(id => {
        result[id] = {
          all_packages: allPackagesMap[id] || [],
          next_renewal_date: renewalMap[id] || null,
          hours_used_minutes: usedMap[id] || 0,
          hours_included_minutes: includedMap[id] || 0,
        };
      });
      return result;
    },
  });
}
