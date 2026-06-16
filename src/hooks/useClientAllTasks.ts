import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useClientTenant } from "@/contexts/ClientTenantContext";

export interface UnifiedTask {
  uid: string;
  source: "stage_task" | "action_item";
  // Legacy numeric id retained for stage tasks (null for action items).
  id: number | null;
  taskName: string;
  packageName: string;
  stageName: string | null;
  dueDate: string | null;
  completionDate: string | null;
  status: number | string;
  priority: number;
  attachmentRequired: boolean;
  isOverdue: boolean;
  isDueSoon: boolean;
  isArchived: boolean;
  archivedAt: string | null;
  assigneeUserId: string | null;
  assigneeName: string | null;
  actionItemId: string | null;
  actionItemStatus: string | null;
}

// Backward-compat alias for existing imports.
export type ClientAllTask = UnifiedTask;

const PRIORITY_MAP: Record<string, number> = {
  urgent: 1,
  high: 2,
  medium: 3,
  normal: 3,
  low: 4,
};

function normalisePriority(raw: unknown): number {
  if (typeof raw === "number") return raw;
  if (typeof raw === "string") return PRIORITY_MAP[raw.toLowerCase()] ?? 3;
  return 3;
}

export function useClientAllTasks(includeArchived: boolean = false) {
  const { activeTenantId } = useClientTenant();

  return useQuery({
    queryKey: ["client-all-tasks", activeTenantId, includeArchived],
    queryFn: async (): Promise<UnifiedTask[]> => {
      if (!activeTenantId) return [];

      const now = new Date();
      const sevenDaysFromNow = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

      // ===== Stage tasks pipeline =====
      const { data: pkgInstances, error: pkgErr } = await supabase
        .from("package_instances")
        .select("id, package_id")
        .eq("tenant_id", activeTenantId)
        .eq("is_active", true);
      if (pkgErr) throw pkgErr;

      const pkgInstanceIds = (pkgInstances || []).map((p) => p.id);
      const packageIdSet = new Set<number>(
        (pkgInstances || [])
          .map((p) => p.package_id)
          .filter((v): v is number => v != null),
      );

      let stageInstances: any[] = [];
      let taskRows: any[] = [];
      let clientTaskIds: number[] = [];
      const stageIdSet = new Set<number>();

      if (pkgInstanceIds.length > 0) {
        const { data: si, error: stgErr } = await supabase
          .from("stage_instances")
          .select("id, packageinstance_id, stage_id, released_client_tasks")
          .in("packageinstance_id", pkgInstanceIds)
          .eq("released_client_tasks", true);
        if (stgErr) throw stgErr;
        stageInstances = si || [];
        for (const s of stageInstances) {
          if (s.stage_id != null) stageIdSet.add(s.stage_id);
        }

        const stageInstanceIds = stageInstances.map((s) => s.id);
        if (stageInstanceIds.length > 0) {
          let tq = supabase
            .from("client_task_instances" as any)
            .select(
              "id, clienttask_id, stageinstance_id, status, due_date, completion_date, is_archived, archived_at",
            )
            .in("stageinstance_id", stageInstanceIds);
          if (!includeArchived) tq = tq.eq("is_archived", false);
          const tRes = await tq;
          if (tRes.error) throw tRes.error;
          taskRows = (tRes.data as any[]) || [];
          clientTaskIds = [
            ...new Set(
              taskRows.map((t) => t.clienttask_id).filter((v): v is number => v != null),
            ),
          ];
        }
      }

      // ===== Action items pipeline =====
      let aiQuery = supabase
        .from("client_action_items")
        .select(
          "id, title, due_date, status, priority, assignee_user_id, package_id, stage_id, source, completed_at",
        )
        .eq("tenant_id", activeTenantId)
        .eq("item_type", "client");
      if (!includeArchived) {
        // No is_archived column; hide closed states by default to mirror archived UX.
        aiQuery = aiQuery.not("status", "in", "(done,cancelled)");
      }
      const aiRes = await aiQuery;
      if (aiRes.error) throw aiRes.error;
      const actionItems = (aiRes.data as any[]) || [];

      for (const ai of actionItems) {
        if (ai.package_id != null) packageIdSet.add(ai.package_id);
        if (ai.stage_id != null) stageIdSet.add(ai.stage_id);
      }

      const assigneeIds = [
        ...new Set(
          actionItems
            .map((a) => a.assignee_user_id)
            .filter((v): v is string => !!v),
        ),
      ];

      // ===== Parallel lookups =====
      const packageIds = [...packageIdSet];
      const stageIds = [...stageIdSet];

      const [clientTaskRes, packageRes, stageRes, usersRes] = await Promise.all([
        clientTaskIds.length > 0
          ? supabase
              .from("client_tasks")
              .select("id, name, priority, attachment_required")
              .in("id", clientTaskIds)
          : Promise.resolve({ data: [], error: null } as any),
        packageIds.length > 0
          ? supabase.from("packages").select("id, name").in("id", packageIds)
          : Promise.resolve({ data: [], error: null } as any),
        stageIds.length > 0
          ? supabase.from("stages").select("id, name").in("id", stageIds)
          : Promise.resolve({ data: [], error: null } as any),
        assigneeIds.length > 0
          ? supabase
              .from("users")
              .select("user_uuid, first_name, last_name, full_name, email")
              .in("user_uuid", assigneeIds)
          : Promise.resolve({ data: [], error: null } as any),
      ]);

      const taskMetaMap = new Map(
        ((clientTaskRes.data || []) as any[]).map((t: any) => [
          t.id,
          {
            name: t.name,
            priority: t.priority,
            attachmentRequired: !!t.attachment_required,
          },
        ]),
      );
      const packageMap = new Map(
        ((packageRes.data || []) as any[]).map((p: any) => [p.id, p.name]),
      );
      const stageMap = new Map(
        ((stageRes.data || []) as any[]).map((s: any) => [s.id, s.name]),
      );
      const userMap = new Map<string, string>();
      for (const u of (usersRes.data || []) as any[]) {
        const name =
          (u.full_name && u.full_name.trim()) ||
          [u.first_name, u.last_name].filter(Boolean).join(" ").trim() ||
          u.email ||
          null;
        if (name) userMap.set(u.user_uuid, name);
      }

      // Map stage_instance -> { packageName, stageName }
      const stageInstanceMap = new Map<
        number,
        { packageName: string; stageName: string }
      >();
      for (const si of stageInstances) {
        const pkg = (pkgInstances || []).find((p) => p.id === si.packageinstance_id);
        stageInstanceMap.set(si.id, {
          packageName: pkg
            ? packageMap.get(pkg.package_id) || "Unknown Package"
            : "Unknown Package",
          stageName: stageMap.get(si.stage_id) || "Unknown Stage",
        });
      }

      // ===== Build unified list =====
      const stageTaskItems: UnifiedTask[] = taskRows.map((row) => {
        const context = stageInstanceMap.get(row.stageinstance_id);
        const meta = taskMetaMap.get(row.clienttask_id);
        const dueDate = row.due_date ? new Date(row.due_date) : null;
        const isCompleted = row.status === 2;
        return {
          uid: `cti-${row.id}`,
          source: "stage_task",
          id: row.id,
          taskName: meta?.name || `Task ${row.id}`,
          packageName: context?.packageName || "Unknown",
          stageName: context?.stageName || "Unknown",
          dueDate: row.due_date,
          completionDate: row.completion_date,
          status: row.status ?? 0,
          priority: normalisePriority(meta?.priority ?? 3),
          attachmentRequired: meta?.attachmentRequired ?? false,
          isOverdue: !isCompleted && !!dueDate && dueDate < now,
          isDueSoon:
            !isCompleted && !!dueDate && dueDate >= now && dueDate <= sevenDaysFromNow,
          isArchived: !!row.is_archived,
          archivedAt: row.archived_at ?? null,
          assigneeUserId: null,
          assigneeName: null,
          actionItemId: null,
          actionItemStatus: null,
        };
      });

      const actionItemTasks: UnifiedTask[] = actionItems.map((ai) => {
        const dueDate = ai.due_date ? new Date(ai.due_date) : null;
        const closed = ai.status === "done" || ai.status === "cancelled";
        return {
          uid: `cai-${ai.id}`,
          source: "action_item",
          id: null,
          taskName: ai.title || "Untitled action",
          packageName:
            ai.package_id != null ? packageMap.get(ai.package_id) || "—" : "—",
          stageName: ai.stage_id != null ? stageMap.get(ai.stage_id) ?? null : null,
          dueDate: ai.due_date,
          completionDate: ai.completed_at ?? null,
          status: ai.status ?? "todo",
          priority: normalisePriority(ai.priority),
          attachmentRequired: false,
          isOverdue: !closed && !!dueDate && dueDate < now,
          isDueSoon:
            !closed && !!dueDate && dueDate >= now && dueDate <= sevenDaysFromNow,
          isArchived: false,
          archivedAt: null,
          assigneeUserId: ai.assignee_user_id ?? null,
          assigneeName: ai.assignee_user_id
            ? userMap.get(ai.assignee_user_id) ?? null
            : null,
          actionItemId: ai.id,
          actionItemStatus: ai.status ?? null,
        };
      });

      return [...stageTaskItems, ...actionItemTasks].sort((a, b) => {
        if (a.isOverdue && !b.isOverdue) return -1;
        if (!a.isOverdue && b.isOverdue) return 1;
        if (a.isDueSoon && !b.isDueSoon) return -1;
        if (!a.isDueSoon && b.isDueSoon) return 1;
        if (a.dueDate && b.dueDate) return a.dueDate.localeCompare(b.dueDate);
        if (a.dueDate) return -1;
        if (b.dueDate) return 1;
        return 0;
      });
    },
    enabled: !!activeTenantId,
  });
}
