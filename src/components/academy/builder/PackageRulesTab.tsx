import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { usePackagesForCourseRules, useCoursePackageRules } from "@/hooks/academy/useAcademyBuilderPickers";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import { Globe, Package, UserCheck } from "lucide-react";

export default function PackageRulesTab({ courseId }: { courseId: number }) {
  const { data: packages = [], isLoading: pkgLoading } = usePackagesForCourseRules();
  const { data: rules = [], isLoading: rulesLoading } = useCoursePackageRules(courseId);
  const qc = useQueryClient();

  const { data: course, isLoading: courseLoading } = useQuery({
    queryKey: ["academy-course-availability", courseId],
    enabled: !!courseId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("academy_courses")
        .select("id, available_to_all_clients, auto_enrol_all_clients")
        .eq("id", courseId)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const availableToAll = course?.available_to_all_clients ?? false;
  const autoEnrolAllClients = course?.auto_enrol_all_clients ?? false;

  const availabilityMutation = useMutation({
    mutationFn: async (enable: boolean) => {
      const { error } = await supabase
        .from("academy_courses")
        .update({ available_to_all_clients: enable })
        .eq("id", courseId);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["academy-course-availability", courseId] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed to update availability"),
  });

  const autoEnrolMutation = useMutation({
    mutationFn: async (enable: boolean) => {
      const { error } = await supabase
        .from("academy_courses")
        .update({ auto_enrol_all_clients: enable })
        .eq("id", courseId);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["academy-course-availability", courseId] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed to update auto-enrol"),
  });


  const toggleMutation = useMutation({
    mutationFn: async ({ packageId, enable }: { packageId: number; enable: boolean }) => {
      const existing = rules.find((r) => r.package_id === packageId);
      if (existing) {
        const { error } = await supabase
          .from("academy_package_course_rules")
          .update({ is_active: enable })
          .eq("id", existing.id);
        if (error) throw error;
      } else if (enable) {
        const { data: { user } } = await supabase.auth.getUser();
        const { error } = await supabase
          .from("academy_package_course_rules")
          .insert({ package_id: packageId, course_id: courseId, is_active: true, created_by: user?.id });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["academy-package-course-rules", courseId] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed to update"),
  });

  const isLoading = pkgLoading || rulesLoading || courseLoading;

  if (isLoading) {
    return (
      <div className="space-y-3">
        {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-14 rounded-lg" />)}
      </div>
    );
  }

  const masterToggle = (
    <div
      className="flex items-center justify-between p-4 rounded-lg border bg-muted/30"
      style={{ borderColor: "hsl(var(--border))" }}
    >
      <div className="flex items-center gap-3">
        <Globe className="h-5 w-5 text-primary" />
        <div>
          <p className="text-sm font-medium text-foreground">Available to all clients</p>
          <p className="text-xs text-muted-foreground">
            Bypass package rules and offer this course to every active client.
          </p>
        </div>
      </div>
      <Switch
        checked={availableToAll}
        onCheckedChange={(v) => availabilityMutation.mutate(v)}
        disabled={availabilityMutation.isPending}
      />
    </div>
  );

  if (availableToAll) {
    return (
      <div className="space-y-4 max-w-2xl">
        {masterToggle}
        <p className="text-sm text-muted-foreground">
          This course is available to every active client — no package configuration needed.
        </p>

        <div
          className="flex items-center justify-between p-4 rounded-lg border bg-muted/30"
          style={{ borderColor: "hsl(var(--border))" }}
        >
          <div className="flex items-center gap-3">
            <UserCheck className="h-5 w-5 text-primary" />
            <div>
              <p className="text-sm font-medium text-foreground">Auto-enrol all eligible clients</p>
              <p className="text-xs text-muted-foreground max-w-md">
                Automatically enrol every active user at a tenant with Academy access when this
                course publishes. Off by default — reserve this for genuinely mandatory training;
                most courses should let clients opt in themselves via Enrol.
              </p>
            </div>
          </div>
          <Switch
            checked={autoEnrolAllClients}
            onCheckedChange={(v) => autoEnrolMutation.mutate(v)}
            disabled={autoEnrolMutation.isPending}
          />
        </div>
      </div>
    );
  }

  if (packages.length === 0) {
    return (
      <div className="space-y-4 max-w-2xl">
        {masterToggle}
        <div className="text-center py-16 rounded-xl border" style={{ borderColor: "hsl(var(--border))" }}>
          <Package className="h-12 w-12 mx-auto mb-4 text-muted-foreground/40" />
          <p className="font-medium text-foreground">No packages available</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4 max-w-2xl">
      {masterToggle}
      <p className="text-sm text-muted-foreground">
        Enable packages to auto-enrol tenants subscribed to those packages into this course.
      </p>

      <div className="space-y-2">
        {packages.map((pkg) => {
          const rule = rules.find((r) => r.package_id === pkg.id);
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
