import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import {
  bucketForUpload,
  isAllowedUploadFile,
  isHttpsUrl,
  mimeForUpload,
  REJECTED_FILE_MESSAGE,
  resourceKind,
  storagePathForResource,
  type CourseResourceKind,
} from "@/lib/academy/courseResources";

export const COURSE_RESOURCES_KEY = "academy-course-resources";

export interface CourseResource {
  linkId: string;
  courseId: number;
  resourceId: string;
  sortOrder: number;
  title: string;
  resourceType: string;
  storageBucket: string | null;
  storagePath: string | null;
  fileUrl: string | null;
  kind: CourseResourceKind;
}

interface LinkRow {
  id: string | number;
  course_id: number;
  resource_id: string;
  sort_order: number | null;
  title?: string | null;
}

interface LibraryRow {
  id: string;
  title: string;
  file_url: string | null;
  resource_type?: string | null;
  storage_bucket?: string | null;
  storage_path?: string | null;
  file_name?: string | null;
}

async function currentUserId(): Promise<string | null> {
  const { data } = await supabase.auth.getUser();
  return data.user?.id ?? null;
}

function courseResourcesTable() {
  return (supabase as any).from("academy_course_resources");
}

function mapRows(links: LinkRow[], library: LibraryRow[]): CourseResource[] {
  const byId = new Map(library.map((r) => [r.id, r]));
  return links
    .map((link) => {
      const resource = byId.get(link.resource_id);
      if (!resource) return null;
      return {
        linkId: String(link.id),
        courseId: link.course_id,
        resourceId: resource.id,
        sortOrder: link.sort_order ?? 0,
        title: resource.title || link.title || "Untitled resource",
        resourceType: resource.resource_type || (resource.file_url && !resource.storage_path ? "link" : "file"),
        storageBucket: resource.storage_bucket ?? null,
        storagePath: resource.storage_path ?? null,
        fileUrl: resource.file_url ?? null,
        kind: resourceKind(resource),
      } satisfies CourseResource;
    })
    .filter((row): row is CourseResource => row != null);
}

export async function fetchCourseResources(courseId: number): Promise<CourseResource[]> {
  const { data: linkData, error: linkError } = await courseResourcesTable()
    .select("id, course_id, resource_id, sort_order, title")
    .eq("course_id", courseId)
    .order("sort_order", { ascending: true });
  if (linkError) throw linkError;

  const links = (linkData ?? []) as unknown as LinkRow[];
  if (links.length === 0) return [];

  const ids = [...new Set(links.map((l) => l.resource_id))];
  const { data: libraryData, error: libraryError } = await supabase
    .from("resource_library")
    .select("*")
    .in("id", ids);
  if (libraryError) throw libraryError;

  return mapRows(links, (libraryData ?? []) as unknown as LibraryRow[]);
}

export function useAcademyCourseResources(courseId: number | null) {
  return useQuery({
    queryKey: [COURSE_RESOURCES_KEY, courseId],
    enabled: !!courseId,
    queryFn: () => fetchCourseResources(courseId!),
  });
}

export function useAddCourseFileResource(courseId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      file,
      title,
      category,
      accessLevel,
    }: {
      file: File;
      title: string;
      category: string;
      accessLevel: "member" | "public";
    }) => {
      if (!isAllowedUploadFile(file)) {
        throw new Error(REJECTED_FILE_MESSAGE);
      }

      const resourceId = crypto.randomUUID();
      const bucket = bucketForUpload(file);
      const storagePath = storagePathForResource(resourceId, file.name);
      const userId = await currentUserId();
      const existing = qc.getQueryData<CourseResource[]>([COURSE_RESOURCES_KEY, courseId]) ?? [];
      const nextOrder = existing.length > 0 ? Math.max(...existing.map((r) => r.sortOrder)) + 1 : 1;

      const { error: uploadError } = await supabase.storage.from(bucket).upload(storagePath, file, {
        contentType: mimeForUpload(file),
        upsert: false,
      });
      if (uploadError) throw new Error(uploadError.message || "File upload failed");

      const { error: libraryError } = await supabase.from("resource_library").insert({
        id: resourceId,
        title: title.trim(),
        category,
        access_level: accessLevel,
        resource_type: "file",
        storage_bucket: bucket,
        storage_path: storagePath,
        file_name: file.name,
        mime_type: mimeForUpload(file),
        file_size: file.size,
        ...(userId ? { created_by: userId } : {}),
      } as any);
      if (libraryError) {
        await supabase.storage.from(bucket).remove([storagePath]).catch(() => {});
        throw libraryError;
      }

      const { error: linkError } = await courseResourcesTable().insert({
        course_id: courseId,
        resource_id: resourceId,
        sort_order: nextOrder,
        title: title.trim(),
        ...(userId ? { created_by: userId } : {}),
      });
      if (linkError) {
        await supabase.from("resource_library").delete().eq("id", resourceId);
        await supabase.storage.from(bucket).remove([storagePath]).catch(() => {});
        throw linkError;
      }
    },
    onSuccess: () => {
      toast.success("Resource added");
      qc.invalidateQueries({ queryKey: [COURSE_RESOURCES_KEY, courseId] });
    },
    onError: (e: any) => toast.error(e?.message || "Failed to add resource"),
  });
}

export function useAddCourseLinkResource(courseId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      title,
      url,
      category,
      accessLevel,
    }: {
      title: string;
      url: string;
      category: string;
      accessLevel: "member" | "public";
    }) => {
      const trimmedUrl = url.trim();
      if (!isHttpsUrl(trimmedUrl)) {
        throw new Error("Enter a valid https:// URL.");
      }

      const userId = await currentUserId();
      const existing = qc.getQueryData<CourseResource[]>([COURSE_RESOURCES_KEY, courseId]) ?? [];
      const nextOrder = existing.length > 0 ? Math.max(...existing.map((r) => r.sortOrder)) + 1 : 1;

      const { data: libraryRow, error: libraryError } = await supabase
        .from("resource_library")
        .insert({
          title: title.trim(),
          category,
          access_level: accessLevel,
          resource_type: "link",
          file_url: trimmedUrl,
          ...(userId ? { created_by: userId } : {}),
        } as any)
        .select("id")
        .single();
      if (libraryError) throw libraryError;

      const { error: linkError } = await courseResourcesTable().insert({
        course_id: courseId,
        resource_id: libraryRow.id,
        sort_order: nextOrder,
        title: title.trim(),
        ...(userId ? { created_by: userId } : {}),
      });
      if (linkError) {
        await supabase.from("resource_library").delete().eq("id", libraryRow.id);
        throw linkError;
      }
    },
    onSuccess: () => {
      toast.success("Link added");
      qc.invalidateQueries({ queryKey: [COURSE_RESOURCES_KEY, courseId] });
    },
    onError: (e: any) => toast.error(e?.message || "Failed to add link"),
  });
}

export function useRemoveCourseResource(courseId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (linkId: string) => {
      const { error } = await courseResourcesTable().delete().eq("id", linkId);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Resource removed");
      qc.invalidateQueries({ queryKey: [COURSE_RESOURCES_KEY, courseId] });
    },
    onError: (e: any) => toast.error(e?.message || "Failed to remove resource"),
  });
}

export function useReorderCourseResources(courseId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (ordered: CourseResource[]) => {
      const updates = ordered.map((row, index) =>
        courseResourcesTable()
          .update({ sort_order: index + 1 })
          .eq("id", row.linkId),
      );
      const results = await Promise.all(updates);
      const failed = results.find((r: { error?: unknown }) => r.error);
      if (failed?.error) throw failed.error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [COURSE_RESOURCES_KEY, courseId] });
    },
    onError: (e: any) => {
      toast.error(e?.message || "Failed to reorder resources");
      qc.invalidateQueries({ queryKey: [COURSE_RESOURCES_KEY, courseId] });
    },
  });
}
