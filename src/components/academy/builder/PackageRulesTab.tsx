import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { usePackagesForCourseRules, useCoursePackageRules } from "@/hooks/academy/useAcademyBuilderPickers";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import { Package } from "lucide-react";

export default function PackageRulesTab({ courseId }: { courseId: number }) {
  const { data: packages = [], isLoading: pkgLoading } = usePackagesForCourseRules();
  const { data: rules = [], isLoading: rulesLoading } = useCoursePackageRules(courseId);
  const qc = useQueryClient();

  const toggleMutation = useMutation({
    mutationFn: async ({ packageId, enable }: { packageId: number; enable: boolean }) => {
      const existing = rules.find((r: any) => r.package_id === packageId);
      if (existing) {
        const { error } = await supabase
          .from("academy_package_course_rules")
          .update({ is_active: enable } as any)
          .eq("id", existing.id);
        if (error) throw error;
      } else if (enable) {
        const { data: { user } } = await supabase.auth.getUser();
        const { error } = await supabase
          .from("academy_package_course_rules")
          .insert({ package_id: packageId, course_id: courseId, is_active: true, created_by: user?.id } as any);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["academy-package-course-rules", courseId] });
    },
    onError: (e: any) => toast.error(e?.message || "Failed to update"),
  });

  const isLoading = pkgLoading || rulesLoading;

  if (isLoading) {
    return (
      <div className="space-y-3">
        {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-14 rounded-lg" />)}
      </div>
    );
  }

  if (packages.length === 0) {
    return (
      <div className="text-center py-16 rounded-xl border" style={{ borderColor: "hsl(var(--border))" }}>
        <Package className="h-12 w-12 mx-auto mb-4 text-muted-foreground/40" />
        <p className="font-medium text-foreground">No packages available</p>
      </div>
    );
  }

  return (
    <div className="space-y-4 max-w-2xl">
      <p className="text-sm text-muted-foreground">
        Enable packages to auto-enrol tenants subscribed to those packages into this course.
      </p>
      <div className="space-y-2">
        {packages.map((pkg: any) => {
          const rule = rules.find((r: any) => r.package_id === pkg.id);
          const isActive = rule?.is_active ?? false;
          return (
            <div
              key={pkg.id}
              className="flex items-center justify-between p-4 rounded-lg border"
              style={{ borderColor: "hsl(var(--border))" }}
            >
              <div className="flex items-center gap-3">
                <Package className="h-5 w-5 text-muted-foreground" />
                <div>
                  <p className="text-sm font-medium text-foreground">{pkg.name}</p>
                  {pkg.package_type && (
                    <Badge variant="outline" className="text-[10px] mt-0.5">{pkg.package_type}</Badge>
                  )}
                </div>
              </div>
              <Switch
                checked={isActive}
                onCheckedChange={(v) => toggleMutation.mutate({ packageId: pkg.id, enable: v })}
                disabled={toggleMutation.isPending}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}
