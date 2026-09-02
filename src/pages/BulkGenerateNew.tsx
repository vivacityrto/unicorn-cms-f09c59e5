import { useMemo } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useUserAccess } from "@/hooks/useUserAccess";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ArrowLeft } from "lucide-react";

import { TargetedMode } from "@/components/documents/bulk-generate/targeted/TargetedMode";

type ActiveTenant = { id: number; name: string | null; rto_name: string | null };

export default function BulkGenerateNew() {
  const { isVivacityStaff, isLoading: accessLoading } = useUserAccess();

  const { data: activeTenants = [] } = useQuery({
    queryKey: ["bulk-generate", "active-tenants-page"],
    enabled: isVivacityStaff,
    staleTime: 60_000,
    queryFn: async (): Promise<ActiveTenant[]> => {
      const { data, error } = await supabase
        .from("tenants")
        .select("id, name, rto_name, status, is_system_tenant")
        .eq("status", "active")
        .eq("is_system_tenant", false)
        .order("name", { ascending: true });
      if (error) throw error;
      return ((data ?? []) as unknown as ActiveTenant[]).filter(
        (t) => !/^test/i.test(t.name ?? ""),
      );
    },
  });

  const tenants = useMemo(() => activeTenants, [activeTenants]);

  if (accessLoading) {
    return (
      <div className="p-6 space-y-4">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-96 w-full" />
      </div>
    );
  }

  if (!isVivacityStaff) {
    return (
      <div className="p-6">
        <div className="rounded-md border p-6 text-sm text-muted-foreground">
          You don't have access to this page.
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 flex flex-col h-[calc(100vh-4rem)] animate-fade-in">
        <div className="flex items-center justify-between mb-3 shrink-0">
          <div className="flex items-center gap-3">
            <Button asChild variant="ghost" size="sm">
              <Link to="/manage-documents">
                <ArrowLeft className="h-4 w-4 mr-1" />
                Back to documents
              </Link>
            </Button>
            <div>
              <h1 className="text-xl font-semibold">Bulk generate documents</h1>
              <p className="text-sm text-muted-foreground">
                Select clients, packages and stages to generate templated documents.
              </p>
            </div>
          </div>
          <Button asChild variant="outline" size="sm">
            <Link to="/manage-documents/bulk-jobs">View job history</Link>
          </Button>
        </div>

        <div className="flex-1 min-h-0">
          <TargetedMode tenants={tenants} />
        </div>
      </div>
  );
}
