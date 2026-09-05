import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Loader2 } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

interface Props {
  runId: number;
}

const STATUS_VARIANT: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  pending: "outline",
  provisioned: "default",
  partial: "secondary",
  failed: "destructive",
};

export function ProvisioningRunOverview({ runId }: Props) {
  const { data, isLoading } = useQuery({
    queryKey: ["provisioning-run-overview", runId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("staff_provisioning_runs")
        .select(
          "id, first_name, last_name, preferred_name, display_name, personal_email, email, phone, job_title, role_code, location_code, start_date, status, upn, mail_nickname, ms_user_id, error_message, graph_transcript, created_at, updated_at"
        )
        .eq("id", runId)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  if (isLoading || !data) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const fullName =
    data.display_name ||
    `${data.first_name ?? ""} ${data.last_name ?? ""}`.trim() ||
    "(Unnamed)";

  const rows: Array<[string, React.ReactNode]> = [
    ["Full name", fullName],
    ["Preferred name", data.preferred_name ?? "—"],
    ["Job title", data.job_title ?? "—"],
    ["Role", data.role_code ?? "—"],
    ["Location", data.location_code ?? "—"],
    ["Start date", data.start_date ?? "—"],
    ["Personal email", data.personal_email ?? "—"],
    ["Phone", data.phone ?? "—"],
    ["UPN (M365)", data.upn ?? "—"],
    ["Mail nickname", data.mail_nickname ?? "—"],
    ["M365 user id", data.ms_user_id ?? "—"],
    [
      "Created",
      data.created_at ? new Date(data.created_at).toLocaleString("en-AU") : "—",
    ],
  ];

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <div className="flex items-start justify-between gap-3 flex-wrap">
            <div>
              <CardTitle className="text-2xl">{fullName}</CardTitle>
              <p className="text-sm text-muted-foreground mt-1">
                Provisioning run #{data.id}
              </p>
            </div>
            <Badge variant={STATUS_VARIANT[data.status ?? "pending"] ?? "outline"}>
              {data.status ?? "pending"}
            </Badge>
          </div>
        </CardHeader>
        <CardContent>
          <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-3 text-sm">
            {rows.map(([label, value]) => (
              <div key={label} className="flex flex-col">
                <dt className="text-xs uppercase tracking-wide text-muted-foreground">
                  {label}
                </dt>
                <dd className="font-medium">{value}</dd>
              </div>
            ))}
          </dl>
        </CardContent>
      </Card>

      {data.error_message && (
        <Card className="border-destructive/40">
          <CardHeader>
            <CardTitle className="text-base text-destructive">Last error</CardTitle>
          </CardHeader>
          <CardContent>
            <pre className="text-xs whitespace-pre-wrap break-words text-destructive">
              {data.error_message}
            </pre>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
