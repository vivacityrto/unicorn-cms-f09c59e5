import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Search, X, Filter } from "lucide-react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { RESOURCE_CATEGORIES } from "@/types/resource";

interface ResourceSearchProps {
  searchTerm: string;
  onSearchChange: (value: string) => void;
  selectedTags: string[];
  onTagsChange: (tags: string[]) => void;
  availableTags: string[];
  selectedCategory: string | null;
  onCategoryChange: (category: string | null) => void;
}

export const ResourceSearch = ({
  searchTerm,
  onSearchChange,
  selectedTags,
  onTagsChange,
  availableTags,
  selectedCategory,
  onCategoryChange,
}: ResourceSearchProps) => {
  const [isFilterOpen, setIsFilterOpen] = useState(false);

  const toggleTag = (tag: string) => {
    if (selectedTags.includes(tag)) {
      onTagsChange(selectedTags.filter((t) => t !== tag));
    } else {
      onTagsChange([...selectedTags, tag]);
    }
  };

  const clearFilters = () => {
    onSearchChange("");
    onTagsChange([]);
    onCategoryChange(null);
  };

  const hasActiveFilters =
    searchTerm.length > 0 || selectedTags.length > 0 || selectedCategory !== null;

  return (
    <div className="space-y-3">
      {/* Search and Filter Row */}
      <div className="flex items-center gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search resources..."
            value={searchTerm}
            onChange={(e) => onSearchChange(e.target.value)}
            className="pl-10 pr-10"
          />
          {searchTerm && (
            <Button
              variant="ghost"
              size="icon"
              className="absolute right-1 top-1/2 -translate-y-1/2 h-7 w-7"
              onClick={() => onSearchChange("")}
            >
              <X className="h-4 w-4" />
            </Button>
          )}
        </div>

        <Popover open={isFilterOpen} onOpenChange={setIsFilterOpen}>
          <PopoverTrigger asChild>
            <Button
              variant="outline"
              className={`gap-2 ${hasActiveFilters ? "border-primary" : ""}`}
            >
              <Filter className="h-4 w-4" />
              Filters
              {hasActiveFilters && (
                <Badge variant="secondary" className="ml-1 h-5 px-1.5">
                  {(selectedTags.length > 0 ? 1 : 0) +
                    (selectedCategory ? 1 : 0)}
                </Badge>
              )}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-80" align="end">
            <div className="space-y-4">
              {/* Category Filter */}
              <div>
                <h4 className="font-medium text-sm mb-2">Category</h4>
                <div className="flex flex-wrap gap-1.5">
                  <Badge
                    variant={selectedCategory === null ? "default" : "outline"}
                    className="cursor-pointer"
                    onClick={() => onCategoryChange(null)}
                  >
                    All
                  </Badge>
                  {RESOURCE_CATEGORIES.map((cat) => (
                    <Badge
                      key={cat.id}
                      variant={selectedCategory === cat.id ? "default" : "outline"}
                      className="cursor-pointer"
                      onClick={() => onCategoryChange(cat.id)}
                    >
                      {cat.label}
                    </Badge>
                  ))}
                </div>
              </div>

              {/* Tags Filter */}
              {availableTags.length > 0 && (
                <div>
                  <h4 className="font-medium text-sm mb-2">Tags</h4>
                  <div className="flex flex-wrap gap-1.5 max-h-32 overflow-y-auto">
                    {availableTags.slice(0, 20).map((tag) => (
                      <Badge
                        key={tag}
                        variant={selectedTags.includes(tag) ? "default" : "outline"}
                        className="cursor-pointer"
                        onClick={() => toggleTag(tag)}
                      >
                        {tag}
                      </Badge>
                    ))}
                  </div>
                </div>
              )}

              {/* Clear Filters */}
              {hasActiveFilters && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="w-full"
                  onClick={clearFilters}
                >
                  Clear all filters
                </Button>
              )}
            </div>
          </PopoverContent>
        </Popover>
      </div>

      {/* Active Filters Display */}
      {hasActiveFilters && (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm text-muted-foreground">Active filters:</span>
          {selectedCategory && (
            <Badge variant="secondary" className="gap-1">
              {RESOURCE_CATEGORIES.find((c) => c.id === selectedCategory)?.label}
              <X
                className="h-3 w-3 cursor-pointer"
                onClick={() => onCategoryChange(null)}
              />
            </Badge>
          )}
          {selectedTags.map((tag) => (
            <Badge key={tag} variant="secondary" className="gap-1">
              {tag}
              <X
                className="h-3 w-3 cursor-pointer"
                onClick={() => toggleTag(tag)}
              />
            </Badge>
          ))}
        </div>
      )}
    </div>
  );
};
