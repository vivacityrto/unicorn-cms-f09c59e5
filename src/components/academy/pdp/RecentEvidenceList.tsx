import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Award,
  BookOpen,
  Briefcase,
  CheckCircle2,
  FileText,
  GraduationCap,
  Mic,
  Users,
  Wrench,
} from "lucide-react";
import { format, parseISO } from "date-fns";
import { useEvidence } from "@/features/pdp/hooks";
import type { PdpEvidenceItem, PdpEvidenceType } from "@/features/pdp/types";

interface Props {
  cycleId: number | null;
  onAddReflection: (evidence: PdpEvidenceItem) => void;
}

const ICONS: Record<string, React.ReactNode> = {
  academy_completion:    <GraduationCap className="h-4 w-4" />,
  academy_certificate:   <Award className="h-4 w-4" />,
  external_course:       <BookOpen className="h-4 w-4" />,
  workshop:              <Wrench className="h-4 w-4" />,
  industry_placement:    <Briefcase className="h-4 w-4" />,
  validation_activity:   <CheckCircle2 className="h-4 w-4" />,
  community_of_practice: <Users className="h-4 w-4" />,
  conference:            <Mic className="h-4 w-4" />,
  mentoring:             <Users className="h-4 w-4" />,
  reading:               <BookOpen className="h-4 w-4" />,
  audit_response:        <FileText className="h-4 w-4" />,
  other:                 <FileText className="h-4 w-4" />,
};

function fmtDate(iso: string): string {
  try {
    return format(parseISO(iso), "dd/MM/yyyy");
  } catch {
    return iso;
  }
}

function fmtHours(minutes: number | null): string {
  if (!minutes) return "";
  const h = minutes / 60;
  return `${h.toFixed(1)}h`;
}

export function RecentEvidenceList({ cycleId, onAddReflection }: Props) {
  const { data, isLoading } = useEvidence(cycleId);
  const items = (data ?? []).slice(0, 5);

  return (
    <section>
      <h2 className="text-lg font-semibold text-foreground mb-3">Recent evidence</h2>

      {isLoading && (
        <div className="space-y-2">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-16 w-full" />
          ))}
        </div>
      )}

      {!isLoading && items.length === 0 && (
        <Card>
          <CardContent className="py-6 text-center text-sm text-muted-foreground">
            No evidence logged yet — start by tapping "Log evidence" above.
          </CardContent>
        </Card>
      )}

      {!isLoading && items.length > 0 && (
        <div className="space-y-2">
          {items.map((e) => {
            const icon = ICONS[e.evidence_type as PdpEvidenceType] ?? ICONS.other;
            const hours = fmtHours(e.duration_minutes);
            return (
              <Card key={e.id}>
                <CardContent className="p-3 flex items-center gap-3">
                  <div className="h-9 w-9 rounded-md bg-muted flex items-center justify-center text-muted-foreground flex-shrink-0">
                    {icon}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-foreground truncate">{e.title}</p>
                    <p className="text-xs text-muted-foreground">
                      {fmtDate(e.occurred_on)}
                      {hours && <> · {hours}</>}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => onAddReflection(e)}
                    className="text-xs font-medium hover:underline flex-shrink-0"
                    style={{ color: "#7130A0" }}
                  >
                    Add reflection
                  </button>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </section>
  );
}
