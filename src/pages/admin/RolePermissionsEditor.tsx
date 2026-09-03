import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import {
  AlertTriangle,
  History,
  Lock,
  Save,
  Search,
  ShieldCheck,
} from "lucide-react";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/ui/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

type Permission = "full" | "limited" | "owner_only" | "none";

const PERMISSION_META: Record<
  Permission,
  { label: string; symbol: string; className: string }
> = {
  full: {
    label: "Full",
    symbol: "●",
    className: "bg-purple-100 text-purple-800 border-purple-200",
  },
  limited: {
    label: "Limited",
    symbol: "◐",
    className: "bg-cyan-100 text-cyan-800 border-cyan-200",
  },
  owner_only: {
    label: "Owner only",
    symbol: "★",
    className: "bg-amber-100 text-amber-800 border-amber-200",
  },
  none: {
    label: "None",
    symbol: "○",
    className: "bg-muted text-muted-foreground border-border",
  },
};

interface PermissionFeature {
  feature_key: string;
  label: string;
  module: string | null;
  category: string | null;
  description: string | null;
  sort_order: number | null;
}

interface RolePermissionRow {
  feature_key: string;
  role: string;
  level: Permission;
}

interface UnicornRole {
  value: string;
  label: string;
  sort_order: number | null;
}

interface ChangeLogEntry {
  id: number;
  entity_id: string;
  action: string;
  before: { feature_key?: string; role?: string; level?: Permission } | null;
  after: { feature_key?: string; role?: string; level?: Permission } | null;
  reason: string | null;
  created_at: string;
  actor_uuid: string | null;
}

const cellKey = (f: string, r: string) => `${f}::${r}`;

export default function RolePermissionsEditor() {
  const queryClient = useQueryClient();
  const [moduleFilter, setModuleFilter] = useState<string>("All");
  const [search, setSearch] = useState("");
  const [staged, setStaged] = useState<Map<string, Permission>>(new Map());
  const [saveProgress, setSaveProgress] = useState<{ done: number; total: number } | null>(
    null,
  );
  const [logOpen, setLogOpen] = useState(false);

  const featuresQ = useQuery({
    queryKey: ["role-permissions", "features"],
    queryFn: async (): Promise<PermissionFeature[]> => {
      const { data, error } = await supabase
        .from("permission_features")
        .select("feature_key,label,module,category,description,sort_order")
        .eq("is_active", true)
        .order("sort_order", { ascending: true });
      if (error) throw error;
      return (data ?? []) as PermissionFeature[];
    },
  });

  const matrixQ = useQuery({
    queryKey: ["role-permissions", "matrix"],
    queryFn: async (): Promise<RolePermissionRow[]> => {
      const { data, error } = await supabase
        .from("role_permissions")
        .select("feature_key,role,level");
      if (error) throw error;
      return (data ?? []) as RolePermissionRow[];
    },
  });

  const rolesQ = useQuery({
    queryKey: ["role-permissions", "roles"],
    queryFn: async (): Promise<UnicornRole[]> => {
      const { data, error } = await supabase
        .from("dd_unicorn_roles")
        .select("value,label,sort_order")
        .eq("is_internal", true)
        .eq("is_active", true)
        .order("sort_order", { ascending: true });
      if (error) throw error;
      return (data ?? []) as UnicornRole[];
    },
  });

  const features = useMemo(() => featuresQ.data ?? [], [featuresQ.data]);
  const matrix = useMemo(() => matrixQ.data ?? [], [matrixQ.data]);
  const roles = useMemo(() => rolesQ.data ?? [], [rolesQ.data]);

  // Build lookup: feature_key -> role -> level
  const matrixMap = useMemo(() => {
    const m = new Map<string, Permission>();
    for (const r of matrix) m.set(cellKey(r.feature_key, r.role), r.level);
    return m;
  }, [matrix]);

  // Gap count
  const gapCount = useMemo(() => {
    if (!features.length || !roles.length) return 0;
    let n = 0;
    for (const f of features) {
      for (const r of roles) {
        if (!matrixMap.has(cellKey(f.feature_key, r.value))) n++;
      }
    }
    return n;
  }, [features, roles, matrixMap]);

  // Modules for tabs
  const modules = useMemo(() => {
    const set = new Set<string>();
    for (const f of features) if (f.module) set.add(f.module);
    return ["All", ...Array.from(set).sort()];
  }, [features]);

  // Filtered + grouped features
  const grouped = useMemo(() => {
    const q = search.trim().toLowerCase();
    const filtered = features.filter((f) => {
      if (moduleFilter !== "All" && f.module !== moduleFilter) return false;
      if (q && !f.label.toLowerCase().includes(q)) return false;
      return true;
    });
    const groups: Record<string, PermissionFeature[]> = {};
    for (const f of filtered) {
      const cat = f.category ?? f.module ?? "Other";
      (groups[cat] ||= []).push(f);
    }
    return groups;
  }, [features, moduleFilter, search]);

  const stageEdit = (feature_key: string, role: string, value: Permission) => {
    const current = matrixMap.get(cellKey(feature_key, role)) ?? null;
    const next = new Map(staged);
    if (current === value) next.delete(cellKey(feature_key, role));
    else next.set(cellKey(feature_key, role), value);
    setStaged(next);
  };

  const discardStaged = () => setStaged(new Map());

  const saveAll = async () => {
    if (!staged.size) return;
    const entries = Array.from(staged.entries());
    setSaveProgress({ done: 0, total: entries.length });
    const failed: Array<{ key: string; message: string }> = [];
    const succeededKeys: string[] = [];

    for (let i = 0; i < entries.length; i++) {
      const [key, level] = entries[i];
      const [feature_key, role] = key.split("::");
      try {
        const { data, error } = await supabase.functions.invoke(
          "update-role-permission",
          { body: { feature_key, role, new_permission: level } },
        );
        if (error) throw error;
        if (data && (data as { ok?: boolean }).ok === false) {
          throw new Error(
            (data as { code?: string; detail?: string }).detail ??
              (data as { code?: string }).code ??
              "Unknown error",
          );
        }
        succeededKeys.push(key);
      } catch (e) {
        failed.push({ key, message: (e as Error).message ?? String(e) });
      }
      setSaveProgress({ done: i + 1, total: entries.length });
    }

    setSaveProgress(null);

    // Remove successes from staged
    if (succeededKeys.length) {
      const next = new Map(staged);
      for (const k of succeededKeys) next.delete(k);
      setStaged(next);
      queryClient.invalidateQueries({ queryKey: ["role-permissions"] });
    }

    if (!failed.length) {
      toast.success(`${succeededKeys.length} permission changes saved and logged.`);
    } else {
      toast.error(
        `Saved ${succeededKeys.length} of ${entries.length}. ${failed.length} failed.`,
        {
          description: failed
            .slice(0, 3)
            .map((f) => `${f.key}: ${f.message}`)
            .join(" • "),
          action: { label: "Retry failed", onClick: () => void saveAll() },
        },
      );
    }
  };

  const loading = featuresQ.isLoading || matrixQ.isLoading || rolesQ.isLoading;
  const error = featuresQ.error || matrixQ.error || rolesQ.error;

  return (
      <TooltipProvider>
        <div className="p-4 md:p-6 space-y-4">
        <PageHeader
          title="Role Permission Editor"
          description="Control which roles can access each feature. Changes take effect immediately and are logged."
          icon={ShieldCheck}
          actions={
            <>
              <Button
                variant="outline"
                onClick={() => setLogOpen(true)}
                className="gap-2"
              >
                <History className="h-4 w-4" />
                View Change Log
              </Button>
              {staged.size > 0 && (
                <Button variant="ghost" onClick={discardStaged}>
                  Discard ({staged.size})
                </Button>
              )}
              <Button
                onClick={() => void saveAll()}
                disabled={!staged.size || !!saveProgress}
                className="gap-2"
              >
                <Save className="h-4 w-4" />
                {saveProgress
                  ? `Saving ${saveProgress.done} of ${saveProgress.total}...`
                  : `Save All Changes${staged.size ? ` (${staged.size})` : ""}`}
              </Button>
            </>
          }
        />

        {error && (
          <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
            Failed to load permissions: {(error as Error).message}
          </div>
        )}

        {gapCount > 0 && (
          <div className="flex items-start gap-2 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
            <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0" />
            <span>
              <strong>{gapCount}</strong> unconfigured permission{gapCount === 1 ? "" : "s"} — review and set below.
            </span>
          </div>
        )}

        {/* Module filter pills + search */}
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div className="flex gap-1 overflow-x-auto pb-1">
            {modules.map((m) => (
              <button
                key={m}
                onClick={() => setModuleFilter(m)}
                className={cn(
                  "whitespace-nowrap rounded-full border px-3 py-1 text-sm transition-colors",
                  moduleFilter === m
                    ? "bg-primary text-primary-foreground border-primary"
                    : "bg-background hover:bg-muted",
                )}
              >
                {m}
              </button>
            ))}
          </div>
          <div className="relative md:w-72">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search features..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>
        </div>

        {loading ? (
          <div className="rounded-lg border p-8 text-center text-muted-foreground">
            Loading permission matrix...
          </div>
        ) : (
          <div className="rounded-lg border">
            <Table>
              <TableHeader className="sticky top-0 z-10">
                <TableRow>
                  <TableHead className="min-w-[280px] sticky left-0 bg-brand-acai-50 dark:bg-brand-acai-900 z-20">
                    Feature
                  </TableHead>
                  {roles.map((r) => (
                    <TableHead key={r.value} className="text-center min-w-[140px]">
                      {r.label}
                    </TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {Object.entries(grouped).map(([category, rows]) => (
                  <FragmentRows
                    key={category}
                    category={category}
                    rows={rows}
                    roles={roles}
                    matrixMap={matrixMap}
                    staged={staged}
                    onStage={stageEdit}
                  />
                ))}
                {Object.keys(grouped).length === 0 && (
                  <TableRow>
                    <TableCell colSpan={roles.length + 1} className="text-center text-muted-foreground py-8">
                      No features match.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        )}
        </div>

        <ChangeLogDrawer
          open={logOpen}
          onOpenChange={setLogOpen}
          features={features}
          roles={roles}
        />
      </TooltipProvider>
  );
}

function FragmentRows({
  category,
  rows,
  roles,
  matrixMap,
  staged,
  onStage,
}: {
  category: string;
  rows: PermissionFeature[];
  roles: UnicornRole[];
  matrixMap: Map<string, Permission>;
  staged: Map<string, Permission>;
  onStage: (feature_key: string, role: string, value: Permission) => void;
}) {
  return (
    <>
      <TableRow className="bg-secondary/40 hover:bg-secondary/40">
        <TableCell
          colSpan={roles.length + 1}
          className="font-semibold text-sm uppercase tracking-wide text-secondary-foreground"
        >
          {category}
        </TableCell>
      </TableRow>
      {rows.map((f) => {
        const rowHasStaged = roles.some((r) => staged.has(cellKey(f.feature_key, r.value)));
        return (
          <TableRow key={f.feature_key}>
            <TableCell className="sticky left-0 bg-background z-10 align-top">
              <div className="flex items-start gap-2">
                <span
                  className={cn(
                    "mt-1.5 h-2 w-2 flex-shrink-0 rounded-full",
                    rowHasStaged ? "bg-amber-400" : "bg-transparent",
                  )}
                />
                <div className="min-w-0">
                  <div className="font-medium text-sm">{f.label}</div>
                  {f.description && (
                    <div className="text-xs text-muted-foreground">{f.description}</div>
                  )}
                  <div className="text-[10px] text-muted-foreground/70 font-mono mt-0.5">
                    {f.feature_key}
                  </div>
                </div>
              </div>
            </TableCell>
            {roles.map((r) => (
              <TableCell key={r.value} className="text-center align-middle p-2">
                <PermissionCell
                  feature_key={f.feature_key}
                  role={r.value}
                  current={matrixMap.get(cellKey(f.feature_key, r.value)) ?? null}
                  staged={staged.get(cellKey(f.feature_key, r.value)) ?? null}
                  onStage={onStage}
                />
              </TableCell>
            ))}
          </TableRow>
        );
      })}
    </>
  );
}

function PermissionCell({
  feature_key,
  role,
  current,
  staged,
  onStage,
}: {
  feature_key: string;
  role: string;
  current: Permission | null;
  staged: Permission | null;
  onStage: (feature_key: string, role: string, value: Permission) => void;
}) {
  // Super Admin column is locked
  if (role === "Super Admin") {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <div className="inline-flex items-center gap-1.5 rounded-md border bg-purple-100 text-purple-800 border-purple-200 px-2 py-1 text-xs">
            <Lock className="h-3 w-3" />
            <span>● Full</span>
          </div>
        </TooltipTrigger>
        <TooltipContent>Super Admin always has full access.</TooltipContent>
      </Tooltip>
    );
  }

  const effective = staged ?? current;
  const isUnset = current === null && staged === null;
  const isDirty = staged !== null;

  return (
    <Select value={effective ?? ""} onValueChange={(v) => onStage(feature_key, role, v as Permission)}>
      <SelectTrigger
        className={cn(
          "h-9 w-full text-xs",
          isDirty && "ring-2 ring-amber-300",
          isUnset &&
            "border-dashed border-amber-300 bg-[repeating-linear-gradient(45deg,_rgba(251,191,36,0.08)_0_6px,_transparent_6px_12px)]",
        )}
      >
        <SelectValue
          placeholder={isUnset ? "— Unset" : "Select..."}
        >
          {effective ? (
            <span
              className={cn(
                "inline-flex items-center gap-1 rounded px-1.5 py-0.5 border text-xs",
                PERMISSION_META[effective].className,
              )}
            >
              {PERMISSION_META[effective].symbol} {PERMISSION_META[effective].label}
            </span>
          ) : null}
        </SelectValue>
      </SelectTrigger>
      <SelectContent>
        {(Object.keys(PERMISSION_META) as Permission[]).map((p) => (
          <SelectItem key={p} value={p}>
            <span
              className={cn(
                "inline-flex items-center gap-1 rounded px-1.5 py-0.5 border text-xs",
                PERMISSION_META[p].className,
              )}
            >
              {PERMISSION_META[p].symbol} {PERMISSION_META[p].label}
            </span>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function ChangeLogDrawer({
  open,
  onOpenChange,
  features,
  roles,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  features: PermissionFeature[];
  roles: UnicornRole[];
}) {
  const [featureFilter, setFeatureFilter] = useState<string>("__all__");
  const [roleFilter, setRoleFilter] = useState<string>("__all__");

  const logsQ = useQuery({
    queryKey: ["role-permissions", "change-log"],
    enabled: open,
    queryFn: async (): Promise<ChangeLogEntry[]> => {
      const { data, error } = await supabase
        .from("permission_change_log")
        .select("id,entity_id,action,before,after,reason,created_at,actor_uuid")
        .eq("entity", "role_permissions")
        .order("created_at", { ascending: false })
        .limit(200);
      if (error) throw error;
      return (data ?? []) as unknown as ChangeLogEntry[];
    },
  });

  const actorIds = useMemo(
    () =>
      Array.from(
        new Set(
          (logsQ.data ?? []).map((l) => l.actor_uuid).filter((v): v is string => !!v),
        ),
      ),
    [logsQ.data],
  );

  const actorsQ = useQuery({
    queryKey: ["role-permissions", "actors", actorIds],
    enabled: open && actorIds.length > 0,
    queryFn: async (): Promise<Record<string, string>> => {
      const { data, error } = await supabase
        .from("users")
        .select("user_uuid,full_name,email")
        .in("user_uuid", actorIds);
      if (error) throw error;
      const map: Record<string, string> = {};
      for (const u of data ?? []) {
        map[(u as { user_uuid: string }).user_uuid] =
          (u as { full_name?: string }).full_name ??
          (u as { email?: string }).email ??
          "Unknown";
      }
      return map;
    },
  });

  const featureLabels = useMemo(() => {
    const m: Record<string, string> = {};
    for (const f of features) m[f.feature_key] = f.label;
    return m;
  }, [features]);

  const filtered = (logsQ.data ?? []).filter((l) => {
    const fk = l.after?.feature_key ?? l.before?.feature_key ?? "";
    const ro = l.after?.role ?? l.before?.role ?? "";
    if (featureFilter !== "__all__" && fk !== featureFilter) return false;
    if (roleFilter !== "__all__" && ro !== roleFilter) return false;
    return true;
  });

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-xl overflow-y-auto">
        <SheetHeader>
          <SheetTitle>Permission Change Log</SheetTitle>
          <SheetDescription>
            Most recent permission changes, with actor and reason.
          </SheetDescription>
        </SheetHeader>

        <div className="my-4 grid grid-cols-2 gap-2">
          <Select value={featureFilter} onValueChange={setFeatureFilter}>
            <SelectTrigger>
              <SelectValue placeholder="Feature" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__all__">All features</SelectItem>
              {features.map((f) => (
                <SelectItem key={f.feature_key} value={f.feature_key}>
                  {f.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={roleFilter} onValueChange={setRoleFilter}>
            <SelectTrigger>
              <SelectValue placeholder="Role" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__all__">All roles</SelectItem>
              {roles.map((r) => (
                <SelectItem key={r.value} value={r.value}>
                  {r.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {logsQ.isLoading ? (
          <div className="text-center text-muted-foreground py-8">Loading...</div>
        ) : filtered.length === 0 ? (
          <div className="text-center text-muted-foreground py-8">No entries.</div>
        ) : (
          <div className="space-y-2">
            {filtered.map((l) => {
              const fk = l.after?.feature_key ?? l.before?.feature_key ?? "";
              const ro = l.after?.role ?? l.before?.role ?? "";
              const oldP = l.before?.level ?? null;
              const newP = l.after?.level ?? null;
              const actor = l.actor_uuid
                ? actorsQ.data?.[l.actor_uuid] ?? "Unknown"
                : "System";
              return (
                <div key={l.id} className="rounded-lg border p-3 text-sm space-y-1">
                  <div className="flex items-center justify-between text-xs text-muted-foreground">
                    <span>{format(new Date(l.created_at), "dd/MM/yyyy HH:mm")}</span>
                    <span>{actor}</span>
                  </div>
                  <div className="font-medium">
                    {featureLabels[fk] ?? fk}{" "}
                    <span className="text-muted-foreground">·</span>{" "}
                    <span className="text-muted-foreground">{ro}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <PermChip p={oldP} />
                    <span className="text-muted-foreground">→</span>
                    <PermChip p={newP} />
                  </div>
                  {l.reason && (
                    <div className="text-xs italic text-muted-foreground">{l.reason}</div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}

function PermChip({ p }: { p: Permission | null }) {
  if (!p) {
    return <Badge variant="outline" className="text-xs">unset</Badge>;
  }
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded px-1.5 py-0.5 border text-xs",
        PERMISSION_META[p].className,
      )}
    >
      {PERMISSION_META[p].symbol} {PERMISSION_META[p].label}
    </span>
  );
}
