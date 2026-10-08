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
  description?: string;
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
  /** True when Graph sent a zone we could not map and we assumed UTC. */
  timeZoneAssumed: boolean;
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
