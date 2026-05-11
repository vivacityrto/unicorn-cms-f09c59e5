import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { BookOpen, Clock, Play } from "lucide-react";
import {
  useRecommendedAcademyCourses,
  useStartAcademyCourseFromPdp,
} from "@/features/pdp/hooks";

interface Props {
  audienceCode: string | null | undefined;
  userId: string | null | undefined;
}

function durationLabel(minutes: number | null): string {
  if (!minutes) return "—";
  if (minutes < 60) return `${minutes} min`;
  const h = Math.round(minutes / 60);
  return `${h} hour${h === 1 ? "" : "s"}`;
}

export function RecommendedCoursesPanel({ audienceCode, userId }: Props) {
  const { data, isLoading } = useRecommendedAcademyCourses(audienceCode, userId);
  const start = useStartAcademyCourseFromPdp(userId);

  if (!audienceCode) return null;

  return (
    <section>
      <h2 className="text-lg font-semibold text-foreground mb-3">Recommended courses</h2>

      {isLoading && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-32 w-full" />
          ))}
        </div>
      )}

      {!isLoading && (!data || data.length === 0) && (
        <Card>
          <CardContent className="py-6 text-center text-sm text-muted-foreground">
            <BookOpen className="h-6 w-6 mx-auto mb-2 opacity-50" />
            No new recommended courses for your audience right now.
          </CardContent>
        </Card>
      )}

      {!isLoading && data && data.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {data.map((c) => (
            <Card key={c.id}>
              <CardContent className="p-4 space-y-3">
                <h3 className="font-semibold text-sm leading-tight line-clamp-2">{c.title}</h3>
                {c.short_description && (
                  <p className="text-xs text-muted-foreground line-clamp-2">
                    {c.short_description}
                  </p>
                )}
                <div className="flex items-center gap-1 text-xs text-muted-foreground">
                  <Clock className="h-3.5 w-3.5" />
                  {durationLabel(c.estimated_minutes)}
                </div>
                <Button
                  size="sm"
                  className="w-full text-white hover:opacity-90"
                  style={{ backgroundColor: "#23C0DD" }}
                  onClick={() => start.mutate(c.id)}
                  disabled={start.isPending}
                >
                  <Play className="mr-2 h-3.5 w-3.5" />
                  Start course
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </section>
  );
}
