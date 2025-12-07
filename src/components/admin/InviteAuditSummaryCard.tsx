import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { AlertCircle, TrendingUp } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";

type Row = {
  tenant_name: string | null;
  role: string;
  attempts: number;
  successes: number;
  failures: number;
  last_seen: string;
};

export default function InviteAuditSummaryCard() {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;

    (async () => {
      try {
        setLoading(true);
        setError(null);

        const { data, error: fetchError } = await supabase
          .from("vw_invite_audit_7d" as any)
          .select("*");

        if (fetchError) throw fetchError;

        if (alive) {
          setRows((data as any) || []);
        }
      } catch (e: any) {
        if (alive) {
          setError(e.message ?? "Failed to load invite audit data");
        }
      } finally {
        if (alive) {
          setLoading(false);
        }
      }
    })();

    return () => {
      alive = false;
    };
  }, []);

  const totals = useMemo(() => {
    return rows.reduce(
      (acc, r) => {
        acc.attempts += r.attempts;
        acc.successes += r.successes;
        acc.failures += r.failures;
        return acc;
      },
      { attempts: 0, successes: 0, failures: 0 }
    );
  }, [rows]);

  return (
    <Card className="p-6">
      <div className="mb-6 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <TrendingUp className="h-5 w-5 text-muted-foreground" />
          <h3 className="text-lg font-semibold">Invite Activity (Last 7 Days)</h3>
        </div>
        <div className="flex gap-2">
          <Badge variant="secondary" className="text-xs">
            Attempts: <span className="ml-1 font-semibold">{totals.attempts}</span>
          </Badge>
          <Badge variant="default" className="bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-100">
            Success: <span className="ml-1 font-semibold">{totals.successes}</span>
          </Badge>
          <Badge variant="destructive" className="text-xs">
            Failed: <span className="ml-1 font-semibold">{totals.failures}</span>
          </Badge>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-8">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
        </div>
      ) : error ? (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : rows.length === 0 ? (
        <div className="rounded-lg border border-dashed p-8 text-center">
          <p className="text-sm text-muted-foreground">
            No invite activity in the last 7 days.
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/50">
                <th className="px-4 py-3 text-left font-medium">Tenant</th>
                <th className="px-4 py-3 text-left font-medium">Role</th>
                <th className="px-4 py-3 text-center font-medium">Attempts</th>
                <th className="px-4 py-3 text-center font-medium">Successes</th>
                <th className="px-4 py-3 text-center font-medium">Failures</th>
                <th className="px-4 py-3 text-left font-medium">Last Seen</th>
                <th className="px-4 py-3 text-center font-medium">Success Rate</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row, i) => (
                <tr key={i} className="border-b last:border-0 hover:bg-muted/30">
                  <td className="px-4 py-3">{row.tenant_name ?? "Unknown"}</td>
                  <td className="px-4 py-3">
                    <Badge variant="outline" className="text-xs">
                      {labelForRole(row.role)}
                    </Badge>
                  </td>
                  <td className="px-4 py-3 text-center font-mono">{row.attempts}</td>
                  <td className="px-4 py-3 text-center font-mono text-green-600 dark:text-green-400">
                    {row.successes}
                  </td>
                  <td className="px-4 py-3 text-center font-mono text-red-600 dark:text-red-400">
                    {row.failures}
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {new Date(row.last_seen).toLocaleString()}
                  </td>
                  <td className="px-4 py-3">
                    <SuccessRateBar
                      attempts={row.attempts}
                      successes={row.successes}
                      failures={row.failures}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}

function SuccessRateBar({
  attempts,
  successes,
  failures,
}: {
  attempts: number;
  successes: number;
  failures: number;
}) {
  const successPercent = attempts > 0 ? Math.round((successes / attempts) * 100) : 0;
  const failurePercent = attempts > 0 ? Math.round((failures / attempts) * 100) : 0;

  return (
    <div className="flex items-center gap-2">
      <div className="h-2 w-24 overflow-hidden rounded-full bg-muted">
        <div className="flex h-full">
          <div
            className="h-full bg-green-500 transition-all"
            style={{ width: `${successPercent}%` }}
          />
          <div
            className="h-full bg-red-500 transition-all"
            style={{ width: `${failurePercent}%` }}
          />
        </div>
      </div>
      <span className="text-xs font-medium text-muted-foreground">
        {successPercent}%
      </span>
    </div>
  );
}

function labelForRole(r: string): string {
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
}
