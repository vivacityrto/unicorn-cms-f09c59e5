import { DashboardLayout } from "@/components/DashboardLayout";
import { useResources } from "@/hooks/useResources";
import { Resource, getCategoryLabel } from "@/types/resource";
import { formatDistanceToNow, format } from "date-fns";
import { Clock, FileText, Plus, RefreshCw } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";

const ResourceUpdatesLog = () => {
  const { useAllResources } = useResources();
  const { data: resources = [], isLoading } = useAllResources();

  // Sort by updated_at descending to show most recent changes first
  const sortedResources = [...resources].sort(
    (a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime()
  );

  // Group by date
  const groupedByDate = sortedResources.reduce((acc, resource) => {
    const dateKey = format(new Date(resource.created_at), "yyyy-MM-dd");
    if (!acc[dateKey]) {
      acc[dateKey] = [];
    }
    acc[dateKey].push(resource);
    return acc;
  }, {} as Record<string, Resource[]>);

  const dateKeys = Object.keys(groupedByDate).sort((a, b) => b.localeCompare(a));

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center gap-4">
          <div className="p-3 rounded-lg bg-primary/10">
            <Clock className="h-8 w-8 text-primary" />
          </div>
          <div>
            <h1 className="text-3xl font-bold text-foreground">Updates Log</h1>
            <p className="text-muted-foreground">
              Track all resource additions and updates
            </p>
          </div>
        </div>

        {/* Timeline */}
        <div className="space-y-8">
          {isLoading ? (
            <div className="space-y-4">
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="flex gap-4">
                  <Skeleton className="h-10 w-10 rounded-full" />
                  <div className="flex-1 space-y-2">
                    <Skeleton className="h-4 w-1/3" />
                    <Skeleton className="h-4 w-2/3" />
                  </div>
                </div>
              ))}
            </div>
          ) : sortedResources.length === 0 ? (
            <div className="text-center py-12">
              <div className="rounded-full bg-muted p-4 w-fit mx-auto mb-4">
                <FileText className="h-8 w-8 text-muted-foreground" />
              </div>
              <h3 className="font-medium text-lg mb-1">No updates yet</h3>
              <p className="text-muted-foreground text-sm">
                Resource changes will appear here
              </p>
            </div>
          ) : (
            dateKeys.map((dateKey) => (
              <div key={dateKey}>
                <h3 className="text-sm font-semibold text-muted-foreground mb-4 sticky top-0 bg-background py-2">
                  {format(new Date(dateKey), "EEEE, MMMM d, yyyy")}
                </h3>
                <div className="space-y-4 border-l-2 border-border pl-6 ml-2">
                  {groupedByDate[dateKey].map((resource) => {
                    const isNew =
                      new Date(resource.created_at).getTime() ===
                      new Date(resource.updated_at).getTime();
                    return (
                      <div
                        key={resource.id}
                        className="relative group"
                      >
                        {/* Timeline dot */}
                        <div className="absolute -left-[31px] top-1 w-4 h-4 rounded-full bg-background border-2 border-primary flex items-center justify-center">
                          {isNew ? (
                            <Plus className="h-2 w-2 text-primary" />
                          ) : (
                            <RefreshCw className="h-2 w-2 text-primary" />
                          )}
                        </div>

                        <div className="p-4 rounded-lg border bg-card hover:shadow-sm transition-shadow">
                          <div className="flex items-start justify-between gap-4">
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 mb-1">
                                <Badge
                                  variant={isNew ? "default" : "secondary"}
                                  className="text-xs"
                                >
                                  {isNew ? "Added" : "Updated"}
                                </Badge>
                                <Badge variant="outline" className="text-xs">
                                  {resource.version}
                                </Badge>
                              </div>
                              <h4 className="font-medium text-foreground">
                                {resource.title}
                              </h4>
                              <p className="text-sm text-muted-foreground line-clamp-1">
                                {resource.description}
                              </p>
                              <div className="flex items-center gap-3 mt-2 text-xs text-muted-foreground">
                                <Badge variant="outline">
                                  {getCategoryLabel(resource.category)}
                                </Badge>
                                <span>
                                  {formatDistanceToNow(new Date(resource.created_at), {
                                    addSuffix: true,
                                  })}
                                </span>
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </DashboardLayout>
  );
};

export default ResourceUpdatesLog;
