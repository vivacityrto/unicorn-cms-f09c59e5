import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";

export interface StaffOption {
  user_uuid: string;
  display_name: string;
  unicorn_role: string | null;
}

interface Props {
  value: string | null;
  onChange: (uuid: string) => void;
  /** Limit selectable staff to a specific KPI role (csc, cst, dev). */
  filterRole?: "csc" | "cst" | "dev";
  label?: string;
}

const ROLE_TO_UNICORN: Record<string, string[]> = {
  csc: ["CSC"],
  cst: ["CET", "Admin", "User"],
  dev: ["Team Member", "Team Leader", "Integrator"],
};

export function KpiStaffSelector({ value, onChange, filterRole, label = "Viewing staff member" }: Props) {
  const [staff, setStaff] = useState<StaffOption[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      let query = (supabase as any)
        .from("users")
        .select("user_uuid, first_name, last_name, email, unicorn_role, is_vivacity_internal, status")
        .eq("is_vivacity_internal", true)
        .neq("status", "archived")
        .order("first_name", { ascending: true });
      const { data } = await query;
      if (cancelled) return;
      const allowed = filterRole ? ROLE_TO_UNICORN[filterRole] : null;
      const list = (data ?? [])
        .filter((u: any) => !allowed || allowed.includes(u.unicorn_role))
        .map((u: any) => ({
          user_uuid: u.user_uuid as string,
          display_name:
            [u.first_name, u.last_name].filter(Boolean).join(" ").trim() || (u.email as string) || "Unknown",
          unicorn_role: u.unicorn_role,
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
              {s.display_name}
              {s.unicorn_role ? <span className="text-muted-foreground"> · {s.unicorn_role}</span> : null}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
