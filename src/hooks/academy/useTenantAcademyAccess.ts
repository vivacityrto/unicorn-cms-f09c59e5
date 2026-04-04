import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

const TENANT_KEY = "academy-tenant-access";

export interface TenantRow {
  id: number;
  name: string;
  academy_access_enabled: boolean;
  academy_max_users: number | null;
  academy_subscription_expires_at: string | null;
  metadata: Record<string, any> | null;
  enrolled_count: number;
}

export interface AutoEnrolRule {
  id: number;
  package_id: number;
  course_id: number;
  is_active: boolean;
  package_name: string | null;
  course_title: string | null;
}

export function useTenantSummaries() {
  return useQuery<TenantRow[]>({
    queryKey: [TENANT_KEY],
    queryFn: async () => {
      const { data: tenantData, error } = await supabase
        .from("tenants")
        .select("id, name, academy_access_enabled, academy_max_users, academy_subscription_expires_at, metadata")
        .order("name");
      if (error) throw error;

      const { data: enrolData } = await supabase
        .from("academy_enrollments")
        .select("tenant_id")
        .eq("status", "active");

      const countMap = new Map<number, number>();
      (enrolData ?? []).forEach((e: any) => {
        countMap.set(e.tenant_id, (countMap.get(e.tenant_id) || 0) + 1);
      });

      return (tenantData ?? []).map((t: any) => ({
        id: t.id,
        name: t.name ?? `Tenant ${t.id}`,
        academy_access_enabled: t.academy_access_enabled ?? false,
        academy_max_users: t.academy_max_users,
        academy_subscription_expires_at: t.academy_subscription_expires_at,
        metadata: t.metadata as Record<string, any> | null,
        enrolled_count: countMap.get(t.id) || 0,
      }));
    },
    staleTime: 30_000,
  });
}

export function useToggleTenantAccess() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, enabled }: { id: number; enabled: boolean }) => {
      const { error } = await supabase
        .from("tenants")
        .update({ academy_access_enabled: enabled } as any)
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: (_, vars) => {
      toast.success(`Academy access ${vars.enabled ? "enabled" : "disabled"}`);
      qc.invalidateQueries({ queryKey: [TENANT_KEY] });
    },
    onError: () => toast.error("Failed to update access"),
  });
}

export function useUpdateTenantAccess() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ tenantId, data }: {
      tenantId: number;
      data: {
        academy_access_enabled?: boolean;
        academy_max_users?: number | null;
        academy_subscription_expires_at?: string | null;
        metadata?: Record<string, any>;
      };
    }) => {
      const { error } = await supabase
        .from("tenants")
        .update(data as any)
        .eq("id", tenantId);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Academy settings saved");
      qc.invalidateQueries({ queryKey: [TENANT_KEY] });
    },
    onError: () => toast.error("Failed to save settings"),
  });
}

export function usePackageCourseRules(enabled: boolean) {
  return useQuery<AutoEnrolRule[]>({
    queryKey: ["academy-auto-enrol-rules"],
    enabled,
    queryFn: async () => {
      const { data: rules } = await supabase
        .from("academy_package_course_rules")
        .select("id, package_id, course_id, is_active")
        .eq("is_active", true);

      if (!rules?.length) return [];

      const packageIds = [...new Set(rules.map((r: any) => r.package_id))];
      const courseIds = [...new Set(rules.map((r: any) => r.course_id))];

      const [{ data: pkgs }, { data: courses }] = await Promise.all([
        supabase.from("packages").select("id, name").in("id", packageIds),
        supabase.from("academy_courses").select("id, title").in("id", courseIds),
      ]);

      const pkgMap = new Map((pkgs ?? []).map((p: any) => [p.id, p.name]));
      const courseMap = new Map((courses ?? []).map((c: any) => [c.id, c.title]));

      return rules.map((r: any) => ({
        id: r.id,
        package_id: r.package_id,
        course_id: r.course_id,
        is_active: r.is_active,
        package_name: pkgMap.get(r.package_id) ?? `Package ${r.package_id}`,
        course_title: courseMap.get(r.course_id) ?? `Course ${r.course_id}`,
      }));
    },
    staleTime: 30_000,
  });
}

export function useAddPackageCourseRule() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ packageId, courseId }: { packageId: number; courseId: number }) => {
      const { error } = await supabase.from("academy_package_course_rules").insert({
        package_id: packageId,
        course_id: courseId,
        is_active: true,
      } as any);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Auto-enrol rule added");
      qc.invalidateQueries({ queryKey: ["academy-auto-enrol-rules"] });
    },
    onError: () => toast.error("Failed to add rule"),
  });
}

export function useRemovePackageCourseRule() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (ruleId: number) => {
      const { error } = await supabase
        .from("academy_package_course_rules")
        .update({ is_active: false } as any)
        .eq("id", ruleId);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Rule removed");
      qc.invalidateQueries({ queryKey: ["academy-auto-enrol-rules"] });
    },
  });
}

/** Packages and courses lists for the add-rule form */
export function useRuleFormOptions(enabled: boolean) {
  const packagesQuery = useQuery({
    queryKey: ["packages-list"],
    enabled,
    queryFn: async () => {
      const { data } = await supabase.from("packages").select("id, name").order("name");
      return data ?? [];
    },
  });

  const coursesQuery = useQuery({
    queryKey: ["courses-list"],
    enabled,
    queryFn: async () => {
      const { data } = await supabase.from("academy_courses").select("id, title").eq("status", "published").order("title");
      return data ?? [];
    },
  });

  return { packages: packagesQuery.data ?? [], courses: coursesQuery.data ?? [] };
}
