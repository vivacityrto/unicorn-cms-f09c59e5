import { useState } from "react";
import { Target } from "lucide-react";
import { AcademyLayout } from "@/components/layout/AcademyLayout";
import AcademyPageWrapper from "@/components/academy/AcademyPageWrapper";
import { Skeleton } from "@/components/ui/skeleton";
import { useAuth } from "@/hooks/useAuth";
import {
  useAudiences,
  useCurrentCycle,
  useCycleSummary,
  useUnattachedReflections,
  useUserCurrency,
} from "@/features/pdp/hooks";
import { Badge } from "@/components/ui/badge";
import { Sparkles } from "lucide-react";
import type { PdpEvidenceItem } from "@/features/pdp/types";
import { PdpHeaderBand } from "@/components/academy/pdp/PdpHeaderBand";
import { PdpProgressCard } from "@/components/academy/pdp/PdpProgressCard";
import { PdpActionRow } from "@/components/academy/pdp/PdpActionRow";
import { RecommendedCoursesPanel } from "@/components/academy/pdp/RecommendedCoursesPanel";
import { RecentEvidenceList } from "@/components/academy/pdp/RecentEvidenceList";
import { StartCycleEmptyState } from "@/components/academy/pdp/StartCycleEmptyState";
import { AddEvidenceSheet } from "@/components/academy/pdp/AddEvidenceSheet";
import { AddGoalSheet } from "@/components/academy/pdp/AddGoalSheet";
import { AddReflectionDrawer } from "@/components/academy/pdp/AddReflectionDrawer";

export default function AcademyPdpPage() {
  const { user, profile, loading: authLoading } = useAuth();
  const userId = user?.id ?? null;
  const tenantId = profile?.tenant_id ?? null;

  const { data: cycle, isLoading: cycleLoading } = useCurrentCycle(userId, tenantId);
  const { data: summary, isLoading: summaryLoading } = useCycleSummary(cycle?.id);
  const { data: currency } = useUserCurrency(userId);
  const { data: audiences } = useAudiences();
  const audience = audiences?.find((a) => a.code === cycle?.audience_code) ?? null;
  const { data: unattached } = useUnattachedReflections(userId);
  const unattachedCount = unattached?.count ?? 0;

  const [evidenceOpen, setEvidenceOpen] = useState(false);
  const [goalOpen, setGoalOpen] = useState(false);
  const [reflectionEvidence, setReflectionEvidence] = useState<PdpEvidenceItem | null>(null);
  const [reflectionOpen, setReflectionOpen] = useState(false);

  const initialLoading = authLoading || cycleLoading;

  return (
    <AcademyLayout>
      <AcademyPageWrapper
        title="My Professional Development Plan"
        subtitle="Track your hours, goals, evidence, and reflections in one place."
        icon={<Target className="h-7 w-7" />}
      >
        <div className="space-y-6">
          {initialLoading ? (
            <Skeleton className="h-48 w-full" />
          ) : !userId ? (
            <p className="text-sm text-muted-foreground">Sign in to view your PDP.</p>
          ) : !cycle ? (
            <StartCycleEmptyState userId={userId} tenantId={tenantId} />
          ) : (
            <>
              <PdpHeaderBand cycle={cycle} audience={audience} />

              <PdpProgressCard
                summary={summary ?? null}
                currency={currency ?? null}
                isLoading={summaryLoading}
              />

              <PdpActionRow
                cycleId={cycle.id}
                onLogEvidence={() => setEvidenceOpen(true)}
                onAddGoal={() => setGoalOpen(true)}
              />

              <RecommendedCoursesPanel audienceCode={cycle.audience_code} userId={userId} />

              <RecentEvidenceList
                cycleId={cycle.id}
                onAddReflection={(e) => {
                  setReflectionEvidence(e);
                  setReflectionOpen(true);
                }}
              />
            </>
          )}
        </div>

        <AddEvidenceSheet
          open={evidenceOpen}
          onOpenChange={setEvidenceOpen}
          cycleId={cycle?.id ?? null}
        />
        <AddGoalSheet
          open={goalOpen}
          onOpenChange={setGoalOpen}
          cycleId={cycle?.id ?? null}
        />
        <AddReflectionDrawer
          open={reflectionOpen}
          onOpenChange={setReflectionOpen}
          evidence={reflectionEvidence}
        />
      </AcademyPageWrapper>
    </AcademyLayout>
  );
}
