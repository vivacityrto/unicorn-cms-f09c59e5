import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";

export interface StaffOption {
  user_uuid: string;
  display_name: string;
  unicorn_role: string | null;
  is_qa: boolean;
}

interface Props {
  value: string | null;
  onChange: (uuid: string) => void;
  /** Limit selectable staff to a specific KPI role (csc, cst, dev). */
  filterRole?: "csc" | "cst" | "dev";
  label?: string;
}

const ROLE_TO_KPI_ROLE: Record<string, string> = {
  csc: "csc_consultant",
  cst: "cst_assistant",
  dev: "developer",
};

export function KpiStaffSelector({ value, onChange, filterRole, label = "Viewing staff member" }: Props) {
  const [staff, setStaff] = useState<StaffOption[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      let query = (supabase as any)
        .from("users")
        .select("user_uuid, first_name, last_name, email, unicorn_role, is_vivacity_internal, kpi_role, kpi_pod")
        .eq("is_vivacity_internal", true)
        .eq("is_system_account", false)
        .order("first_name", { ascending: true });
      if (filterRole) {
        query = query.eq("kpi_role", ROLE_TO_KPI_ROLE[filterRole]);
      }
      const { data } = await query;
      if (cancelled) return;
      const list = (data ?? []).map((u: any) => ({
        user_uuid: u.user_uuid as string,
        display_name:
          [u.first_name, u.last_name].filter(Boolean).join(" ").trim() || (u.email as string) || "Unknown",
        unicorn_role: u.unicorn_role,
        is_qa: u.kpi_pod === "qa",
      }));
      setStaff(list);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [filterRole]);

  return (
    <div className="space-y-1.5 max-w-sm">
      <Label className="text-xs text-muted-foreground">{label}</Label>
      <Select value={value ?? undefined} onValueChange={onChange} disabled={loading || staff.length === 0}>
        <SelectTrigger>
          <SelectValue placeholder={loading ? "Loading staff…" : "Choose staff member"} />
        </SelectTrigger>
        <SelectContent>
          {staff.map((s) => (
            <SelectItem key={s.user_uuid} value={s.user_uuid}>
              <span className="inline-flex items-center gap-1.5">
                {s.display_name}
                {s.is_qa ? (
                  <span className="rounded-sm px-1.5 py-0.5 text-[10px] font-semibold bg-amber-100 text-amber-800 border border-amber-300">
                    QA
                  </span>
                ) : null}
                {s.unicorn_role ? <span className="text-muted-foreground"> · {s.unicorn_role}</span> : null}
              </span>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
