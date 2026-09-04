import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useClientTenant } from "@/contexts/ClientTenantContext";

export interface UnifiedTask {
  uid: string;
  source: "action_item";
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

      // ===== Action items pipeline (Phase 5: single source of truth) =====
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
      const actionItems = aiRes.data || [];

      const packageIdSet = new Set<number>();
      const stageIdSet = new Set<number>();
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

      const packageIds = [...packageIdSet];
      const stageIds = [...stageIdSet];

      const [packageRes, stageRes, usersRes] = await Promise.all([
        packageIds.length > 0
          ? supabase.from("packages").select("id, name").in("id", packageIds)
          : Promise.resolve({ data: [], error: null }),
        stageIds.length > 0
          ? supabase.from("stages").select("id, name").in("id", stageIds)
          : Promise.resolve({ data: [], error: null }),
        assigneeIds.length > 0
          ? supabase
              .from("users")
              .select("user_uuid, first_name, last_name, full_name, email")
              .in("user_uuid", assigneeIds)
          : Promise.resolve({ data: [], error: null }),
      ]);

      const packageMap = new Map(
        (packageRes.data || []).map((p): [number, string | null] => [p.id, p.name]),
      );
      const stageMap = new Map(
        (stageRes.data || []).map((s): [number, string] => [s.id, s.name]),
      );
      const userMap = new Map<string, string>();
      for (const u of usersRes.data || []) {
        const name =
          (u.full_name && u.full_name.trim()) ||
          [u.first_name, u.last_name].filter(Boolean).join(" ").trim() ||
          u.email ||
          null;
        if (name) userMap.set(u.user_uuid, name);
      }

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

      return actionItemTasks.sort((a, b) => {
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
