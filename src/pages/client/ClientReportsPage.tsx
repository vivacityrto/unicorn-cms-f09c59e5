import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { BarChart3, AlertTriangle, Sparkles } from "lucide-react";
import { useReleasedAudits } from "@/hooks/useReleasedAudits";
import { ReleasedAuditCard } from "@/components/client/ReleasedAuditCard";

export default function ClientReportsPage() {
  const { data, isLoading, error } = useReleasedAudits();

  return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-secondary">Reports</h1>
          <p className="text-muted-foreground mt-1">
            View your compliance and activity reports.
          </p>
        </div>

        {isLoading && (
          <div className="space-y-4">
            {[0, 1, 2].map((i) => (
              <Card key={i}>
                <CardContent className="p-5 space-y-3">
                  <Skeleton className="h-5 w-1/3" />
                  <Skeleton className="h-4 w-2/3" />
                  <Skeleton className="h-4 w-1/4" />
                  <div className="flex justify-end gap-2 pt-2">
                    <Skeleton className="h-8 w-28" />
                    <Skeleton className="h-8 w-32" />
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        {!isLoading && error && (
          <Card>
            <CardContent className="py-8 text-center">
              <AlertTriangle className="h-10 w-10 mx-auto mb-3 text-destructive" />
              <p className="text-muted-foreground">
                Couldn't load your reports. Try refreshing.
              </p>
            </CardContent>
          </Card>
        )}

        {!isLoading && !error && (data?.length ?? 0) === 0 && (
          <Card>
            <CardContent className="py-12 text-center">
              <BarChart3 className="h-12 w-12 mx-auto mb-4 text-muted-foreground opacity-50" />
              <p className="text-muted-foreground font-medium">
                Reports will be available here.
              </p>
              <p className="text-sm text-muted-foreground mt-1">
                Once your consultant releases an audit report, it will appear
                here.
              </p>
            </CardContent>
          </Card>
        )}

        {!isLoading && !error && (data?.length ?? 0) > 0 && (
          <div className="space-y-4">
            {data!.map((audit) => (
              <ReleasedAuditCard key={audit.id} audit={audit} />
            ))}
          </div>
        )}

        {/* Coming-soon: Assessment Validation */}
        <Card className="border-dashed">
          <CardContent className="p-5">
            <div className="flex items-start gap-3">
              <Sparkles className="h-5 w-5 mt-0.5 text-primary" />
              <div>
                <h3 className="font-semibold text-secondary">
                  Assessment Validation
                </h3>
                <p className="text-sm text-muted-foreground mt-1">
                  We're building an assessment validation tool to give you
                  deeper insight into how your assessments are performing.
                  Coming soon.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
  );
}
