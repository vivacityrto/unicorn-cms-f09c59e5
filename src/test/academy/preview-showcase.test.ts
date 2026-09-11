import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ invoke: vi.fn() }));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: { functions: { invoke: mocks.invoke } },
}));

import {
  getPreviewShowcaseValidationError,
  previewShowcase,
  validateShowcaseUrl,
} from "@/features/academy/previewShowcase";

const VALID_URL = "https://vimeo.com/showcase/12364831";

describe("validateShowcaseUrl", () => {
  it("accepts a bare numeric showcase id", () => {
    expect(validateShowcaseUrl("12364831")).toBeNull();
  });

  it("accepts a full valid showcase URL", () => {
    expect(validateShowcaseUrl(VALID_URL)).toBeNull();
  });

  it("rejects a non-URL string", () => {
    expect(validateShowcaseUrl("not a url")).toMatch(/doesn't look like a valid URL/);
  });

  it("rejects a non-Vimeo host", () => {
    expect(validateShowcaseUrl("https://youtube.com/showcase/123")).toMatch(/Only Vimeo links/);
  });

  it("rejects a Vimeo URL with no showcase id", () => {
    expect(validateShowcaseUrl("https://vimeo.com/123456")).toMatch(/Couldn't find a showcase id/);
  });
});

describe("getPreviewShowcaseValidationError", () => {
  it("requires a URL", () => {
    expect(getPreviewShowcaseValidationError("", "webinar")).toBe("Vimeo Showcase URL is required");
  });

  it("requires a series before the URL is checked", () => {
    expect(getPreviewShowcaseValidationError("", "")).toBe("Vimeo Showcase URL is required");
    expect(getPreviewShowcaseValidationError(VALID_URL, "")).toBe("Select a series before generating.");
  });

  it("passes through the URL format error", () => {
    expect(getPreviewShowcaseValidationError("bad", "webinar")).toMatch(/doesn't look like a valid URL/);
  });

  it("returns null once both are valid", () => {
    expect(getPreviewShowcaseValidationError(VALID_URL, "webinar")).toBeNull();
  });
});

describe("previewShowcase", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("does not call the Edge Function when validation fails", async () => {
    const result = await previewShowcase("", "webinar");
    expect(result).toEqual({ ok: false, preview: null, error: "Vimeo Showcase URL is required" });
    expect(mocks.invoke).not.toHaveBeenCalled();
  });

  it("returns a preview on success, applying the original_title fallback", async () => {
    mocks.invoke.mockResolvedValue({
      data: {
        album_id: 555,
        video_count: 2,
        parsed: [
          { module_number: 1, lesson_number: 1, title: "1.1 Intro", vimeo_id: "a", link: "x", duration_seconds: 60, thumbnail_url: null, already_imported: false, existing_courses: [] },
          { module_number: 1, lesson_number: 2, title: "1.2 Setup", original_title: "Original Setup", vimeo_id: "b", link: "y", duration_seconds: 90, thumbnail_url: null, already_imported: false, existing_courses: [] },
        ],
        unmatched: [],
      },
      error: null,
    });
    const result = await previewShowcase(VALID_URL, "webinar");
    expect(result.ok).toBe(true);
    expect(result.preview?.albumId).toBe("555");
    expect(result.preview?.videoCount).toBe(2);
    expect(result.preview?.parsed[0].original_title).toBe("1.1 Intro");
    expect(result.preview?.parsed[1].original_title).toBe("Original Setup");
    expect(mocks.invoke).toHaveBeenCalledWith("academy-import-vimeo-showcase", {
      body: { showcase_url: VALID_URL },
    });
  });

  it("falls back video_count to parsed+unmatched length when the field is missing/zero", async () => {
    mocks.invoke.mockResolvedValue({
      data: {
        album_id: 1,
        video_count: 0,
        parsed: [{ module_number: 1, lesson_number: 1, title: "A", vimeo_id: "a", link: "x", duration_seconds: null, thumbnail_url: null, already_imported: false, existing_courses: [] }],
        unmatched: [{ title: "B", vimeo_id: null, link: null }],
      },
      error: null,
    });
    const result = await previewShowcase(VALID_URL, "webinar");
    expect(result.preview?.videoCount).toBe(2);
  });

  it("errors when the showcase has no videos at all", async () => {
    mocks.invoke.mockResolvedValue({ data: { album_id: 1, video_count: 0, parsed: [], unmatched: [] }, error: null });
    const result = await previewShowcase(VALID_URL, "webinar");
    expect(result).toEqual({ ok: false, preview: null, error: "That showcase has no videos." });
  });

  it("surfaces a data.error field from a 200 response", async () => {
    mocks.invoke.mockResolvedValue({ data: { error: "Showcase is private" }, error: null });
    const result = await previewShowcase(VALID_URL, "webinar");
    expect(result).toEqual({ ok: false, preview: null, error: "Showcase is private" });
  });

  it("extracts a structured Edge error message", async () => {
    const context = { clone: () => ({ json: async () => ({ error: "Vimeo token expired" }), text: async () => "" }) };
    mocks.invoke.mockResolvedValue({ data: null, error: Object.assign(new Error("edge failed"), { context }) });
    const result = await previewShowcase(VALID_URL, "webinar");
    expect(result).toEqual({ ok: false, preview: null, error: "Vimeo token expired" });
  });

  it("falls back to a generic message when the Edge error has no structured body", async () => {
    mocks.invoke.mockResolvedValue({ data: null, error: new Error("network down") });
    const result = await previewShowcase(VALID_URL, "webinar");
    expect(result).toEqual({ ok: false, preview: null, error: "network down" });
  });
});
