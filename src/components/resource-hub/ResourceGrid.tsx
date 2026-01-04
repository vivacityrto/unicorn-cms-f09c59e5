import { Resource } from "@/types/resource";
import { ResourceCard } from "./ResourceCard";
import { Skeleton } from "@/components/ui/skeleton";

interface ResourceGridProps {
  resources: Resource[];
  isLoading: boolean;
  emptyMessage?: string;
  onView: (resource: Resource) => void;
  onDownload: (resource: Resource) => void;
  onToggleFavourite: (resourceId: string, isFavourite: boolean) => void;
}

export const ResourceGrid = ({
  resources,
  isLoading,
  emptyMessage = "No resources found",
  onView,
  onDownload,
  onToggleFavourite,
}: ResourceGridProps) => {
  if (isLoading) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="p-4 rounded-lg border bg-card">
            <div className="flex items-start justify-between gap-4">
              <div className="flex-1 space-y-3">
                <Skeleton className="h-5 w-3/4" />
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-2/3" />
                <div className="flex gap-1.5">
                  <Skeleton className="h-5 w-16" />
                  <Skeleton className="h-5 w-16" />
                  <Skeleton className="h-5 w-16" />
                </div>
              </div>
              <div className="flex flex-col gap-2">
                <Skeleton className="h-8 w-8" />
                <Skeleton className="h-8 w-20" />
              </div>
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (resources.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center">
        <div className="rounded-full bg-muted p-4 mb-4">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            className="h-8 w-8 text-muted-foreground"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
            />
          </svg>
        </div>
        <h3 className="font-medium text-lg mb-1">No resources found</h3>
        <p className="text-muted-foreground text-sm">{emptyMessage}</p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
      {resources.map((resource) => (
        <ResourceCard
          key={resource.id}
          resource={resource}
          onView={onView}
          onDownload={onDownload}
          onToggleFavourite={onToggleFavourite}
        />
      ))}
    </div>
  );
};
