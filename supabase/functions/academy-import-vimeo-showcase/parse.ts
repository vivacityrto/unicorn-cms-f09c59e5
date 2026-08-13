/** Shared parse helpers for academy-import-vimeo-showcase (no Deno APIs). */

export const SHOWCASE_TITLE_RE =
  /^M(\d+)\s*[-–]\s*Lesson\s*(\d+)\s*[:\-]?\s*(.+)$/i;

export type ParsedShowcaseTitle = {
  moduleNumber: number;
  lessonNumber: number;
  title: string;
};

export type ShowcaseVideo = {
  uri?: string;
  name?: string;
  description?: string | null;
  duration?: number;
  link?: string;
  pictures?: { sizes?: Array<{ width?: number; link?: string }> };
  player_embed_url?: string;
};

export type UnmatchedVideo = {
  title: string;
  vimeo_id: string | null;
  link: string | null;
};

export type ParsedVideo = {
  moduleNumber: number;
  lessonNumber: number;
  title: string;
  vimeoId: string;
  vimeoName: string;
  description: string | null;
  duration: number | null;
  thumbnail: string | null;
  link: string;
  embedLink: string | null;
};

export type ExistingModule = { id: number; title: string };

/**
 * Accept a raw numeric album id, or extract it from a Vimeo Showcase URL
 * such as https://vimeo.com/showcase/12364831?share=copy&fl=1&fe=1
 */
export function extractAlbumId(
  showcaseUrl?: string | null,
  albumId?: string | number | null,
): string | null {
  if (albumId != null && String(albumId).trim() !== "") {
    const raw = String(albumId).trim();
    if (/^\d+$/.test(raw)) return raw;
    const fromRaw = extractAlbumIdFromString(raw);
    if (fromRaw) return fromRaw;
  }
  if (showcaseUrl != null && String(showcaseUrl).trim() !== "") {
    const raw = String(showcaseUrl).trim();
    if (/^\d+$/.test(raw)) return raw;
    return extractAlbumIdFromString(raw);
  }
  return null;
}

function extractAlbumIdFromString(raw: string): string | null {
  try {
    const url = new URL(raw);
    const host = url.hostname.toLowerCase().replace(/^www\./, "");
    if (host === "vimeo.com" || host.endsWith(".vimeo.com")) {
      const m = url.pathname.match(/\/showcase\/(\d+)/);
      if (m) return m[1];
    }
  } catch {
    /* not a full URL — fall through to substring match */
  }
  const m = raw.match(/showcase\/(\d+)/i);
  return m ? m[1] : null;
}

export function parseShowcaseTitle(name: string): ParsedShowcaseTitle | null {
  const m = String(name ?? "").trim().match(SHOWCASE_TITLE_RE);
  if (!m) return null;
  const title = m[3].trim();
  if (!title) return null;
  return {
    moduleNumber: Number(m[1]),
    lessonNumber: Number(m[2]),
    title,
  };
}

/** Numeric Vimeo clip id from a /videos/{id} URI or vimeo.com URL. */
export function extractVimeoVideoId(uriOrUrl: string | null | undefined): string | null {
  if (!uriOrUrl) return null;
  const s = String(uriOrUrl);
  const fromVideos = s.match(/\/videos\/(\d+)/);
  if (fromVideos) return fromVideos[1];
  const fromVimeo = s.match(/vimeo\.com\/(?:video\/)?(\d+)/i);
  if (fromVimeo) return fromVimeo[1];
  if (/^\d+$/.test(s.trim())) return s.trim();
  return null;
}

export function findExistingModule(
  modules: ExistingModule[],
  moduleNumber: number,
): ExistingModule | null {
  const re = new RegExp(`^Module\\s+${moduleNumber}\\b`, "i");
  return modules.find((mod) => re.test(String(mod.title ?? "").trim())) ?? null;
}

export function classifyVideos(videos: ShowcaseVideo[]): {
  parsed: ParsedVideo[];
  unmatched: UnmatchedVideo[];
} {
  const parsed: ParsedVideo[] = [];
  const unmatched: UnmatchedVideo[] = [];

  for (const video of videos) {
    const name = video.name ?? "";
    const vimeoId = extractVimeoVideoId(video.uri) ?? extractVimeoVideoId(video.link);
    const parsedTitle = parseShowcaseTitle(name);
    if (!parsedTitle || !vimeoId) {
      unmatched.push({
        title: name || "(untitled)",
        vimeo_id: vimeoId,
        link: video.link ?? null,
      });
      continue;
    }

    const thumbnail = video.pictures?.sizes
      ?.filter((picture) => picture.link)
      .sort((a, b) => (b.width ?? 0) - (a.width ?? 0))[0]?.link ?? null;

    parsed.push({
      moduleNumber: parsedTitle.moduleNumber,
      lessonNumber: parsedTitle.lessonNumber,
      title: parsedTitle.title,
      vimeoId,
      vimeoName: name,
      description: video.description ?? null,
      duration: typeof video.duration === "number" ? video.duration : null,
      thumbnail,
      link: video.link ?? `https://vimeo.com/${vimeoId}`,
      embedLink: video.player_embed_url ?? null,
    });
  }

  parsed.sort(
    (a, b) => a.moduleNumber - b.moduleNumber || a.lessonNumber - b.lessonNumber,
  );
  return { parsed, unmatched };
}

export function distinctModuleNumbers(parsed: ParsedVideo[]): number[] {
  return [...new Set(parsed.map((item) => item.moduleNumber))].sort((a, b) => a - b);
}
