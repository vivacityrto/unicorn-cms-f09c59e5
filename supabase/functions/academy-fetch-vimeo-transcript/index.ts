import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { createClient } from "npm:@supabase/supabase-js@2";
import { z } from "npm:zod@3.23.8";

const BodySchema = z.object({
  vimeo_url: z.string().url().max(500),
});

type VimeoLocation = {
  id: string;
  privacyHash: string | null;
  canonicalUrl: string;
};

type VimeoMetadata = {
  name?: string;
  duration?: number;
  pictures?: { sizes?: Array<{ width?: number; link?: string }> };
};

type VimeoTextTrack = {
  active?: boolean;
  language?: string;
  link?: string;
  name?: string;
  type?: string;
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function parseVimeoUrl(raw: string): VimeoLocation | null {
  const url = new URL(raw);
  const hostname = url.hostname.toLowerCase().replace(/^www\./, "");
  if (hostname !== "vimeo.com" && hostname !== "player.vimeo.com") return null;

  const parts = url.pathname.split("/").filter(Boolean);
  const idIndex = parts.findIndex((part) => /^\d{6,}$/.test(part));
  if (idIndex < 0) return null;

  const id = parts[idIndex];
  const nextPart = parts[idIndex + 1];
  const privacyHash = nextPart && /^[a-zA-Z0-9]+$/.test(nextPart) ? nextPart : null;
  const canonicalUrl = `https://vimeo.com/${id}${privacyHash ? `/${privacyHash}` : ""}`;
  return { id, privacyHash, canonicalUrl };
}

function vimeoResource(location: VimeoLocation) {
  return location.privacyHash
    ? `${location.id}:${location.privacyHash}`
    : location.id;
}

async function readResponse(response: Response): Promise<string> {
  try {
    return await response.text();
  } catch {
    return "";
  }
}

async function fetchApiMetadata(location: VimeoLocation, token: string) {
  const response = await fetch(
    `https://api.vimeo.com/videos/${vimeoResource(location)}`,
    { headers: { Authorization: `Bearer ${token}`, Accept: "application/vnd.vimeo.*+json;version=3.4" } },
  );
  const text = await readResponse(response);
  if (!response.ok) {
    console.warn("Vimeo API metadata unavailable", response.status, text.slice(0, 300));
    return { metadata: null, status: response.status };
  }
  return { metadata: JSON.parse(text) as VimeoMetadata, status: response.status };
}

async function fetchOEmbedMetadata(location: VimeoLocation) {
  const response = await fetch(
    `https://vimeo.com/api/oembed.json?url=${encodeURIComponent(location.canonicalUrl)}`,
    { headers: { Accept: "application/json" } },
  );
  const text = await readResponse(response);
  if (!response.ok) {
    console.error("Vimeo oEmbed metadata error", response.status, text.slice(0, 300));
    return null;
  }
  return JSON.parse(text) as {
    title?: string;
    duration?: number;
    thumbnail_url?: string;
    domain_status_code?: number;
  };
}

function parseVtt(vtt: string) {
  const timestamped: string[] = [];
  const plain: string[] = [];
  const blocks = vtt.replace(/^\uFEFF/, "").split(/\r?\n\r?\n/);

  for (const block of blocks) {
    const lines = block.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
    const timeIndex = lines.findIndex((line) => line.includes(" --> "));
    if (timeIndex < 0) continue;
    const start = lines[timeIndex].split(" --> ")[0].replace(/\.\d+$/, "");
    const cue = lines.slice(timeIndex + 1)
      .join(" ")
      .replace(/<[^>]+>/g, "")
      .replace(/&nbsp;/g, " ")
      .replace(/&amp;/g, "&")
      .trim();
    if (!cue) continue;
    timestamped.push(`[${start}] ${cue}`);
    if (plain.at(-1) !== cue) plain.push(cue);
  }

  return { transcript: plain.join(" "), transcript_timestamped: timestamped.join("\n") };
}

async function fetchTranscript(location: VimeoLocation, token: string) {
  const response = await fetch(
    `https://api.vimeo.com/videos/${vimeoResource(location)}/texttracks`,
    { headers: { Authorization: `Bearer ${token}`, Accept: "application/vnd.vimeo.*+json;version=3.4" } },
  );
  const text = await readResponse(response);
  if (!response.ok) {
    console.warn("Vimeo text tracks unavailable", response.status, text.slice(0, 300));
    return null;
  }

  const payload = JSON.parse(text) as { data?: VimeoTextTrack[] };
  const tracks = Array.isArray(payload.data) ? payload.data : [];
  const track = tracks.find((item) => item.active && item.language?.toLowerCase().startsWith("en"))
    ?? tracks.find((item) => item.language?.toLowerCase().startsWith("en"))
    ?? tracks.find((item) => item.active)
    ?? tracks[0];
  if (!track?.link) return null;

  const trackResponse = await fetch(track.link);
  const vtt = await readResponse(trackResponse);
  if (!trackResponse.ok) {
    console.warn("Vimeo text track download unavailable", trackResponse.status);
    return null;
  }
  return parseVtt(vtt);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
    const vimeoToken = Deno.env.get("VIMEO_ACCESS_TOKEN");
    if (!supabaseUrl || !anonKey || !vimeoToken) {
      console.error("Required Academy Vimeo configuration is missing");
      return json({ error: "Vimeo integration is not configured" }, 500);
    }

    const authorization = req.headers.get("Authorization");
    if (!authorization) return json({ error: "Unauthorized" }, 401);
    const authClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authorization } },
    });
    const { data: { user }, error: authError } = await authClient.auth.getUser();
    if (authError || !user) return json({ error: "Unauthorized" }, 401);

    const parsedBody = BodySchema.safeParse(await req.json());
    if (!parsedBody.success) {
      return json({ error: "A valid Vimeo URL is required" }, 400);
    }
    const location = parseVimeoUrl(parsedBody.data.vimeo_url);
    if (!location) {
      return json({ error: "This is not a supported Vimeo video URL" }, 400);
    }

    const apiResult = await fetchApiMetadata(location, vimeoToken);
    const oEmbed = apiResult.metadata ? null : await fetchOEmbedMetadata(location);
    if (!apiResult.metadata && !oEmbed) {
      const hint = apiResult.status === 404
        ? "The video is private, deleted, or its unlisted privacy hash is missing from the URL."
        : "Vimeo could not resolve this video.";
      return json({ error: hint }, 422);
    }
    if (
      !apiResult.metadata
      && oEmbed
      && !oEmbed.title
      && !oEmbed.duration
      && !oEmbed.thumbnail_url
    ) {
      const reason = oEmbed.domain_status_code === 403
        ? "Vimeo recognises the video, but its privacy/domain settings block Academy from reading it. In Vimeo, allow embedding on unicorn-cms.au and ensure the configured API app can access the video, then paste the full video link again."
        : "Vimeo recognises the video, but does not expose its metadata. Ensure the configured Vimeo API app can access it and include the full privacy hash for an unlisted video.";
      return json({ error: reason }, 422);
    }

    const transcript = apiResult.metadata
      ? await fetchTranscript(location, vimeoToken)
      : null;
    const largestPicture = apiResult.metadata?.pictures?.sizes
      ?.filter((picture) => picture.link)
      .sort((a, b) => (b.width ?? 0) - (a.width ?? 0))[0];

    return json({
      video_id: location.id,
      title: apiResult.metadata?.name ?? oEmbed?.title ?? "",
      duration_seconds: apiResult.metadata?.duration ?? oEmbed?.duration ?? null,
      thumbnail_url: largestPicture?.link ?? oEmbed?.thumbnail_url ?? null,
      has_transcript: Boolean(transcript?.transcript),
      transcript: transcript?.transcript ?? "",
      transcript_timestamped: transcript?.transcript_timestamped ?? "",
      metadata_source: apiResult.metadata ? "vimeo_api" : "oembed",
    });
  } catch (error) {
    console.error("academy-fetch-vimeo-transcript failed", error);
    return json({ error: "Unable to read this Vimeo video right now" }, 500);
  }
});