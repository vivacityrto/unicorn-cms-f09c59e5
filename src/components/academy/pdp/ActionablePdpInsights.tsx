import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { CheckCircle2, Clock3, FilePlus2, MessageSquare, Target } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useEvidence, useGoals, useReviews } from "@/features/pdp/hooks";
import type { PdpCycleSummary, PdpUserCurrency } from "@/features/pdp/types";

interface Props {
  cycleId: number;
  summary: PdpCycleSummary | null | undefined;
  currency: PdpUserCurrency | null | undefined;
  onLogEvidence: () => void;
  onAddGoal: () => void;
}

export function ActionablePdpInsights({ cycleId, summary, currency, onLogEvidence, onAddGoal }: Props) {
  const navigate = useNavigate();
  const { data: goals = [] } = useGoals(cycleId);
  const { data: evidence = [] } = useEvidence(cycleId);
  const { data: reviews = [] } = useReviews(cycleId);
  const openGoals = goals.filter((goal) => !["met", "deferred"].includes(goal.status));
  const goalsWithoutEvidence = openGoals.filter((goal) => evidence.filter((item) => item.goal_id === goal.id).length < goal.target_evidence_count);
  const hoursRemaining = Math.max(0, Number(summary?.target_pd_hours ?? 0) - Number(summary?.actual_pd_hours ?? 0));
  const reviewDue = !reviews.some((review) => review.review_type === "mid_cycle" && review.signed_off_at) && Number(currency?.days_until_cycle_end ?? 999) <= 180;

  const actions = [
    hoursRemaining > 0 ? {
      icon: Clock3,
      title: `${hoursRemaining.toFixed(1)} hours remaining`,
      detail: currency?.days_until_cycle_end != null ? `${currency.days_until_cycle_end} days left in this cycle.` : "Keep your development pace moving.",
      label: "Log evidence",
      onClick: onLogEvidence,
    } : {
      icon: CheckCircle2,
      title: "Hours target reached",
      detail: "Keep capturing evidence for the work you want to remember.",
      label: "Log evidence",
      onClick: onLogEvidence,
    },
    goalsWithoutEvidence.length > 0 ? {
      icon: Target,
      title: `${goalsWithoutEvidence.length} goal${goalsWithoutEvidence.length === 1 ? "" : "s"} need evidence`,
      detail: "Link your next learning or workplace activity to a goal.",
      label: "Add goal",
      onClick: onAddGoal,
    } : {
      icon: Target,
      title: openGoals.length ? "Goals have evidence" : "Add your first goal",
      detail: openGoals.length ? "Your active goals have supporting evidence so far." : "A clear goal makes your next action easier to choose.",
      label: "Add goal",
      onClick: onAddGoal,
    },
    {
      icon: MessageSquare,
      title: reviewDue ? "Mid-cycle check-in due" : `${summary?.reflection_count ?? 0} reflections captured`,
      detail: reviewDue ? "Use your next manager conversation to review progress and reset priorities." : "Reflect on what changed and what you will try next.",
      label: reviewDue ? "Open my PDP" : "Log evidence",
      onClick: reviewDue ? () => navigate(`/academy/pdp/cycle/${cycleId}`) : onLogEvidence,
    },
  ];

  return (
    <Card>
      <CardHeader><CardTitle className="flex items-center gap-2 text-base"><FilePlus2 className="h-4 w-4 text-primary" />Your next best actions</CardTitle></CardHeader>
      <CardContent className="grid gap-3 md:grid-cols-3">
        {actions.map(({ icon: Icon, title, detail, label, onClick }) => <div key={title} className="rounded-lg border bg-muted/20 p-4"><Icon className="h-4 w-4 text-primary" /><p className="mt-3 text-sm font-semibold">{title}</p><p className="mt-1 min-h-10 text-xs text-muted-foreground">{detail}</p>{onClick ? <Button variant="outline" size="sm" className="mt-3 w-full" onClick={onClick}>{label}</Button> : <p className="mt-3 text-xs font-medium text-muted-foreground">{label}</p>}</div>)}
      </CardContent>
    </Card>
  );
}
