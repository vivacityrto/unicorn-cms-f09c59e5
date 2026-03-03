import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useClientTenant } from "@/contexts/ClientTenantContext";

export interface ClientAllTask {
  id: number;
  taskName: string;
  packageName: string;
  stageName: string;
  dueDate: string | null;
  completionDate: string | null;
  status: number;
  priority: number;
  attachmentRequired: boolean;
  isOverdue: boolean;
  isDueSoon: boolean;
}

export function useClientAllTasks() {
  const { activeTenantId } = useClientTenant();

  return useQuery({
    queryKey: ["client-all-tasks", activeTenantId],
    queryFn: async (): Promise<ClientAllTask[]> => {
      if (!activeTenantId) return [];

      // 1. Get all package_instances for this tenant
      const { data: pkgInstances, error: pkgErr } = await supabase
        .from("package_instances")
        .select("id, package_id")
        .eq("tenant_id", activeTenantId);

      if (pkgErr) throw pkgErr;
      if (!pkgInstances?.length) return [];

      const pkgInstanceIds = pkgInstances.map((p) => p.id);
      const packageIds = [...new Set(pkgInstances.map((p) => p.package_id).filter(Boolean))] as number[];

      // 2. Get stage_instances for those package instances
      const { data: stageInstances, error: stgErr } = await supabase
        .from("stage_instances")
        .select("id, packageinstance_id, stage_id")
        .in("packageinstance_id", pkgInstanceIds);

      if (stgErr) throw stgErr;
      if (!stageInstances?.length) return [];

      const stageInstanceIds = stageInstances.map((s) => s.id);
      const stageIds = [...new Set(stageInstances.map((s) => s.stage_id).filter(Boolean))] as number[];

      // 3. Fetch task instances, metadata, packages, and stages in parallel
      const [taskRes, clientTaskRes, packageRes, stageRes] = await Promise.all([
        supabase
          .from("client_task_instances" as any)
          .select("id, clienttask_id, stageinstance_id, status, due_date, completion_date")
          .in("stageinstance_id", stageInstanceIds),
        supabase
          .from("client_tasks")
          .select("id, name, priority, attachment_required"),
        supabase
          .from("packages")
          .select("id, name")
          .in("id", packageIds),
        supabase
          .from("stages")
          .select("id, name")
          .in("id", stageIds),
      ]);

      if (taskRes.error) throw taskRes.error;
      if (!taskRes.data?.length) return [];

      // Build lookup maps
      const taskMetaMap = new Map((clientTaskRes.data || []).map((t: any) => [t.id, { name: t.name, priority: t.priority, attachmentRequired: !!t.attachment_required }]));
      const packageMap = new Map((packageRes.data || []).map((p: any) => [p.id, p.name]));
      const stageMap = new Map((stageRes.data || []).map((s: any) => [s.id, s.name]));

      // Map stage_instance -> { packageName, stageName }
      const stageInstanceMap = new Map<number, { packageName: string; stageName: string }>();
      for (const si of stageInstances) {
        const pkg = pkgInstances.find((p) => p.id === si.packageinstance_id);
        stageInstanceMap.set(si.id, {
          packageName: pkg ? (packageMap.get(pkg.package_id) || "Unknown Package") : "Unknown Package",
          stageName: stageMap.get(si.stage_id) || "Unknown Stage",
        });
      }

      const now = new Date();
      const sevenDaysFromNow = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

      return (taskRes.data as any[]).map((row) => {
        const context = stageInstanceMap.get(row.stageinstance_id);
        const meta = taskMetaMap.get(row.clienttask_id);
        const dueDate = row.due_date ? new Date(row.due_date) : null;
        const isCompleted = row.status === 2;

        return {
          id: row.id,
          taskName: meta?.name || `Task ${row.id}`,
          packageName: context?.packageName || "Unknown",
          stageName: context?.stageName || "Unknown",
          dueDate: row.due_date,
          completionDate: row.completion_date,
          status: row.status ?? 0,
          priority: meta?.priority ?? 3,
          attachmentRequired: meta?.attachmentRequired ?? false,
          isOverdue: !isCompleted && !!dueDate && dueDate < now,
          isDueSoon: !isCompleted && !!dueDate && dueDate >= now && dueDate <= sevenDaysFromNow,
        };
      }).sort((a, b) => {
        // Overdue first, then due soon, then rest
        if (a.isOverdue && !b.isOverdue) return -1;
        if (!a.isOverdue && b.isOverdue) return 1;
        if (a.isDueSoon && !b.isDueSoon) return -1;
        if (!a.isDueSoon && b.isDueSoon) return 1;
        // Then by due date ascending
        if (a.dueDate && b.dueDate) return a.dueDate.localeCompare(b.dueDate);
        if (a.dueDate) return -1;
        if (b.dueDate) return 1;
        return 0;
      });
    },
    enabled: !!activeTenantId,
  });
}
