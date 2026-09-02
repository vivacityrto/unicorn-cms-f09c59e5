import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ArrowLeft } from "lucide-react";
import { OnboardingHub } from "@/components/admin/team-users/OnboardingHub";
import { ProvisioningRunOverview } from "@/components/admin/team-users/ProvisioningRunOverview";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

const VALID_TABS = ["overview", "onboarding", "audit"] as const;
type TabKey = (typeof VALID_TABS)[number];

export default function ProvisioningRunDetailPage() {
  const { runId } = useParams<{ runId: string }>();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const id = Number(runId);

  const tabParam = searchParams.get("tab");
  const activeTab: TabKey = (VALID_TABS as readonly string[]).includes(tabParam ?? "")
    ? (tabParam as TabKey)
    : "overview";

  const setTab = (next: string) => {
    const sp = new URLSearchParams(searchParams);
    sp.set("tab", next);
    setSearchParams(sp, { replace: true });
  };

  if (!Number.isFinite(id)) {
    return (
      <div className="max-w-5xl mx-auto p-6">
        <div className="text-sm text-destructive">Invalid run id</div>
      </div>
    );
  }

  return (
      <div className="max-w-6xl mx-auto p-6 space-y-4">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => navigate("/admin/team-users")}
        >
          <ArrowLeft className="h-4 w-4 mr-1" /> Back to Team Users
        </Button>

        <Tabs value={activeTab} onValueChange={setTab}>
          <TabsList>
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="onboarding">Onboarding Hub</TabsTrigger>
            <TabsTrigger value="audit">Audit</TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="mt-4">
            <ProvisioningRunOverview runId={id} />
          </TabsContent>

          <TabsContent value="onboarding" className="mt-4">
            <OnboardingHub runId={id} />
          </TabsContent>

          <TabsContent value="audit" className="mt-4">
            <AuditTab runId={id} />
          </TabsContent>
        </Tabs>
      </div>
  );
}

function AuditTab({ runId }: { runId: number }) {
  const { data } = useQuery({
    queryKey: ["provisioning-run-transcript", runId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("staff_provisioning_runs")
        .select("graph_transcript")
        .eq("id", runId)
        .maybeSingle();
      if (error) throw error;
      return data?.graph_transcript ?? null;
    },
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Graph API transcript</CardTitle>
      </CardHeader>
      <CardContent>
        {data ? (
          <pre className="text-xs whitespace-pre-wrap break-words max-h-[600px] overflow-auto p-3 rounded bg-muted">
            {typeof data === "string" ? data : JSON.stringify(data, null, 2)}
          </pre>
        ) : (
          <p className="text-sm text-muted-foreground">No transcript recorded for this run.</p>
        )}
      </CardContent>
    </Card>
  );
}
