/**
 * Parser for the public AddEvent calendar landing page
 * (https://www.addevent.com/calendar/<id>).
 *
 * This reads the *public HTML*, not an API, so it is deliberately strict:
 * anything it does not recognise is counted as skipped rather than guessed,
 * and an unexpected time zone label or a page with no readable events throws
 * so the caller can show a clear error instead of an empty or wrong PDF.
 *
 * Pure TypeScript with no URL imports and only erasable syntax, so
 * `npm run test:edge` can run it under Node (see addevent-calendar-parser.node-test.ts).
 *
 * Page facts this relies on (verified against the live page, 2026-10-20):
 * - Events are listed in chronological order, one card per occurrence.
 * - Each card has `<p class="it tit evtlink"><a href="/event/<id>">Title</a></p>`
 *   followed by `<p class="it dat">Monday 26 October ⋅ 04:00 – 5:30 (UTC)</p>`.
 * - The date line has no year. The separator between date and time is not stable
 *   (the page mixes U+22C5 and an HTML-encoded U+2027 in one list), so any
 *   punctuation is accepted there.
 * - The time zone label depends on who is asking: the same page returned
 *   "(UTC)" to one request and "(PHT)" to another. The label is therefore read
 *   from every card and converted with a fixed-offset table; an unknown or
 *   ambiguous label (e.g. "IST", "CST") throws instead of guessing.
 * - Recurring events share one event id across many cards.
 * - The location line may be a live meeting join link; this module never
 *   returns a URL as a location.
 */

export type AddEventParseErrorCode = "parse_empty" | "parse_unexpected_format";

export class AddEventParseError extends Error {
  code: AddEventParseErrorCode;
  constructor(code: AddEventParseErrorCode, message: string) {
    super(message);
    this.name = "AddEventParseError";
    this.code = code;
  }
}

export interface ParsedCalendarEvent {
  id: string;
  title: string;
  /** ISO 8601 instant, UTC. */
  start_utc: string;
  /** ISO 8601 instant, UTC. */
  end_utc: string;
  /** Plain-text location, never a URL. `null` when the page gives none. */
  location_label: string | null;
  /** Public AddEvent page for the event. */
  url: string;
}

export interface ParseResult {
  events: ParsedCalendarEvent[];
  /** Cards that were recognised as events but could not be read. */
  skipped: number;
}

const WEEKDAYS = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
const MONTHS = [
  "january", "february", "march", "april", "may", "june",
  "july", "august", "september", "october", "november", "december",
];

/**
 * Fixed UTC offsets (minutes) for the time zone abbreviations the page may show.
 * Only unambiguous abbreviations are listed; each denotes a single fixed offset
 * (AEST is always +10, AEDT always +11), so no daylight saving logic is needed.
 */
const ZONE_OFFSET_MINUTES: Record<string, number> = {
  UTC: 0, GMT: 0,
  AEST: 600, AEDT: 660, ACST: 570, ACDT: 630, AWST: 480,
  NZST: 720, NZDT: 780,
  PHT: 480, SGT: 480, HKT: 480, MYT: 480, JST: 540, KST: 540,
  CET: 60, CEST: 120, EET: 120, EEST: 180, WET: 0, WEST: 60,
  EST: -300, EDT: -240, MST: -420, MDT: -360, PST: -480, PDT: -420, CDT: -300,
};

const MAX_TITLE_LENGTH = 200;
const MAX_LOCATION_LENGTH = 120;
const DAY_MS = 24 * 60 * 60 * 1000;
const MAX_HORIZON_DAYS = 500;

const DATE_LINE =
  /^([A-Za-z]+)\s+(\d{1,2})\s+([A-Za-z]+)\s*[^\w\s()]+\s*(\d{1,2}):(\d{2})\s*[–—-]\s*(\d{1,2}):(\d{2})\s*\(([^)]+)\)$/;

export function decodeEntities(input: string): string {
  const named: Record<string, string> = {
    amp: "&",
    lt: "<",
    gt: ">",
    quot: '"',
    apos: "'",
    nbsp: " ",
    ndash: "–",
    mdash: "—",
    rsquo: "’",
    lsquo: "‘",
    rdquo: "”",
    ldquo: "“",
    hellip: "…",
  };
  return input.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (match, ent: string) => {
    if (ent[0] === "#") {
      const code = ent[1].toLowerCase() === "x" ? parseInt(ent.slice(2), 16) : parseInt(ent.slice(1), 10);
      return Number.isFinite(code) && code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : match;
    }
    return named[ent.toLowerCase()] ?? match;
  });
}

function htmlToText(html: string): string {
  return decodeEntities(
    html
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<\/(p|li|div)>/gi, "\n")
      .replace(/<[^>]+>/g, ""),
  );
}

function stripUrls(text: string): string {
  return text.replace(/\bhttps?:\/\/\S+/gi, "").replace(/\bwww\.\S+/gi, "");
}

function cleanLocation(raw: string | null): string | null {
  if (!raw) return null;
  const cleaned = stripUrls(raw)
    .replace(/\s+/g, " ")
    .replace(/[\s\-–—:,]+$/, "")
    .replace(/\(\s*$/, "")
    .trim();
  if (!cleaned) return null;
  return cleaned.slice(0, MAX_LOCATION_LENGTH);
}

/**
 * Location for one card. The `.loc` line is used when it is real text; when it
 * is a link (a meeting join URL) we fall back to a "Location:" line in the
 * description, then to "Online".
 */
function extractLocation(segment: string): string | null {
  const labelMatch = segment.match(/<div class="it loc">[\s\S]*?<span class="lbl">([\s\S]*?)<\/span>/);
  const label = labelMatch ? htmlToText(labelMatch[1]).trim() : "";
  if (label && !/https?:\/\/|^www\./i.test(label)) {
    return cleanLocation(label);
  }
  const descMatch = segment.match(/<div class="it txt">([\s\S]*?)<\/div>\s*<div class="(?:it loc|act)"/);
  if (descMatch) {
    const locationLine = htmlToText(descMatch[1]).match(/Location:\s*([^\n]+)/i);
    const fromDescription = cleanLocation(locationLine ? locationLine[1] : null);
    if (fromDescription) return fromDescription;
  }
  return label ? "Online" : null;
}

interface CardParts {
  id: string;
  title: string;
  dateLine: string;
  segment: string;
}

function splitCards(html: string): CardParts[] | null {
  const marker = /<p class="it tit evtlink">/g;
  const starts: number[] = [];
  let m: RegExpExecArray | null;
  while ((m = marker.exec(html)) !== null) starts.push(m.index);
  if (starts.length === 0) return null;

  const cards: CardParts[] = [];
  for (let i = 0; i < starts.length; i++) {
    const segment = html.slice(starts[i], i + 1 < starts.length ? starts[i + 1] : html.length);
    const link = segment.match(/<a href="\/event\/([A-Za-z0-9]{6,24})"[^>]*>([\s\S]*?)<\/a>/);
    const dat = segment.match(/<p class="it dat">([\s\S]*?)<\/p>/);
    if (!link || !dat) {
      cards.push({ id: "", title: "", dateLine: "", segment });
      continue;
    }
    cards.push({
      id: link[1],
      title: htmlToText(link[2]).replace(/\s+/g, " ").trim().slice(0, MAX_TITLE_LENGTH),
      dateLine: htmlToText(dat[1]).replace(/\s+/g, " ").trim(),
      segment,
    });
  }
  return cards;
}

interface ClockDate {
  /** Offset of the page's labelled time zone from UTC, in minutes. */
  offsetMinutes: number;
  weekday: number;
  month: number;
  day: number;
  startH: number;
  startM: number;
  endH: number;
  endM: number;
}

function parseDateLine(line: string): ClockDate | "unexpected_timezone" | null {
  const m = line.match(DATE_LINE);
  if (!m) return null;
  const offsetMinutes = ZONE_OFFSET_MINUTES[m[8].trim().toUpperCase()];
  if (offsetMinutes === undefined) return "unexpected_timezone";
  const weekday = WEEKDAYS.indexOf(m[1].toLowerCase());
  const month = MONTHS.indexOf(m[3].toLowerCase());
  const day = Number(m[2]);
  const startH = Number(m[4]);
  const startM = Number(m[5]);
  const endH = Number(m[6]);
  const endM = Number(m[7]);
  if (weekday < 0 || month < 0 || day < 1 || day > 31) return null;
  if (startH > 23 || endH > 23 || startM > 59 || endM > 59) return null;
  return { offsetMinutes, weekday, month, day, startH, startM, endH, endM };
}

/**
 * The page omits the year. Events are listed chronologically, so for each card
 * take the earliest year (from the previous event's year, or the current year
 * for the first card) in which this day and month fall on the stated weekday
 * and are not before the previous event. Returns null when no year in the next
 * three fits, which means the card is skipped rather than guessed.
 */
interface InferredStart {
  startMs: number;
  /** Year of the labelled (wall-clock) date, used to seed the next card. */
  wallYear: number;
}

function inferStart(clock: ClockDate, floorMs: number, firstYear: number, horizonMs: number): InferredStart | null {
  for (let year = firstYear; year <= firstYear + 2; year++) {
    const wall = Date.UTC(year, clock.month, clock.day, clock.startH, clock.startM);
    const asDate = new Date(wall);
    if (asDate.getUTCMonth() !== clock.month || asDate.getUTCDate() !== clock.day) continue;
    if (asDate.getUTCDay() !== clock.weekday) continue;
    const candidate = wall - clock.offsetMinutes * 60 * 1000;
    if (candidate < floorMs) continue;
    // Candidates only move later from here, so anything past the horizon means no fit.
    if (candidate > horizonMs) return null;
    return { startMs: candidate, wallYear: year };
  }
  return null;
}

export function parseAddEventCalendarHtml(html: string, now: Date = new Date()): ParseResult {
  const cards = splitCards(html);
  if (!cards) {
    throw new AddEventParseError("parse_empty", "No events were found on the AddEvent calendar page.");
  }

  const events: ParsedCalendarEvent[] = [];
  const seen = new Set<string>();
  let skipped = 0;
  // Allow an event that started earlier today (UTC) to still be listed.
  let floorMs = now.getTime() - DAY_MS;
  let firstYear = now.getUTCFullYear();
  // The page lists upcoming events only. A card that only fits a date more than
  // this far out most likely has a wrong weekday, so skip it rather than guess a year.
  const horizonMs = now.getTime() + MAX_HORIZON_DAYS * DAY_MS;

  for (const card of cards) {
    if (!card.id || !card.title) {
      skipped++;
      continue;
    }
    const clock = parseDateLine(card.dateLine);
    if (clock === "unexpected_timezone") {
      throw new AddEventParseError(
        "parse_unexpected_format",
        "The AddEvent page is showing times in a time zone this reader does not recognise, so the calendar cannot be read safely.",
      );
    }
    if (!clock) {
      skipped++;
      continue;
    }
    const inferred = inferStart(clock, floorMs, firstYear, horizonMs);
    if (inferred === null) {
      skipped++;
      continue;
    }
    const { startMs, wallYear } = inferred;
    const offsetMs = clock.offsetMinutes * 60 * 1000;
    let endMs = Date.UTC(wallYear, clock.month, clock.day, clock.endH, clock.endM) - offsetMs;
    if (endMs <= startMs) endMs += DAY_MS;

    const start_utc = new Date(startMs).toISOString();
    const key = `${card.id}|${start_utc}`;
    if (seen.has(key)) continue;
    seen.add(key);

    events.push({
      id: card.id,
      title: card.title,
      start_utc,
      end_utc: new Date(endMs).toISOString(),
      location_label: extractLocation(card.segment),
      url: `https://www.addevent.com/event/${card.id}`,
    });
    floorMs = startMs;
    firstYear = wallYear;
  }

  if (events.length === 0) {
    throw new AddEventParseError("parse_empty", "No readable events were found on the AddEvent calendar page.");
  }
  events.sort((a, b) => (a.start_utc < b.start_utc ? -1 : a.start_utc > b.start_utc ? 1 : 0));
  return { events, skipped };
}
