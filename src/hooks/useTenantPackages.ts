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
        .select("id, tenant_id, package_id, next_renewal_date, included_minutes, hours_included, parent_instance_id, is_complete")
        .eq("is_complete", false)
        .in("tenant_id", sortedIds);
      if (piErr) throw piErr;

      const packageIds = [...new Set((piData || []).map(pi => pi.package_id).filter(Boolean) as number[])];
      const { data: packagesData } = packageIds.length > 0
        ? await supabase
            .from("packages")
            .select("id, name, full_text, slug, package_type")
            .in("id", packageIds)
        : { data: [] as any[] };

      const packageLookup = (packagesData || []).reduce((acc, pkg: any) => {
        acc[pkg.id] = { name: pkg.name, full_text: pkg.full_text, slug: pkg.slug, package_type: pkg.package_type };
        return acc;
      }, {} as Record<number, { name: string; full_text: string | null; slug: string | null; package_type: string | null }>);

      const allPackagesMap: Record<number, TenantPackageInfo[]> = {};
      const renewalMap: Record<number, string> = {};
      const includedMap: Record<number, number> = {};
      const activeInstanceIds: number[] = [];

      (piData || []).forEach((pi: any) => {
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
        // Included minutes only for top-level (non add-on) instances.
        if (!pi.parent_instance_id) {
          const mins = pi.included_minutes || ((pi.hours_included || 0) * 60);
          includedMap[pi.tenant_id] = (includedMap[pi.tenant_id] || 0) + mins;
          activeInstanceIds.push(pi.id);
        }
      });

      const usedMap: Record<number, number> = {};
      if (activeInstanceIds.length > 0) {
        const { data: burndown } = await supabase
          .from("v_package_burndown")
          .select("tenant_id, used_minutes, included_minutes, package_instance_id")
          .in("tenant_id", sortedIds)
          .in("package_instance_id", activeInstanceIds);
        const includedFromBurn: Record<number, number> = {};
        (burndown || []).forEach((r: any) => {
          usedMap[r.tenant_id] = (usedMap[r.tenant_id] || 0) + (r.used_minutes || 0);
          includedFromBurn[r.tenant_id] = (includedFromBurn[r.tenant_id] || 0) + (r.included_minutes || 0);
        });
        // Burndown view is authoritative when present.
        Object.keys(includedFromBurn).forEach(tid => {
          includedMap[Number(tid)] = includedFromBurn[Number(tid)];
        });
      }

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
