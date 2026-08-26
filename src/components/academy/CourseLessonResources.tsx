import { useState } from "react";
import { Download, ExternalLink } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { CourseResourceTypeIcon } from "@/components/academy/CourseResourceTypeIcon";
import { useAcademyCourseResources, type CourseResource } from "@/hooks/academy/useAcademyCourseResources";
import { openAcademyResource } from "@/lib/academy/courseResources";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useReadOnlyGuard } from "@/hooks/useReadOnlyGuard";

export default function CourseLessonResources({ courseId }: { courseId: number }) {
  const { data: resources = [], isLoading } = useAcademyCourseResources(courseId);
  const { user } = useAuth();
  const { isReadOnly } = useReadOnlyGuard();
  const [busyId, setBusyId] = useState<string | null>(null);

  if (isLoading || resources.length === 0) return null;

  const handleOpen = async (resource: CourseResource) => {
    setBusyId(resource.resourceId);
    try {
      await openAcademyResource(resource);
      if (!isReadOnly && user?.id) {
        const { error } = await supabase.from("resource_usage").insert({
          resource_id: resource.resourceId,
          user_id: user.id,
          downloaded: true,
        });
        if (error) {
          console.error("Failed to record resource usage", error);
        }
      }
    } catch (e: any) {
      toast.error(e?.message || "Could not open resource");
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="space-y-2">
      <h2 className="text-sm font-semibold text-foreground">Resources</h2>
      <ul className="space-y-1.5">
        {resources.map((resource) => {
          const isLink = resource.kind === "link";
          return (
            <li
              key={resource.linkId}
              className="flex items-center gap-2 min-w-0 rounded-lg border px-3 py-2"
              style={{ borderColor: "hsl(var(--border))" }}
            >
              <CourseResourceTypeIcon kind={resource.kind} category={resource.category} />
              <span className="flex-1 min-w-0 truncate text-sm text-foreground" title={resource.title}>
                {resource.title}
              </span>
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="flex-shrink-0"
                isLoading={busyId === resource.resourceId}
                onClick={() => handleOpen(resource)}
              >
                {isLink ? (
                  <>
                    <ExternalLink className="h-3.5 w-3.5" /> Open
                  </>
                ) : (
                  <>
                    <Download className="h-3.5 w-3.5" /> Download
                  </>
                )}
              </Button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
