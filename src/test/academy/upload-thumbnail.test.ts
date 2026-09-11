import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  upload: vi.fn(),
  getPublicUrl: vi.fn(),
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    storage: {
      from: () => ({
        upload: mocks.upload,
        getPublicUrl: mocks.getPublicUrl,
      }),
    },
  },
}));

import { uploadThumbnail } from "@/features/academy/uploadThumbnail";

function makeFile(type: string, sizeBytes: number): File {
  return new File([new Uint8Array(sizeBytes)], "thumb", { type });
}

describe("uploadThumbnail", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.upload.mockResolvedValue({ error: null });
    mocks.getPublicUrl.mockReturnValue({ data: { publicUrl: "https://example.test/thumb.jpg" } });
  });

  it("rejects a disallowed file type without calling storage", async () => {
    const result = await uploadThumbnail(makeFile("image/gif", 1024), "");
    expect(result).toEqual({ ok: false, url: null, error: "Choose a JPG, PNG, or WebP image" });
    expect(mocks.upload).not.toHaveBeenCalled();
  });

  it("rejects a file over 5 MB without calling storage", async () => {
    const result = await uploadThumbnail(makeFile("image/png", 5 * 1024 * 1024 + 1), "");
    expect(result).toEqual({ ok: false, url: null, error: "Thumbnail images must be 5 MB or smaller" });
    expect(mocks.upload).not.toHaveBeenCalled();
  });

  it("uploads a valid JPG and returns its public URL", async () => {
    const result = await uploadThumbnail(makeFile("image/jpeg", 1024), "");
    expect(result).toEqual({ ok: true, url: "https://example.test/thumb.jpg", error: null });
    expect(mocks.upload).toHaveBeenCalledWith(
      expect.stringMatching(/^pending\/.+\.jpg$/),
      expect.anything(),
      { contentType: "image/jpeg", upsert: false, cacheControl: "3600" },
    );
  });

  it("prefixes the storage path when a prefix is given (banner uploads)", async () => {
    await uploadThumbnail(makeFile("image/png", 1024), "banner-");
    expect(mocks.upload).toHaveBeenCalledWith(
      expect.stringMatching(/^pending\/banner-.+\.png$/),
      expect.anything(),
      expect.anything(),
    );
  });

  it("surfaces a storage upload error as the error message", async () => {
    mocks.upload.mockResolvedValueOnce({ error: new Error("bucket unavailable") });
    const result = await uploadThumbnail(makeFile("image/webp", 1024), "");
    expect(result).toEqual({ ok: false, url: null, error: "bucket unavailable" });
  });

  it("falls back to a generic message when the thrown error has no message", async () => {
    mocks.upload.mockImplementationOnce(() => {
      throw "not an Error instance";
    });
    const result = await uploadThumbnail(makeFile("image/jpeg", 1024), "");
    expect(result).toEqual({ ok: false, url: null, error: "Failed to upload image" });
  });
});
