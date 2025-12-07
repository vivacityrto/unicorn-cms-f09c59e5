import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { AlertCircle } from "lucide-react";

type Row = {
  created_at: string;
  email: string;
  tenant_id: number;
  tenant_name: string | null;
  role: string;
  code: string | null;
  detail_excerpt: string | null;
};

export default function InviteFailuresTable() {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        setLoading(true);
        const { data, error } = await supabase
          .from("vw_invite_failures_20" as any)
          .select("*");

        if (error) throw error;
        if (alive) setRows((data as any) || []);
      } catch (e: any) {
        if (alive) setErr(e.message ?? "Failed to load");
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  const labelForRole = (r: string) => {
    switch (r) {
      case "SUPER_ADMIN_ADMINISTRATOR":
        return "Super Admin – Administrator";
      case "SUPER_ADMIN_TEAM_LEADER":
        return "Super Admin – Team Leader";
      case "SUPER_ADMIN_GENERAL":
        return "Super Admin – General";
      case "CLIENT_ADMIN":
        return "Client Admin";
      case "CLIENT_USER":
        return "Client User";
      default:
        return r;
    }
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <AlertCircle className="h-5 w-5 text-destructive" />
            <CardTitle>Recent Failed Invites</CardTitle>
          </div>
          <span className="text-sm text-muted-foreground">Last 20 attempts</span>
        </div>
      </CardHeader>
      <CardContent>
        {loading ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : err ? (
          <div className="rounded-md border border-destructive/20 bg-destructive/10 p-3">
            <p className="text-sm text-destructive">{err}</p>
          </div>
        ) : rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">No failures in the recent window.</p>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Time</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Tenant</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead>Code</TableHead>
                  <TableHead>Reason (excerpt)</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((r, i) => (
                  <TableRow key={i}>
                    <TableCell className="whitespace-nowrap">
                      {new Date(r.created_at).toLocaleString()}
                    </TableCell>
                    <TableCell>{r.email}</TableCell>
                    <TableCell>{r.tenant_name ?? `Tenant ${r.tenant_id}`}</TableCell>
                    <TableCell>{labelForRole(r.role)}</TableCell>
                    <TableCell>{r.code ?? "—"}</TableCell>
                    <TableCell className="max-w-xl">
                      <span className="line-clamp-2 text-sm">
                        {r.detail_excerpt ?? "—"}
                      </span>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
