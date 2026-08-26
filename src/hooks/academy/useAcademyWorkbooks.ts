import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { resourceKind, type CourseResourceKind } from "@/lib/academy/courseResources";

export interface AcademyWorkbook {
  id: string;
  title: string;
  description: string | null;
  resourceType: string;
  storageBucket: string | null;
  storagePath: string | null;
  fileUrl: string | null;
  fileName: string | null;
  createdAt: string;
  kind: CourseResourceKind;
}

export function useAcademyWorkbooks() {
  return useQuery<AcademyWorkbook[]>({
    queryKey: ["academy-workbooks"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("resource_library")
        .select(
          "id, title, description, resource_type, storage_bucket, storage_path, file_url, file_name, created_at",
        )
        .eq("category", "workbooks")
        .in("access_level", ["member", "public"])
        .order("created_at", { ascending: false });
      if (error) throw error;

      return (data ?? []).map((r: any) => ({
        id: r.id,
        title: r.title,
        description: r.description,
        resourceType: r.resource_type ?? (r.file_url && !r.storage_path ? "link" : "file"),
        storageBucket: r.storage_bucket ?? null,
        storagePath: r.storage_path ?? null,
        fileUrl: r.file_url ?? null,
        fileName: r.file_name ?? null,
        createdAt: r.created_at,
        kind: resourceKind(r),
      })) as AcademyWorkbook[];
    },
  });
}
