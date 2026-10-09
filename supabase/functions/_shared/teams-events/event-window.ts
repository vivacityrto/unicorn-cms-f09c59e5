/**
 * Event query rules (brief section 9): list accessible webinars, then
 * filter server-side to start >= now and <= now + 14 days, excluding
 * cancelled / draft / unusable events, sorted by ascending start.
 *
 * Graph returns start/end as {dateTime, timeZone} where dateTime is local
 * wall-clock time in `timeZone` (a Windows zone name such as "UTC" or
 * "AUS Eastern Standard Time"). We convert to UTC for storage and filtering
 * and only format as Australia/Sydney in the browser.
 */

export const EVENT_WINDOW_DAYS = 14;

export interface GraphDateTimeTimeZone {
  dateTime: string;
  timeZone?: string;
}

export interface GraphWebinar {
  id: string;
  status?: string;
  displayName?: string;
  /** Graph sends a plain string or an itemBody ({ content, contentType }). */
  description?: unknown;
  startDateTime?: GraphDateTimeTimeZone;
  endDateTime?: GraphDateTimeTimeZone;
  createdBy?: {
    user?: { id?: string; displayName?: string } | null;
  } | null;
}

export interface TeamsEventSummary {
  id: string;
  eventType: "webinar";
  displayName: string;
  status: string;
  startUtc: string;
  endUtc: string | null;
  organiserId: string | null;
  organiserName: string | null;
  /** Plain-text description, trimmed for display; null when there is none. */
  description: string | null;
  /** True when Graph sent a zone we could not map and we assumed UTC. */
  timeZoneAssumed: boolean;
}

const DESCRIPTION_MAX = 220;

/**
 * Plain-text, display-sized description. Accepts a string or an itemBody,
 * strips any HTML (it is shown as text, never rendered as markup), decodes the
 * few common entities and truncates on a word boundary.
 */
export function plainDescription(value: unknown, max = DESCRIPTION_MAX): string | null {
  const raw = typeof value === "string"
    ? value
    : value && typeof value === "object" && typeof (value as { content?: unknown }).content === "string"
    ? (value as { content: string }).content
    : "";
  const text = raw
    .replace(/<(script|style)[\s\S]*?<\/\1>/gi, " ")
    .replace(/<br\s*\/?>|<\/p>|<\/div>|<\/li>/gi, " ")
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, "\"")
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/\s+/g, " ")
    .trim();
  if (!text) return null;
  if (text.length <= max) return text;
  const cut = text.slice(0, max);
  const lastSpace = cut.lastIndexOf(" ");
  return `${(lastSpace > max * 0.6 ? cut.slice(0, lastSpace) : cut).trimEnd()}…`;
}

/** Windows zone names Graph is known to send, mapped to IANA ids. */
const WINDOWS_TO_IANA: Record<string, string> = {
  "UTC": "UTC",
  "AUS Eastern Standard Time": "Australia/Sydney",
  "E. Australia Standard Time": "Australia/Brisbane",
  "AUS Central Standard Time": "Australia/Darwin",
  "Cen. Australia Standard Time": "Australia/Adelaide",
  "W. Australia Standard Time": "Australia/Perth",
  "Tasmania Standard Time": "Australia/Hobart",
  "New Zealand Standard Time": "Pacific/Auckland",
  "GMT Standard Time": "Europe/London",
  "Pacific Standard Time": "America/Los_Angeles",
  "Eastern Standard Time": "America/New_York",
};

function resolveZone(timeZone: string | undefined): { zone: string; assumed: boolean } {
  if (!timeZone) return { zone: "UTC", assumed: true };
  const mapped = WINDOWS_TO_IANA[timeZone];
  if (mapped) return { zone: mapped, assumed: false };
  if (timeZone.includes("/")) {
    try {
      new Intl.DateTimeFormat("en-US", { timeZone });
      return { zone: timeZone, assumed: false };
    } catch {
      // fall through
    }
  }
  return { zone: "UTC", assumed: true };
}

/** Offset (zone - UTC) in ms at the given instant. */
function zoneOffsetMs(zone: string, instantMs: number): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: zone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(new Date(instantMs));
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value);
  const asUtc = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour"), get("minute"), get("second"));
  return asUtc - Math.floor(instantMs / 1000) * 1000;
}

const WALL_CLOCK = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?/;

export function graphDateTimeToUtc(
  value: GraphDateTimeTimeZone | undefined | null,
): { utc: Date; assumed: boolean } | null {
  if (!value || typeof value.dateTime !== "string") return null;
  const match = WALL_CLOCK.exec(value.dateTime);
  if (!match) return null;
  const [, y, mo, d, h, mi, s] = match;
  const wallAsUtc = Date.UTC(Number(y), Number(mo) - 1, Number(d), Number(h), Number(mi), Number(s ?? 0));
  const { zone, assumed } = resolveZone(value.timeZone);
  if (zone === "UTC") return { utc: new Date(wallAsUtc), assumed };

  // Two passes handle instants either side of a DST transition.
  let utcMs = wallAsUtc - zoneOffsetMs(zone, wallAsUtc);
  utcMs = wallAsUtc - zoneOffsetMs(zone, utcMs);
  return { utc: new Date(utcMs), assumed };
}

export function computeWindow(now: Date): { from: Date; to: Date } {
  return {
    from: now,
    to: new Date(now.getTime() + EVENT_WINDOW_DAYS * 24 * 60 * 60 * 1000),
  };
}

/** Only published webinars are usable: draft and cancelled are excluded. */
export function isUsableWebinar(webinar: GraphWebinar): boolean {
  return typeof webinar.id === "string" && webinar.id.length > 0 && webinar.status === "published";
}

export function toEventSummary(webinar: GraphWebinar): TeamsEventSummary | null {
  const start = graphDateTimeToUtc(webinar.startDateTime);
  if (!start) return null;
  const end = graphDateTimeToUtc(webinar.endDateTime);
  const organiser = webinar.createdBy?.user ?? null;
  return {
    id: webinar.id,
    eventType: "webinar",
    displayName: (webinar.displayName ?? "").trim() || "(Untitled webinar)",
    status: webinar.status ?? "unknown",
    startUtc: start.utc.toISOString(),
    endUtc: end ? end.utc.toISOString() : null,
    organiserId: organiser?.id ?? null,
    organiserName: organiser?.displayName ?? null,
    description: plainDescription(webinar.description),
    timeZoneAssumed: start.assumed || (end?.assumed ?? false),
  };
}

export function isWithinWindow(startUtc: Date, now: Date): boolean {
  const { from, to } = computeWindow(now);
  return startUtc.getTime() >= from.getTime() && startUtc.getTime() <= to.getTime();
}

export function selectUpcomingWebinars(webinars: GraphWebinar[], now: Date): TeamsEventSummary[] {
  const events: TeamsEventSummary[] = [];
  for (const webinar of webinars) {
    if (!isUsableWebinar(webinar)) continue;
    const summary = toEventSummary(webinar);
    if (!summary) continue;
    if (!isWithinWindow(new Date(summary.startUtc), now)) continue;
    events.push(summary);
  }
  return events.sort((a, b) => a.startUtc.localeCompare(b.startUtc));
}

export type NotListedReason = "not_published" | "starts_after_window" | "no_start_time";

/** An upcoming webinar Microsoft returned that we deliberately did not list. */
export interface NotListedWebinar {
  display_name: string;
  status: string;
  start_utc: string | null;
  reason: NotListedReason;
}

const NOT_LISTED_CAP = 25;

/**
 * Explains why a webinar listing is empty or shorter than expected: did
 * Microsoft return nothing at all (organiser access policy / permissions), or
 * did we filter webinars out (status or date window)? Counts, plus the title,
 * status and start of upcoming webinars we did not list. Staff-only endpoint;
 * never logged.
 */
export interface WebinarListDiagnostics {
  graph_total: number;
  status_counts: Record<string, number>;
  published_in_window: number;
  published_before_window: number;
  published_after_window: number;
  published_without_start: number;
  earliest_published_start_utc: string | null;
  latest_published_start_utc: string | null;
  /** Upcoming webinars not listed, soonest first (capped). */
  not_listed: NotListedWebinar[];
}

export function summariseWebinarList(webinars: GraphWebinar[], now: Date): WebinarListDiagnostics {
  const diagnostics: WebinarListDiagnostics = {
    graph_total: webinars.length,
    status_counts: {},
    published_in_window: 0,
    published_before_window: 0,
    published_after_window: 0,
    published_without_start: 0,
    earliest_published_start_utc: null,
    latest_published_start_utc: null,
    not_listed: [],
  };
  const { from, to } = computeWindow(now);
  const notListed: NotListedWebinar[] = [];
  const nameOf = (w: GraphWebinar) => (typeof w.displayName === "string" && w.displayName.trim()) || "(Untitled webinar)";

  for (const webinar of webinars) {
    const status = typeof webinar.status === "string" && webinar.status ? webinar.status : "unknown";
    diagnostics.status_counts[status] = (diagnostics.status_counts[status] ?? 0) + 1;

    const summary = toEventSummary(webinar);
    if (!isUsableWebinar(webinar)) {
      // Past drafts / cancelled events are noise; only report ones that could still matter.
      if (!summary || new Date(summary.startUtc).getTime() >= from.getTime()) {
        notListed.push({
          display_name: nameOf(webinar),
          status,
          start_utc: summary?.startUtc ?? null,
          reason: "not_published",
        });
      }
      continue;
    }

    if (!summary) {
      diagnostics.published_without_start++;
      notListed.push({ display_name: nameOf(webinar), status, start_utc: null, reason: "no_start_time" });
      continue;
    }
    const startMs = new Date(summary.startUtc).getTime();
    if (startMs < from.getTime()) diagnostics.published_before_window++;
    else if (startMs > to.getTime()) {
      diagnostics.published_after_window++;
      notListed.push({
        display_name: nameOf(webinar),
        status,
        start_utc: summary.startUtc,
        reason: "starts_after_window",
      });
    } else diagnostics.published_in_window++;

    if (!diagnostics.earliest_published_start_utc || summary.startUtc < diagnostics.earliest_published_start_utc) {
      diagnostics.earliest_published_start_utc = summary.startUtc;
    }
    if (!diagnostics.latest_published_start_utc || summary.startUtc > diagnostics.latest_published_start_utc) {
      diagnostics.latest_published_start_utc = summary.startUtc;
    }
  }

  // Soonest first; entries with no start time last.
  notListed.sort((a, b) => (a.start_utc ?? "9999").localeCompare(b.start_utc ?? "9999"));
  diagnostics.not_listed = notListed.slice(0, NOT_LISTED_CAP);
  return diagnostics;
}

/**
 * Run `worker` over `items` with at most `limit` in flight, keeping input
 * order. Used to fetch per-event registrant counts without a request burst.
 */
export async function mapWithLimit<T, R>(items: T[], limit: number, worker: (item: T) => Promise<R>): Promise<R[]> {
  const results = new Array<R>(items.length);
  let cursor = 0;
  async function run(): Promise<void> {
    for (;;) {
      const index = cursor++;
      if (index >= items.length) return;
      results[index] = await worker(items[index]);
    }
  }
  await Promise.all(Array.from({ length: Math.max(1, Math.min(limit, items.length || 1)) }, run));
  return results;
}
