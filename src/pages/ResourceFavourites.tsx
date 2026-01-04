import { useState, useMemo } from "react";
import { DashboardLayout } from "@/components/DashboardLayout";
import { useResources } from "@/hooks/useResources";
import { ResourceGrid } from "@/components/resource-hub/ResourceGrid";
import { ResourceSearch } from "@/components/resource-hub/ResourceSearch";
import { Resource } from "@/types/resource";
import { Heart } from "lucide-react";
import { toast } from "sonner";

const ResourceFavourites = () => {
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);

  const {
    useFavouriteResources,
    recordUsage,
    toggleFavourite,
  } = useResources();

  const { data: favouriteResources = [], isLoading } = useFavouriteResources();

  // Filter favourites based on search
  const filteredResources = useMemo(() => {
    let result = [...favouriteResources];

    if (searchTerm.length >= 2) {
      const term = searchTerm.toLowerCase();
      result = result.filter(
        (r) =>
          r.title.toLowerCase().includes(term) ||
          r.description?.toLowerCase().includes(term)
      );
    }

    if (selectedCategory) {
      result = result.filter((r) => r.category === selectedCategory);
    }

    if (selectedTags.length > 0) {
      result = result.filter((r) =>
        selectedTags.some((tag) => r.tags.includes(tag))
      );
    }

    return result;
  }, [favouriteResources, searchTerm, selectedCategory, selectedTags]);

  // Extract available tags
  const availableTags = useMemo(() => {
    const tagSet = new Set<string>();
    favouriteResources.forEach((r) => r.tags.forEach((t) => tagSet.add(t)));
    return Array.from(tagSet).sort();
  }, [favouriteResources]);

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
          <div className="p-3 rounded-lg bg-red-500/10">
            <Heart className="h-8 w-8 text-red-500" />
          </div>
          <div>
            <h1 className="text-3xl font-bold text-foreground">My Favourites</h1>
            <p className="text-muted-foreground">
              Quick access to your saved resources
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
          resources={filteredResources}
          isLoading={isLoading}
          emptyMessage="You haven't added any favourites yet. Click the heart icon on any resource to save it here."
          onView={handleView}
          onDownload={handleDownload}
          onToggleFavourite={handleToggleFavourite}
        />
      </div>
    </DashboardLayout>
  );
};

export default ResourceFavourites;
