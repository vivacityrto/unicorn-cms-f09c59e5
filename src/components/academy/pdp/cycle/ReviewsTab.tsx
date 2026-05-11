import { format, parseISO } from "date-fns";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useReviews, useSignOffReview } from "@/features/pdp/hooks";

interface Props {
  cycleId: number;
}

const TYPE_LABEL: Record<string, string> = {
  mid_cycle: "Mid-cycle",
  end_cycle: "End of cycle",
  ad_hoc: "Ad hoc",
};

const OUTCOME_VARIANT: Record<string, "default" | "secondary" | "outline" | "destructive"> = {
  on_track: "default",
  needs_action: "destructive",
  completed: "secondary",
  not_completed: "outline",
};

export function ReviewsTab({ cycleId }: Props) {
  const { data: reviews, isLoading } = useReviews(cycleId);
  const signOff = useSignOffReview(cycleId);

  if (isLoading) return <Skeleton className="h-32 w-full" />;
  if (!reviews?.length) {
    return <p className="text-sm text-muted-foreground">No reviews scheduled.</p>;
  }

  return (
    <div className="space-y-3">
      {reviews.map((r) => {
        const isPendingEndOfCycle = r.review_type === "end_cycle" && !r.signed_off_at;
        return (
          <Card key={r.id}>
            <CardContent className="p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2 mb-1">
                    <Badge variant="outline">{TYPE_LABEL[r.review_type] ?? r.review_type}</Badge>
                    {r.outcome && (
                      <Badge variant={OUTCOME_VARIANT[r.outcome] ?? "secondary"}>
                        {r.outcome.replace(/_/g, " ")}
                      </Badge>
                    )}
                    {r.signed_off_at && (
                      <Badge variant="secondary">
                        Signed {format(parseISO(r.signed_off_at), "dd/MM/yyyy")}
                      </Badge>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {r.review_date ? format(parseISO(r.review_date), "dd/MM/yyyy") : "No date"}
                  </p>
                  {r.notes && (
                    <p className="text-sm mt-2 whitespace-pre-wrap">{r.notes}</p>
                  )}
                </div>
                {isPendingEndOfCycle && (
                  <Button
                    size="sm"
                    onClick={() => signOff.mutate(r.id)}
                    disabled={signOff.isPending}
                  >
                    Sign off
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
