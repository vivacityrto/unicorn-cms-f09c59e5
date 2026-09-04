import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export const RULES_QUERY_KEY = ["academy-package-course-rules"] as const;
export const RULE_STATS_KEY = ["academy-rule-dashboard-stats"] as const;
export const PACKAGES_KEY = ["academy-rules-packages-active"] as const;
export const COURSES_KEY = ["academy-rules-published-courses"] as const;

export interface PackageRow {
  id: number;
  name: string;
  package_type: string | null;
  duration_months: number | null;
  status: string | null;
}

export interface CourseRow {
  id: number;
  title: string;
  target_audience: string[] | null;
  sort_order: number | null;
  status: string | null;
}

export interface RuleRow {
  id: number;
  package_id: number;
  course_id: number;
  is_active: boolean | null;
  created_at: string | null;
  created_by: string | null;
}

export interface RuleStats {
  active_rules: number;
  total_mappings: number;
  auto_enrollments_to_date: number;
  unmapped_packages: number;
}

// ============= Read hooks =============

export function usePackagesActive() {
  return useQuery<PackageRow[]>({
    queryKey: PACKAGES_KEY,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("packages")
        .select("id, name, package_type, duration_months, status")
        .eq("status", "active")
        .order("package_type")
        .order("name");
      if (error) throw error;
      return (data ?? []) as PackageRow[];
    },
  });
}

export function usePublishedCourses() {
  return useQuery<CourseRow[]>({
    queryKey: COURSES_KEY,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("academy_courses")
        .select("id, title, target_audience, sort_order, status")
        .eq("status", "published")
        .order("sort_order")
        .order("title");
      if (error) throw error;
      return (data ?? []) as CourseRow[];
    },
  });
}

export function useAllPackageCourseRules() {
  return useQuery<RuleRow[]>({
    queryKey: RULES_QUERY_KEY,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("academy_package_course_rules")
        .select("id, package_id, course_id, is_active, created_at, created_by")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as RuleRow[];
    },
  });
}

export function useRuleStats() {
  return useQuery<RuleStats>({
    queryKey: RULE_STATS_KEY,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("fn_academy_rule_dashboard_stats");
      if (error) throw error;
      const row = Array.isArray(data) ? data[0] : data;
      return (row ?? {
        active_rules: 0,
        total_mappings: 0,
        auto_enrollments_to_date: 0,
        unmapped_packages: 0,
      }) as RuleStats;
    },
  });
}

// ============= Realtime subscription =============

export function useRulesRealtime() {
  const qc = useQueryClient();
  useEffect(() => {
    const ch = supabase
      .channel("rules-changes")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "academy_package_course_rules" },
        () => {
          qc.invalidateQueries({ queryKey: RULES_QUERY_KEY });
          qc.invalidateQueries({ queryKey: RULE_STATS_KEY });
        }
      )
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [qc]);
}

// ============= Mutations =============

function rlsErrorMessage(err: unknown): string {
  const msg = String((err instanceof Error ? err.message : err) ?? "");
  if (/row-level security|permission denied|access denied|vivacity/i.test(msg)) {
    return "You need SuperAdmin access to modify rules.";
  }
  return msg || "Operation failed.";
}

export function useToggleRule() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (vars: { packageId: number; courseId: number; existing?: RuleRow | null }) => {
      const { packageId, courseId, existing } = vars;
      const { data: { user } } = await supabase.auth.getUser();
      if (existing) {
        const { error } = await supabase
          .from("academy_package_course_rules")
          .update({ is_active: !existing.is_active })
          .eq("id", existing.id);
        if (error) throw error;
        return { ...existing, is_active: !existing.is_active };
      } else {
        const { data, error } = await supabase
          .from("academy_package_course_rules")
          .insert({
            package_id: packageId,
            course_id: courseId,
            is_active: true,
            created_by: user?.id ?? null,
          })
          .select("id, package_id, course_id, is_active, created_at, created_by")
          .single();
        if (error) throw error;
        return data as RuleRow;
      }
    },
    onMutate: async (vars) => {
      await qc.cancelQueries({ queryKey: RULES_QUERY_KEY });
      const prev = qc.getQueryData<RuleRow[]>(RULES_QUERY_KEY);
      if (prev) {
        const idx = prev.findIndex(
          (r) => r.package_id === vars.packageId && r.course_id === vars.courseId
        );
        let next = [...prev];
        if (idx >= 0) {
          next[idx] = { ...next[idx], is_active: !next[idx].is_active };
        } else {
          next = [
            {
              id: -Date.now(),
              package_id: vars.packageId,
              course_id: vars.courseId,
              is_active: true,
              created_at: new Date().toISOString(),
              created_by: null,
            },
            ...next,
          ];
        }
        qc.setQueryData(RULES_QUERY_KEY, next);
      }
      return { prev };
    },
    onError: (err, _vars, ctx) => {
      if (ctx?.prev) qc.setQueryData(RULES_QUERY_KEY, ctx.prev);
      toast.error(rlsErrorMessage(err));
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: RULES_QUERY_KEY });
      qc.invalidateQueries({ queryKey: RULE_STATS_KEY });
    },
  });
}

export function useArchiveRule() {
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
      toast.success("Rule archived.");
      qc.invalidateQueries({ queryKey: RULES_QUERY_KEY });
      qc.invalidateQueries({ queryKey: RULE_STATS_KEY });
    },
    onError: (err) => toast.error(rlsErrorMessage(err)),
  });
}

export function useBackfillRule() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (ruleId: number) => {
      const { data, error } = await supabase.rpc(
        "fn_academy_backfill_enrollments_for_rule",
        { p_rule_id: ruleId }
      );
      if (error) throw error;
      return Number(data ?? 0);
    },
    onSuccess: (count) => {
      if (count === 0) {
        toast.info("No new enrollments needed — all affected users were already enrolled.");
      } else {
        toast.success(`Backfilled ${count} new enrollments.`);
      }
      qc.invalidateQueries({ queryKey: RULE_STATS_KEY });
    },
    onError: (err) => toast.error(rlsErrorMessage(err)),
  });
}

export function useBackfillPreview() {
  return useMutation({
    mutationFn: async (vars: { packageId: number; courseId: number }) => {
      // Fetch tenants with active package_instances for this package
      const { data: instances, error: e1 } = await supabase
        .from("package_instances")
        .select("tenant_id")
        .eq("package_id", vars.packageId)
        .eq("is_active", true)
        .eq("membership_state", "active");
      if (e1) throw e1;
      const tenantIds = Array.from(new Set((instances ?? []).map((r) => r.tenant_id)));
      if (tenantIds.length === 0) {
        return { tenants: 0, users: 0, new_enrollments: 0 };
      }
      const { data: tu, error: e2 } = await supabase
        .from("tenant_users")
        .select("user_id")
        .in("tenant_id", tenantIds);
      if (e2) throw e2;
      const userIds = Array.from(new Set((tu ?? []).map((r) => r.user_id)));
      if (userIds.length === 0) {
        return { tenants: tenantIds.length, users: 0, new_enrollments: 0 };
      }
      const { data: existing, error: e3 } = await supabase
        .from("academy_enrollments")
        .select("user_id")
        .eq("course_id", vars.courseId)
        .in("user_id", userIds);
      if (e3) throw e3;
      const enrolled = new Set((existing ?? []).map((r) => r.user_id));
      const newEnrollments = userIds.filter((u) => !enrolled.has(u)).length;
      return {
        tenants: tenantIds.length,
        users: userIds.length,
        new_enrollments: newEnrollments,
      };
    },
  });
}

export function useCreateRules() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (vars: { packageId: number; courseIds: number[]; backfill: boolean }) => {
      const { packageId, courseIds, backfill } = vars;
      const { data: { user } } = await supabase.auth.getUser();
      const rows = courseIds.map((cid) => ({
        package_id: packageId,
        course_id: cid,
        is_active: true,
        created_by: user?.id ?? null,
      }));
      const { data, error } = await supabase
        .from("academy_package_course_rules")
        .upsert(rows, { onConflict: "package_id,course_id" })
        .select("id");
      if (error) throw error;
      const ruleIds = (data ?? []).map((r) => r.id);

      let backfilled = 0;
      if (backfill && ruleIds.length > 0) {
        for (const rid of ruleIds) {
          const { data: cnt, error: bfErr } = await supabase.rpc(
            "fn_academy_backfill_enrollments_for_rule",
            { p_rule_id: rid }
          );
          if (bfErr) throw bfErr;
          backfilled += Number(cnt ?? 0);
        }
      }
      return { created: ruleIds.length, backfilled };
    },
    onSuccess: (res) => {
      if (res.backfilled > 0) {
        toast.success(`Created ${res.created} rules. Backfilled ${res.backfilled} enrollments.`);
      } else {
        toast.success(`Created ${res.created} rules.`);
      }
      qc.invalidateQueries({ queryKey: RULES_QUERY_KEY });
      qc.invalidateQueries({ queryKey: RULE_STATS_KEY });
    },
    onError: (err) => toast.error(rlsErrorMessage(err)),
  });
}

export function useCopyRuleMappings() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (vars: { sourcePackageId: number; targetPackageId: number }) => {
      const { data: srcRules, error } = await supabase
        .from("academy_package_course_rules")
        .select("course_id")
        .eq("package_id", vars.sourcePackageId)
        .eq("is_active", true);
      if (error) throw error;
      const courseIds = (srcRules ?? []).map((r) => r.course_id);
      if (courseIds.length === 0) return { copied: 0 };
      const { data: { user } } = await supabase.auth.getUser();
      const rows = courseIds.map((cid) => ({
        package_id: vars.targetPackageId,
        course_id: cid,
        is_active: true,
        created_by: user?.id ?? null,
      }));
      const { error: upErr } = await supabase
        .from("academy_package_course_rules")
        .upsert(rows, { onConflict: "package_id,course_id" });
      if (upErr) throw upErr;
      return { copied: rows.length };
    },
    onSuccess: (res) => {
      toast.success(`Copied ${res.copied} mappings.`);
      qc.invalidateQueries({ queryKey: RULES_QUERY_KEY });
      qc.invalidateQueries({ queryKey: RULE_STATS_KEY });
    },
    onError: (err) => toast.error(rlsErrorMessage(err)),
  });
}

export function useBatchToggle() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (vars: { pairs: { packageId: number; courseId: number }[]; activate: boolean }) => {
      const { data: { user } } = await supabase.auth.getUser();
      const rows = vars.pairs.map((p) => ({
        package_id: p.packageId,
        course_id: p.courseId,
        is_active: vars.activate,
        created_by: user?.id ?? null,
      }));
      const { error } = await supabase
        .from("academy_package_course_rules")
        .upsert(rows, { onConflict: "package_id,course_id" });
      if (error) throw error;
      return rows.length;
    },
    onSuccess: (n) => {
      toast.success(`Updated ${n} mappings.`);
      qc.invalidateQueries({ queryKey: RULES_QUERY_KEY });
      qc.invalidateQueries({ queryKey: RULE_STATS_KEY });
    },
    onError: (err) => toast.error(rlsErrorMessage(err)),
  });
}

// ============= Helpers =============

export const PACKAGE_TYPE_STYLES: Record<string, { chip: string; band: string; label: string }> = {
  project: {
    chip: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300",
    band: "bg-blue-50 dark:bg-blue-900/20",
    label: "Project",
  },
  membership: {
    chip: "bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300",
    band: "bg-purple-50 dark:bg-purple-900/20",
    label: "Membership",
  },
  regulatory_submission: {
    chip: "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300",
    band: "bg-amber-50 dark:bg-amber-900/20",
    label: "Regulatory",
  },
  audit: {
    chip: "bg-teal-100 text-teal-800 dark:bg-teal-900/30 dark:text-teal-300",
    band: "bg-teal-50 dark:bg-teal-900/20",
    label: "Audit",
  },
};

export function packageTypeStyle(type: string | null) {
  return (
    PACKAGE_TYPE_STYLES[type ?? ""] ?? {
      chip: "bg-muted text-muted-foreground",
      band: "bg-muted/30",
      label: type ?? "Other",
    }
  );
}
