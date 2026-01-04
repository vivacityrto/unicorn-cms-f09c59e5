import { useState, useMemo } from "react";
import { useParams } from "react-router-dom";
import { DashboardLayout } from "@/components/DashboardLayout";
import { useResources } from "@/hooks/useResources";
import { ResourceGrid } from "@/components/resource-hub/ResourceGrid";
import { ResourceSearch } from "@/components/resource-hub/ResourceSearch";
import { Resource, RESOURCE_CATEGORIES, getCategoryLabel } from "@/types/resource";
import { toast } from "sonner";
import { 
  FileText, 
  CheckSquare, 
  ClipboardList, 
  Search, 
  Video, 
  BookOpen, 
  TrendingUp 
} from "lucide-react";

const categoryIcons: Record<string, React.ElementType> = {
  templates: FileText,
  checklists: CheckSquare,
  "registers-forms": ClipboardList,
  "audit-evidence": Search,
  "training-webinars": Video,
  "guides-howto": BookOpen,
  "ci-tools": TrendingUp,
};

interface ResourceCategoryPageProps {
  categoryId?: string;
}

const ResourceCategoryPage = ({ categoryId: propCategoryId }: ResourceCategoryPageProps) => {
  const { category: paramCategory } = useParams<{ category: string }>();
  const categoryId = propCategoryId || paramCategory || "";
  
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedTags, setSelectedTags] = useState<string[]>([]);

  const {
    useResourcesByCategory,
    useSearchResources,
    recordUsage,
    toggleFavourite,
  } = useResources();

  const { data: categoryResources = [], isLoading } = useResourcesByCategory(categoryId);
  const { data: searchResults = [], isLoading: searchLoading } = useSearchResources(
    searchTerm,
    categoryId,
    selectedTags
  );

  // Extract available tags from category resources
  const availableTags = useMemo(() => {
    const tagSet = new Set<string>();
    categoryResources.forEach((r) => r.tags.forEach((t) => tagSet.add(t)));
    return Array.from(tagSet).sort();
  }, [categoryResources]);

  const isSearching = searchTerm.length >= 2 || selectedTags.length > 0;
  const displayResources = isSearching ? searchResults : categoryResources;
  const displayLoading = isSearching ? searchLoading : isLoading;

  const category = RESOURCE_CATEGORIES.find((c) => c.id === categoryId);
  const CategoryIcon = categoryIcons[categoryId] || FileText;

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
            <CategoryIcon className="h-8 w-8 text-primary" />
          </div>
          <div>
            <h1 className="text-3xl font-bold text-foreground">
              {category?.label || getCategoryLabel(categoryId)}
            </h1>
            <p className="text-muted-foreground">
              {category?.description || `Browse ${getCategoryLabel(categoryId)} resources`}
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
          selectedCategory={null}
          onCategoryChange={() => {}}
        />

        {/* Resources Grid */}
        <ResourceGrid
          resources={displayResources}
          isLoading={displayLoading}
          emptyMessage={`No ${getCategoryLabel(categoryId).toLowerCase()} resources found`}
          onView={handleView}
          onDownload={handleDownload}
          onToggleFavourite={handleToggleFavourite}
        />
      </div>
    </DashboardLayout>
  );
};

export default ResourceCategoryPage;
