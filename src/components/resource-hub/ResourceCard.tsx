import { Resource, getCategoryLabel } from "@/types/resource";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Download, Heart, Eye, FileText, Video, ExternalLink } from "lucide-react";
import { formatDistanceToNow } from "date-fns";

interface ResourceCardProps {
  resource: Resource;
  onView: (resource: Resource) => void;
  onDownload: (resource: Resource) => void;
  onToggleFavourite: (resourceId: string, isFavourite: boolean) => void;
}

export const ResourceCard = ({
  resource,
  onView,
  onDownload,
  onToggleFavourite,
}: ResourceCardProps) => {
  const hasFile = !!resource.file_url;
  const hasVideo = !!resource.video_url;

  return (
    <div
      className="group p-4 rounded-lg border bg-card hover:shadow-md transition-all cursor-pointer"
      onClick={() => onView(resource)}
    >
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1 min-w-0">
          {/* Title and Version */}
          <div className="flex items-center gap-2 mb-1">
            <h3 className="font-semibold text-foreground truncate group-hover:text-primary transition-colors">
              {resource.title}
            </h3>
            <Badge variant="outline" className="text-xs shrink-0">
              {resource.version}
            </Badge>
          </div>

          {/* Description */}
          <p className="text-sm text-muted-foreground line-clamp-2 mb-3">
            {resource.description || "No description available"}
          </p>

          {/* Tags */}
          <div className="flex flex-wrap gap-1.5 mb-3">
            {resource.tags.slice(0, 4).map((tag) => (
              <Badge
                key={tag}
                variant="secondary"
                className="text-xs bg-primary/10 text-primary hover:bg-primary/20"
              >
                {tag}
              </Badge>
            ))}
            {resource.tags.length > 4 && (
              <Badge variant="secondary" className="text-xs">
                +{resource.tags.length - 4}
              </Badge>
            )}
          </div>

          {/* Meta info */}
          <div className="flex items-center gap-4 text-xs text-muted-foreground">
            <span className="flex items-center gap-1">
              <Eye className="h-3 w-3" />
              {resource.usage_count} views
            </span>
            <span>
              Added {formatDistanceToNow(new Date(resource.created_at), { addSuffix: true })}
            </span>
            <Badge variant="outline" className="text-xs">
              {getCategoryLabel(resource.category)}
            </Badge>
          </div>
        </div>

        {/* Actions */}
        <div className="flex flex-col items-end gap-2 shrink-0">
          {/* Favourite button */}
          <Button
            variant="ghost"
            size="icon"
            className={`h-8 w-8 ${resource.is_favourite ? "text-red-500" : "text-muted-foreground"}`}
            onClick={(e) => {
              e.stopPropagation();
              onToggleFavourite(resource.id, resource.is_favourite);
            }}
          >
            <Heart
              className={`h-4 w-4 ${resource.is_favourite ? "fill-current" : ""}`}
            />
          </Button>

          {/* Download/View button */}
          {hasFile && (
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5"
              onClick={(e) => {
                e.stopPropagation();
                onDownload(resource);
              }}
            >
              <Download className="h-3.5 w-3.5" />
              Download
            </Button>
          )}

          {hasVideo && (
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5"
              onClick={(e) => {
                e.stopPropagation();
                onView(resource);
              }}
            >
              <Video className="h-3.5 w-3.5" />
              Watch
            </Button>
          )}

          {!hasFile && !hasVideo && (
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5"
              onClick={(e) => {
                e.stopPropagation();
                onView(resource);
              }}
            >
              <ExternalLink className="h-3.5 w-3.5" />
              View
            </Button>
          )}
        </div>
      </div>

      {/* Resource type indicator */}
      <div className="absolute top-3 right-3 opacity-0 group-hover:opacity-100 transition-opacity">
        {hasVideo ? (
          <Video className="h-4 w-4 text-blue-500" />
        ) : (
          <FileText className="h-4 w-4 text-orange-500" />
        )}
      </div>
    </div>
  );
};
