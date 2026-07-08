import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type TemplatedDocumentRow = {
  id: number;
  title: string;
  stage: number | null;
};

/**
 * Documents eligible for bulk generation: those with a template configured.
 *
 * Matches the worker's hasTemplate check:
 *   documents.source_template_url IS NOT NULL, OR
 *   document_versions.storage_path IS NOT NULL, OR
 *   document_versions.frozen_storage_path IS NOT NULL
 *
 * When stageIds is non-empty, the result is further narrowed to
 * documents.stage IN (stageIds).
 */
export function useTemplatedDocuments(stageIds: number[] = []) {
  const stageKey = stageIds.length ? [...stageIds].sort((a, b) => a - b) : [];
  return useQuery({
    queryKey: ["bulk-generate", "templated-documents", stageKey],
    staleTime: 60_000,
    queryFn: async (): Promise<TemplatedDocumentRow[]> => {
      // 1. Pull documents scoped by stage filter (if any).
      let docQuery = supabase
        .from("documents")
        .select("id, title, stage, source_template_url")
        .order("title", { ascending: true });
      if (stageKey.length > 0) {
        docQuery = docQuery.in("stage", stageKey);
      }
      const { data: docs, error: docErr } = await docQuery;
      if (docErr) throw docErr;
      const docRows =
        (docs ?? []) as {
          id: number;
          title: string | null;
          stage: number | null;
          source_template_url: string | null;
        }[];

      if (docRows.length === 0) return [];

      // 2. Batch-fetch document_versions for those docs and detect which have
      //    at least one version with storage_path or frozen_storage_path.
      const docIds = docRows.map((d) => d.id);
      const { data: versions, error: vErr } = await supabase
        .from("document_versions")
        .select("document_id, storage_path, frozen_storage_path")
        .in("document_id", docIds);
      if (vErr) throw vErr;

      const hasVersionTemplate = new Set<number>();
      for (const v of (versions ?? []) as {
        document_id: number;
        storage_path: string | null;
        frozen_storage_path: string | null;
      }[]) {
        if (v.storage_path || v.frozen_storage_path) {
          hasVersionTemplate.add(v.document_id);
        }
      }

      // 3. Keep only documents with a template (either source_template_url or a
      //    version-level storage path).
      return docRows
        .filter(
          (d) =>
            !!d.source_template_url || hasVersionTemplate.has(d.id),
        )
        .map((d) => ({
          id: d.id,
          title: d.title ?? `Document #${d.id}`,
          stage: d.stage ?? null,
        }));
    },
  });
}
