import { useEffect, useState } from "react";
import { useParams, Link, useSearchParams } from "react-router-dom";
import { Target, ArrowLeft } from "lucide-react";
import { AcademyLayout } from "@/components/layout/AcademyLayout";
import AcademyPageWrapper from "@/components/academy/AcademyPageWrapper";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { useAuth } from "@/hooks/useAuth";
import {
  useAudiences,
  useCycle,
  useCycleSummary,
  useEvidence,
  useUserCurrency,
} from "@/features/pdp/hooks";
import { CycleHeaderBand } from "@/components/academy/pdp/cycle/CycleHeaderBand";
import { OverviewTab } from "@/components/academy/pdp/cycle/OverviewTab";
import { GoalsTab } from "@/components/academy/pdp/cycle/GoalsTab";
import { EvidenceTab } from "@/components/academy/pdp/cycle/EvidenceTab";
import { ReflectionsTab } from "@/components/academy/pdp/cycle/ReflectionsTab";
import { ReviewsTab } from "@/components/academy/pdp/cycle/ReviewsTab";
import { AuditExportCard } from "@/components/academy/pdp/cycle/AuditExportCard";
import { ReviewComposerDrawer } from "@/components/academy/pdp/ReviewComposerDrawer";

export default function AcademyPdpCyclePage() {
  const { cycleId: param } = useParams<{ cycleId: string }>();
  const cycleId = param ? Number(param) : NaN;
  const valid = Number.isFinite(cycleId);

  const { user } = useAuth();
  const { data: cycle, isLoading: cycleLoading } = useCycle(valid ? cycleId : null);
  const { data: summary, isLoading: summaryLoading } = useCycleSummary(valid ? cycleId : null);
  const { data: currency } = useUserCurrency(user?.id ?? null);
  const { data: audiences } = useAudiences();
  const { data: evidence } = useEvidence(valid ? cycleId : null);

  const audience = audiences?.find((a) => a.code === cycle?.audience_code) ?? null;

  const [searchParams, setSearchParams] = useSearchParams();
  const reviewMode = searchParams.get("reviewMode") === "1";
  const isManager = !!user?.id && !!cycle?.manager_id && cycle.manager_id === user.id;
  const [composerOpen, setComposerOpen] = useState(false);

  useEffect(() => {
    if (reviewMode && isManager) setComposerOpen(true);
  }, [reviewMode, isManager]);

  const handleComposerOpenChange = (open: boolean) => {
    setComposerOpen(open);
    if (!open && searchParams.has("reviewMode")) {
      const next = new URLSearchParams(searchParams);
      next.delete("reviewMode");
      setSearchParams(next, { replace: true });
    }
  };

  return (
    <AcademyLayout>
      <AcademyPageWrapper
        title="PDP Cycle"
        subtitle="Plan, evidence, reflect, review."
        icon={<Target className="h-7 w-7" />}
      >
        <div className="mb-4">
          <Button variant="ghost" size="sm" asChild>
            <Link to="/academy/pdp">
              <ArrowLeft className="mr-2 h-4 w-4" /> Back to my PDP
            </Link>
          </Button>
        </div>

        {!valid ? (
          <p className="text-sm text-destructive">Invalid cycle id.</p>
        ) : cycleLoading ? (
          <Skeleton className="h-64 w-full" />
        ) : !cycle ? (
          <p className="text-sm text-muted-foreground">Cycle not found or access denied.</p>
        ) : (
          <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
            <div className="space-y-6 min-w-0">
              <CycleHeaderBand cycle={cycle} audience={audience} />

              {reviewMode && !isManager ? (
                <Alert>
                  <AlertDescription>
                    You are not the assigned manager for this cycle, so the review composer is unavailable.
                  </AlertDescription>
                </Alert>
              ) : null}

              <Tabs defaultValue="overview" className="w-full">
                <TabsList className="grid grid-cols-5 w-full max-w-2xl">
                  <TabsTrigger value="overview">Overview</TabsTrigger>
                  <TabsTrigger value="goals">Goals</TabsTrigger>
                  <TabsTrigger value="evidence">Evidence</TabsTrigger>
                  <TabsTrigger value="reflections">Reflections</TabsTrigger>
                  <TabsTrigger value="reviews">Reviews</TabsTrigger>
                </TabsList>

                <TabsContent value="overview" className="mt-4">
                  <OverviewTab
                    summary={summary}
                    currency={currency}
                    evidence={evidence ?? []}
                    isLoading={summaryLoading}
                  />
                </TabsContent>
                <TabsContent value="goals" className="mt-4">
                  <GoalsTab cycleId={cycle.id} />
                </TabsContent>
                <TabsContent value="evidence" className="mt-4">
                  <EvidenceTab cycleId={cycle.id} />
                </TabsContent>
                <TabsContent value="reflections" className="mt-4">
                  <ReflectionsTab cycleId={cycle.id} />
                </TabsContent>
                <TabsContent value="reviews" className="mt-4">
                  <ReviewsTab cycleId={cycle.id} />
                </TabsContent>
              </Tabs>
            </div>

            <aside className="hidden lg:block">
              <div className="sticky top-4 space-y-4">
                <AuditExportCard cycleId={cycle.id} />
              </div>
            </aside>
          </div>
        )}
      </AcademyPageWrapper>

      {valid && cycle ? (
        <ReviewComposerDrawer
          open={composerOpen && isManager}
          onOpenChange={handleComposerOpenChange}
          cycleId={cycle.id}
        />
      ) : null}
    </AcademyLayout>
  );
}
