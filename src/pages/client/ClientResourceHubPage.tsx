/**
 * Client-facing Resource Hub page — read-only, tenant-safe.
 *
 * CLIENT-SAFE DATA ACCESS CHECKLIST
 * ✅ 1. Source data filtered by is_published = true (global resources, no tenant join needed)
 * ✅ 2. RLS: public read for published resources
 * ✅ 3. No admin endpoints called
 * ✅ 4. No global unfiltered lists — all queries scoped to published resources
 * ✅ 5. Links stay within /client/* namespace
 * ✅ 6. UI is read-only — no create/edit/upload controls; "Request a resource" CTA only
 * ✅ 7. No role escalation
 */

import { useState, useMemo } from "react";
import { useResources } from "@/hooks/useResources";
import { ResourceGrid } from "@/components/resource-hub/ResourceGrid";
import { ResourceSearch } from "@/components/resource-hub/ResourceSearch";
import { Resource, RESOURCE_CATEGORIES, getClientCategoryPath } from "@/types/resource";
import { Link } from "react-router-dom";
import {
  FileText,
  CheckSquare,
  ClipboardList,
  Search,
  Video,
  BookOpen,
  TrendingUp,
  Clock,
  Star,
  ArrowRight,
  MessageSquarePlus,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

const categoryIcons: Record<string, React.ElementType> = {
  templates: FileText,
  checklists: CheckSquare,
  "registers-forms": ClipboardList,
  "audit-evidence": Search,
  "training-webinars": Video,
  "guides-howto": BookOpen,
  "ci-tools": TrendingUp,
};

const ClientResourceHubPage = () => {
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);

  const {
    useRecentResources,
    useMostUsedResources,
    useAllResources,
    useSearchResources,
    recordUsage,
    toggleFavourite,
  } = useResources();

  const { data: recentResources = [], isLoading: recentLoading } = useRecentResources(6);
  const { data: mostUsedResources = [], isLoading: mostUsedLoading } = useMostUsedResources(6);
  const { data: allResources = [] } = useAllResources();
  const { data: searchResults = [], isLoading: searchLoading } = useSearchResources(
    searchTerm,
    selectedCategory || undefined,
    selectedTags
  );

  const availableTags = useMemo(() => {
    const tagSet = new Set<string>();
    allResources.forEach((r) => r.tags.forEach((t) => tagSet.add(t)));
    return Array.from(tagSet).sort();
  }, [allResources]);

  const isSearching = searchTerm.length >= 2 || selectedCategory || selectedTags.length > 0;

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
    <div className="space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-foreground">Resource Hub</h1>
          <p className="text-muted-foreground mt-1">
            Browse compliance resources, templates, and guides
          </p>
        </div>
        <Button variant="outline" className="gap-2" onClick={() => toast.info("Resource request feature coming soon.")}>
          <MessageSquarePlus className="h-4 w-4" />
          Request a Resource
        </Button>
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

      {/* Search Results or Dashboard Content */}
      {isSearching ? (
        <div>
          <h2 className="text-xl font-semibold mb-4">Search Results</h2>
          <ResourceGrid
            resources={searchResults}
            isLoading={searchLoading}
            emptyMessage="No resources match your search criteria"
            onView={handleView}
            onDownload={handleDownload}
            onToggleFavourite={handleToggleFavourite}
          />
        </div>
      ) : (
        <>
          {/* Category Quick Links — using /client/resource-hub/* paths */}
          <div>
            <h2 className="text-xl font-semibold mb-4">Browse by Category</h2>
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
              {RESOURCE_CATEGORIES.map((category) => {
                const Icon = categoryIcons[category.id] || FileText;
                return (
                  <Link
                    key={category.id}
                    to={getClientCategoryPath(category.id)}
                    className="group p-4 rounded-lg border bg-card hover:shadow-md transition-all"
                  >
                    <div className="flex items-center gap-3">
                      <div className="p-2 rounded-lg bg-primary/10 group-hover:bg-primary/20 transition-colors">
                        <Icon className="h-5 w-5 text-primary" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <h3 className="font-medium text-foreground group-hover:text-primary transition-colors truncate">
                          {category.label}
                        </h3>
                        <p className="text-xs text-muted-foreground truncate">
                          {category.description}
                        </p>
                      </div>
                      <ArrowRight className="h-4 w-4 text-muted-foreground group-hover:text-primary transition-colors" />
                    </div>
                  </Link>
                );
              })}
            </div>
          </div>

          {/* Recently Added */}
          <div>
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <Clock className="h-5 w-5 text-muted-foreground" />
                <h2 className="text-xl font-semibold">Recently Added</h2>
              </div>
            </div>
            <ResourceGrid
              resources={recentResources}
              isLoading={recentLoading}
              emptyMessage="No resources added yet"
              onView={handleView}
              onDownload={handleDownload}
              onToggleFavourite={handleToggleFavourite}
            />
          </div>

          {/* Most Used */}
          <div>
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <Star className="h-5 w-5 text-muted-foreground" />
                <h2 className="text-xl font-semibold">Most Popular</h2>
              </div>
            </div>
            <ResourceGrid
              resources={mostUsedResources}
              isLoading={mostUsedLoading}
              emptyMessage="No usage data yet"
              onView={handleView}
              onDownload={handleDownload}
              onToggleFavourite={handleToggleFavourite}
            />
          </div>
        </>
      )}
    </div>
  );
};

export default ClientResourceHubPage;
