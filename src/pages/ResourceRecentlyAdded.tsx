import { useState, useMemo } from "react";
import { DashboardLayout } from "@/components/DashboardLayout";
import { useResources } from "@/hooks/useResources";
import { ResourceGrid } from "@/components/resource-hub/ResourceGrid";
import { ResourceSearch } from "@/components/resource-hub/ResourceSearch";
import { Resource } from "@/types/resource";
import { Clock } from "lucide-react";
import { toast } from "sonner";

const ResourceRecentlyAdded = () => {
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);

  const {
    useRecentResources,
    useSearchResources,
    recordUsage,
    toggleFavourite,
  } = useResources();

  const { data: recentResources = [], isLoading } = useRecentResources(50);
  const { data: searchResults = [], isLoading: searchLoading } = useSearchResources(
    searchTerm,
    selectedCategory || undefined,
    selectedTags
  );

  // Extract available tags
  const availableTags = useMemo(() => {
    const tagSet = new Set<string>();
    recentResources.forEach((r) => r.tags.forEach((t) => tagSet.add(t)));
    return Array.from(tagSet).sort();
  }, [recentResources]);

  const isSearching = searchTerm.length >= 2 || selectedCategory || selectedTags.length > 0;
  const displayResources = isSearching ? searchResults : recentResources;
  const displayLoading = isSearching ? searchLoading : isLoading;

  const handleView = (resource: Resource) => {
    recordUsage.mutate({ resourceId: resource.id, downloaded: false });
    if (resource.video_url) {
      window.open(resource.video_url, "_blank");
    } else if (resource.file_url) {
      window.open(resource.file_url, "_blank");
    } else {
      toast.info("This resource doesn't have a file or video attached yet.");
    }
  };

  const handleDownload = (resource: Resource) => {
    if (resource.file_url) {
      recordUsage.mutate({ resourceId: resource.id, downloaded: true });
      window.open(resource.file_url, "_blank");
    } else {
      toast.info("No file available for download.");
    }
  };

  const handleToggleFavourite = (resourceId: string, isFavourite: boolean) => {
    toggleFavourite(resourceId, isFavourite);
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center gap-4">
          <div className="p-3 rounded-lg bg-primary/10">
            <Clock className="h-8 w-8 text-primary" />
          </div>
          <div>
            <h1 className="text-3xl font-bold text-foreground">Recently Added</h1>
            <p className="text-muted-foreground">
              Browse the latest resources added to the library
            </p>
          </div>
        </div>

        {/* Search */}
        <ResourceSearch
          searchTerm={searchTerm}
          onSearchChange={setSearchTerm}
          selectedTags={selectedTags}
          onTagsChange={setSelectedTags}
          availableTags={availableTags}
          selectedCategory={selectedCategory}
          onCategoryChange={setSelectedCategory}
        />

        {/* Resources Grid */}
        <ResourceGrid
          resources={displayResources}
          isLoading={displayLoading}
          emptyMessage="No resources added yet"
          onView={handleView}
          onDownload={handleDownload}
          onToggleFavourite={handleToggleFavourite}
        />
      </div>
    </DashboardLayout>
  );
};

export default ResourceRecentlyAdded;
