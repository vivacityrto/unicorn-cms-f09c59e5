import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type TemplatedDocumentRow = {
  id: number;
  title: string;
  stage: number | null;
  /** Every selected stage that scopes this document, including shared links. */
  stageIds: number[];
  /** Comma-separated dd_document_categories.value list, as stored on documents.category. */
  categories: string[];
  /** dd_governance_framework.value, or null if unset. */
  frameworkType: string | null;
  /** Set iff the document has a live published version. */
  isPublished: boolean;
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
      // 1. Pull documents scoped by stage filter (if any) — union-aware with
      //    document_stage_links so shared documents are included.
      let additionalIds: number[] = [];
      const linkedStageIdsByDocument = new Map<number, Set<number>>();
      if (stageKey.length > 0) {
        const { data: linkRows, error: linkErr } = await supabase
          .from("document_stage_links")
          .select("document_id, stage_id")
          .in("stage_id", stageKey);
        if (linkErr) throw linkErr;
        for (const row of (linkRows ?? []) as { document_id: number; stage_id: number }[]) {
          additionalIds.push(row.document_id);
          const stages = linkedStageIdsByDocument.get(row.document_id) ?? new Set<number>();
          stages.add(row.stage_id);
          linkedStageIdsByDocument.set(row.document_id, stages);
        }
        additionalIds = Array.from(new Set(additionalIds));
      }
      let docQuery = supabase
        .from("documents")
        .select("id, title, stage, source_template_url, category, framework_type, current_published_version_id")
        .order("title", { ascending: true });
      if (stageKey.length > 0) {
        if (additionalIds.length > 0) {
          docQuery = docQuery.or(
            `stage.in.(${stageKey.join(",")}),id.in.(${additionalIds.join(",")})`,
          );
        } else {
          docQuery = docQuery.in("stage", stageKey);
        }
      }
      const { data: docs, error: docErr } = await docQuery;
      if (docErr) throw docErr;
      const docRows =
        (docs ?? []) as {
          id: number;
          title: string | null;
          stage: number | null;
          source_template_url: string | null;
          category: string | null;
          framework_type: string | null;
          current_published_version_id: string | null;
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
        // Keep the picker in lockstep with the server-side job eligibility:
        // only Office templates can be bulk-generated.
        const hasSupportedTemplate = [v.storage_path, v.frozen_storage_path].some(
          (path) => !!path && /\.(docx|xlsx|xls|xlsm|pptx)$/i.test(path),
        );
        if (hasSupportedTemplate) {
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
          stageIds: Array.from(
            new Set([
              ...(stageKey.includes(d.stage ?? -1) ? [d.stage as number] : []),
              ...(linkedStageIdsByDocument.get(d.id) ?? []),
            ]),
          ),
          categories: d.category ? d.category.split(",").map((c) => c.trim()).filter(Boolean) : [],
          frameworkType: d.framework_type ?? null,
          isPublished: !!d.current_published_version_id,
        }));
    },
  });
}
