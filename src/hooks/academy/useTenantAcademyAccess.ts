import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import type { Json } from "@/integrations/supabase/types";
import type { VivacityAcademyTier } from "@/lib/tenantAccountSurface";

const TENANT_KEY = "academy-tenant-access";

type AcademySoloAction = "activate" | "suspend" | "reactivate" | "end" | "settings_updated";

type TenantAccessSnapshot = Pick<
  TenantRow,
  "academy_access_enabled" | "academy_max_users" | "academy_subscription_expires_at" | "metadata"
>;

function academySoloAction(
  previousEnabled: boolean,
  nextEnabled: boolean,
  metadata: Json | null | undefined,
): AcademySoloAction {
  if (previousEnabled === nextEnabled) return "settings_updated";
  if (!nextEnabled) return "suspend";
  const previousAction = academySoloStatus(metadata);
  return previousAction === "suspend" || previousAction === "end" ? "reactivate" : "activate";
}

function academySoloStatus(metadata: Json | null | undefined): string | null {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) return null;
  const solo = (metadata as Record<string, unknown>).academy_solo;
  if (!solo || typeof solo !== "object" || Array.isArray(solo)) return null;
  const status = (solo as Record<string, unknown>).status;
  return typeof status === "string" ? status : null;
}

function academyNotes(metadata: Json | null | undefined): string | null {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) return null;
  const value = (metadata as Record<string, unknown>).academy_notes;
  return typeof value === "string" ? value : null;
}

async function manageAcademySoloAccess(
  tenantId: number,
  requested: {
    lifecycleAction?: AcademySoloAction;
    academy_access_enabled?: boolean;
    academy_tier?: VivacityAcademyTier | null;
    academy_max_users?: number | null;
    academy_subscription_expires_at?: string | null;
    metadata?: Json;
  },
) {
  const { data: current, error: currentError } = await supabase
    .from("tenants")
    .select("academy_access_enabled, academy_max_users, academy_subscription_expires_at, metadata")
    .eq("id", tenantId)
    .single();
  if (currentError) throw currentError;

  const snapshot = current as TenantAccessSnapshot;
  const enabled = requested.academy_access_enabled ?? snapshot.academy_access_enabled ?? false;
  const metadata = requested.metadata ?? snapshot.metadata;
  const tier = requested.academy_tier !== undefined
    ? requested.academy_tier
    : academyTierFromMetadata(snapshot.metadata);
  const { error } = await supabase.rpc("manage_academy_solo_access", {
    p_tenant_id: tenantId,
    p_action: requested.lifecycleAction ?? academySoloAction(
      snapshot.academy_access_enabled ?? false,
      enabled,
      snapshot.metadata,
    ),
    p_enabled: enabled,
    p_max_users: requested.academy_max_users !== undefined
      ? requested.academy_max_users
      : snapshot.academy_max_users,
    p_expires_at: requested.academy_subscription_expires_at !== undefined
      ? requested.academy_subscription_expires_at
      : snapshot.academy_subscription_expires_at,
    p_notes: academyNotes(metadata),
    p_academy_tier: tier ?? null,
  });
  if (error) throw error;
}

function academyTierFromMetadata(metadata: Json | null | undefined): VivacityAcademyTier | null {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) return null;
  const solo = (metadata as Record<string, unknown>).academy_solo;
  if (!solo || typeof solo !== "object" || Array.isArray(solo)) return null;
  const tier = (solo as Record<string, unknown>).tier;
  if (tier === "solo" || tier === "team" || tier === "elite") return tier;
  return "solo";
}

export interface TenantRow {
  id: number;
  name: string;
  academy_access_enabled: boolean;
  academy_max_users: number | null;
  academy_subscription_expires_at: string | null;
  metadata: Json | null;
  enrolled_count: number;
  tenant_type: string | null;
}

export interface AcademySoloAccountCreation {
  tenant_id: number;
  account_name: string;
  account_type: "individual";
  plan_code: `academy_${VivacityAcademyTier}`;
  catalogue_scope: "all_published_courses";
  tier: VivacityAcademyTier;
  max_users: number | null;
}

export interface AcademySoloAccountInput {
  accountName: string;
  notes?: string;
  expiresAt?: string | null;
  tier: VivacityAcademyTier;
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
        .select("id, name, academy_access_enabled, academy_max_users, academy_subscription_expires_at, metadata, tenant_type")
        .order("name");
      if (error) throw error;

      const { data: enrolData } = await supabase
        .from("academy_enrollments")
        .select("tenant_id")
        .eq("status", "active");

      const countMap = new Map<number, number>();
      (enrolData ?? []).forEach((e) => {
        if (e.tenant_id == null) return;
        countMap.set(e.tenant_id, (countMap.get(e.tenant_id) || 0) + 1);
      });

      return (tenantData ?? []).map((t) => ({
        id: t.id,
        name: t.name ?? `Tenant ${t.id}`,
        academy_access_enabled: t.academy_access_enabled ?? false,
        academy_max_users: t.academy_max_users,
        academy_subscription_expires_at: t.academy_subscription_expires_at,
        metadata: t.metadata,
        enrolled_count: countMap.get(t.id) || 0,
        tenant_type: t.tenant_type ?? null,
      }));
    },
    staleTime: 30_000,
  });
}

export function useCreateAcademySoloAccount() {
  const qc = useQueryClient();

  return useMutation<AcademySoloAccountCreation, Error, AcademySoloAccountInput>({
    mutationFn: async ({ accountName, notes, expiresAt, tier }) => {
      const { data, error } = await supabase.rpc("create_academy_solo_account", {
        p_account_name: accountName,
        p_notes: notes?.trim() || null,
        p_expires_at: expiresAt ?? null,
        p_tier: tier,
      });
      if (error) throw error;
      return data as unknown as AcademySoloAccountCreation;
    },
    onSuccess: () => {
      toast.success("Vivacity Academy account created");
      qc.invalidateQueries({ queryKey: [TENANT_KEY] });
    },
    onError: (error) => toast.error(error.message || "Failed to create Vivacity Academy account"),
  });
}

export function useToggleTenantAccess() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, enabled }: { id: number; enabled: boolean }) => {
      await manageAcademySoloAccess(id, { academy_access_enabled: enabled });
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
        lifecycleAction?: AcademySoloAction;
        academy_access_enabled?: boolean;
        academy_tier?: VivacityAcademyTier | null;
        academy_max_users?: number | null;
        academy_subscription_expires_at?: string | null;
        metadata?: Json;
      };
    }) => {
      await manageAcademySoloAccess(tenantId, data);
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

      const packageIds = [...new Set(rules.map((r) => r.package_id))];
      const courseIds = [...new Set(rules.map((r) => r.course_id))];

      const [{ data: pkgs }, { data: courses }] = await Promise.all([
        supabase.from("packages").select("id, name").in("id", packageIds),
        supabase.from("academy_courses").select("id, title").in("id", courseIds),
      ]);

      const pkgMap = new Map((pkgs ?? []).map((p) => [p.id, p.name]));
      const courseMap = new Map((courses ?? []).map((c) => [c.id, c.title]));

      return rules.map((r) => ({
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
      });
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
        .update({ is_active: false })
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
