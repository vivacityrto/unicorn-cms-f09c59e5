/** Shared helpers for Academy AI Assist (Quick Add + full builder). */

export function todayLocalISODate(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export const ACADEMY_WEBINAR_SERIES = [
  { value: "AI in Your RTO", session_type: "webinar" as const },
  { value: "Inside VET", session_type: "webinar" as const },
  { value: "Trainers Edge", session_type: "webinar" as const },
  { value: "8 Critical Drivers to RTO Success", session_type: "webinar" as const },
  { value: "Superhero Tools Unleashed", session_type: "webinar" as const },
  { value: "The Compliance Lab", session_type: "workshop" as const },
];

/** Returns an error message when the pasted Vimeo URL cannot be resolved, else null. */
export function validateVimeoUrl(raw: string): string | null {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return "That doesn't look like a valid URL. Paste the full Vimeo link, e.g. https://vimeo.com/1215370924";
  }
  if (!/(^|\.)vimeo\.com$/.test(url.hostname)) {
    return "Only Vimeo links are supported.";
  }
  if (/^\/share\//.test(url.pathname)) {
    return null;
  }
  if (!/\d{6,}/.test(url.pathname)) {
    return "Couldn't find a video ID in that link. Use the video's Vimeo page URL, e.g. https://vimeo.com/1215370924";
  }
  return null;
}

/** Pull the real message out of a Supabase Functions error instead of "non-2xx status code". */
export async function extractEdgeError(err: unknown, fallback: string): Promise<string> {
  const res = (err as { context?: Response; message?: string })?.context;
  if (res && typeof res.clone === "function") {
    try {
      const body = await res.clone().json();
      const msg = body?.error || body?.message || body?.reason;
      if (msg) return String(msg);
    } catch {
      try {
        const text = await res.clone().text();
        if (text?.trim()) return text.trim().slice(0, 500);
      } catch {
        /* ignore */
      }
    }
  }
  return (err as { message?: string })?.message || fallback;
}

export function humaniseVimeoError(msg: string): string {
  if (/404/.test(msg) && /vimeo/i.test(msg)) {
    return "Vimeo returned 404 for that video. Check the video is on the connected Vimeo account, hasn't been deleted, or paste the full privacy-hash link if it's restricted.";
  }
  if (/401|403/.test(msg) && /vimeo/i.test(msg)) {
    return "Vimeo rejected our credentials for that video. Check the video lives on the connected Vimeo account.";
  }
  return msg;
}
