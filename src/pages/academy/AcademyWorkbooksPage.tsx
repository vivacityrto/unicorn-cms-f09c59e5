import { useState } from "react";
import { Download, ExternalLink, NotebookPen } from "lucide-react";
import { toast } from "sonner";
import { AcademyLayout } from "@/components/layout/AcademyLayout";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { CourseResourceTypeIcon } from "@/components/academy/CourseResourceTypeIcon";
import { useAcademyWorkbooks, type AcademyWorkbook } from "@/hooks/academy/useAcademyWorkbooks";
import { openAcademyResource } from "@/lib/academy/courseResources";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useReadOnlyGuard } from "@/hooks/useReadOnlyGuard";

export default function AcademyWorkbooksPage() {
  const { data: workbooks = [], isLoading } = useAcademyWorkbooks();
  const { user } = useAuth();
  const { isReadOnly } = useReadOnlyGuard();
  const [busyId, setBusyId] = useState<string | null>(null);

  const handleOpen = async (workbook: AcademyWorkbook) => {
    setBusyId(workbook.id);
    try {
      await openAcademyResource(workbook);
      if (!isReadOnly && user?.id) {
        const { error } = await supabase.from("resource_usage").insert({
          resource_id: workbook.id,
          user_id: user.id,
          downloaded: true,
        });
        if (error) console.error("Failed to record resource usage", error);
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not open workbook");
    } finally {
      setBusyId(null);
    }
  };

  return (
    <AcademyLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Workbooks</h1>
          <p className="text-muted-foreground">
            Download companion workbooks for your Academy courses
          </p>
        </div>

        {isLoading && (
          <div className="space-y-3">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-16 w-full" />
            ))}
          </div>
        )}

        {!isLoading && workbooks.length === 0 && (
          <Card>
            <CardContent className="py-12 text-center">
              <NotebookPen className="h-10 w-10 mx-auto mb-3 text-muted-foreground" />
              <p className="text-sm font-medium text-foreground">No workbooks available yet.</p>
              <p className="text-xs text-muted-foreground mt-1">
                Workbooks attached to your courses will appear here.
              </p>
            </CardContent>
          </Card>
        )}

        {!isLoading && workbooks.length > 0 && (
          <div className="space-y-2">
            {workbooks.map((workbook) => {
              const isLink = workbook.kind === "link";
              return (
                <div
                  key={workbook.id}
                  className="flex items-center gap-3 rounded-lg border bg-card px-4 py-3"
                >
                  <CourseResourceTypeIcon kind={workbook.kind} category="workbooks" className="h-5 w-5" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-foreground truncate">{workbook.title}</p>
                    {workbook.description && (
                      <p className="text-xs text-muted-foreground truncate">{workbook.description}</p>
                    )}
                  </div>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    isLoading={busyId === workbook.id}
                    onClick={() => handleOpen(workbook)}
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
                </div>
              );
            })}
          </div>
        )}
      </div>
    </AcademyLayout>
  );
}
