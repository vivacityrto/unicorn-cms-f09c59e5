import { supabase } from "@/integrations/supabase/client";
import type { ShowcaseParsedItem, ShowcaseUnmatchedItem, ShowcasePreview } from "@/features/academy/showcaseOrdering";

export function validateShowcaseUrl(raw: string): string | null {
  if (/^\d+$/.test(raw.trim())) return null;
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return "That doesn't look like a valid URL. Paste the full Showcase link, e.g. https://vimeo.com/showcase/12364831";
  }
  if (!/(^|\.)vimeo\.com$/.test(url.hostname)) {
    return "Only Vimeo links are supported.";
  }
  if (!/\/showcase\/\d+/.test(url.pathname)) {
    return "Couldn't find a showcase id in that link. Use the showcase's own URL, e.g. https://vimeo.com/showcase/12364831";
  }
  return null;
}

/** Pull the real message out of a Supabase Functions error instead of "non-2xx status code". */
async function extractEdgeError(err: unknown, fallback: string): Promise<string> {
  const e = (err ?? {}) as { context?: { clone?: () => { json: () => Promise<unknown>; text: () => Promise<string> } }; message?: string };
  const res = e.context;
  if (res && typeof res.clone === "function") {
    try {
      const body = (await res.clone().json()) as Record<string, unknown>;
      const msg = body?.error || body?.message || body?.reason;
      if (msg) return String(msg);
    } catch {
      try {
        const text = await res.clone().text();
        if (text?.trim()) return text.trim().slice(0, 500);
      } catch { /* ignore */ }
    }
  }
  return e.message || fallback;
}

export interface PreviewShowcaseResult {
  ok: boolean;
  preview: ShowcasePreview | null;
  error: string | null;
}

/**
 * Synchronous pre-check for showcaseUrl/series, in the same order/wording
 * as the original inline handler's early returns. Callers should run this
 * before entering a loading state -- the original handler never toggled
 * its "generating" flag for a synchronous validation failure, only for a
 * real network attempt, and this keeps that distinction intact.
 */
export function getPreviewShowcaseValidationError(showcaseUrl: string, series: string): string | null {
  const trimmed = showcaseUrl.trim();
  if (!trimmed) return "Vimeo Showcase URL is required";
  if (!series) return "Select a series before generating.";
  return validateShowcaseUrl(trimmed);
}

/**
 * Imports a Vimeo showcase via the academy-import-vimeo-showcase Edge
 * Function. Verbatim behavior preserved from AcademyAddCoursePage.tsx's
 * inline handlePreviewShowcase: same original_title fallback, same
 * empty-result and video_count handling. Re-validates internally so the
 * function is safe to call on its own; callers that also want to skip
 * entering a loading state on a sync failure should call
 * getPreviewShowcaseValidationError first (see above).
 */
export async function previewShowcase(showcaseUrl: string, series: string): Promise<PreviewShowcaseResult> {
  const trimmed = showcaseUrl.trim();
  const validationError = getPreviewShowcaseValidationError(trimmed, series);
  if (validationError) return { ok: false, preview: null, error: validationError };

  try {
    const { data, error: fnError } = await supabase.functions.invoke("academy-import-vimeo-showcase", {
      body: { showcase_url: trimmed },
    });
    if (fnError) {
      throw new Error(await extractEdgeError(fnError, "Couldn't read that Vimeo showcase"));
    }
    if (data?.error) throw new Error(String(data.error));

    const parsed: ShowcaseParsedItem[] = Array.isArray(data?.parsed)
      ? data.parsed.map((item: ShowcaseParsedItem) => ({
          ...item,
          original_title: item.original_title || item.title,
        }))
      : [];
    const unmatched: ShowcaseUnmatchedItem[] = Array.isArray(data?.unmatched) ? data.unmatched : [];
    if (parsed.length === 0 && unmatched.length === 0) {
      throw new Error("That showcase has no videos.");
    }
    const preview: ShowcasePreview = {
      albumId: String(data.album_id),
      videoCount: Number(data.video_count) || parsed.length + unmatched.length,
      parsed,
      unmatched,
    };
    return { ok: true, preview, error: null };
  } catch (e: unknown) {
    return {
      ok: false,
      preview: null,
      error: String(e instanceof Error ? e.message : "Failed to read that showcase"),
    };
  }
}
