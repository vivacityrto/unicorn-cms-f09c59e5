import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  AddEventParseError,
  decodeEntities,
  parseAddEventCalendarHtml,
} from "./addevent-calendar-parser.ts";

const here = dirname(fileURLToPath(import.meta.url));
const fixture = readFileSync(join(here, "__fixtures__", "addevent-calendar-DE347781.html"), "utf8");

// The fixture was captured on 2026-10-20; every test pins "now" to that day.
const NOW = new Date("2026-10-20T00:00:00Z");

function card(title: string, dateLine: string, extra = ""): string {
  return `<p class="it tit evtlink"><a href="/event/abc123def456" target="_blank">${title}</a></p>
    <p class="it dat">${dateLine}</p>${extra}`;
}

test("parses every card in the saved page", () => {
  const { events, skipped } = parseAddEventCalendarHtml(fixture, NOW);
  assert.equal(events.length, 23);
  assert.equal(skipped, 0);
});

test("first and last events resolve to the right instants and years", () => {
  const { events } = parseAddEventCalendarHtml(fixture, NOW);
  assert.equal(events[0].title, "Superhero Tools Unleashed — RTO Superhero Members");
  assert.equal(events[0].start_utc, "2026-10-26T04:00:00.000Z");
  assert.equal(events[0].end_utc, "2026-10-26T05:30:00.000Z");
  const last = events[events.length - 1];
  assert.equal(last.start_utc, "2027-10-25T04:00:00.000Z");
});

test("year rolls over from December 2026 to January 2027", () => {
  const { events } = parseAddEventCalendarHtml(fixture, NOW);
  const dec = events.find((e) => e.start_utc.startsWith("2026-12-28"));
  const jan = events.find((e) => e.start_utc.startsWith("2027-01-25"));
  assert.ok(dec, "28 December 2026 event present");
  assert.ok(jan, "25 January 2027 event present");
});

test("events come back in chronological order", () => {
  const { events } = parseAddEventCalendarHtml(fixture, NOW);
  const starts = events.map((e) => e.start_utc);
  assert.deepEqual(starts, [...starts].sort());
});

test("recurring event keeps one entry per occurrence, not per id", () => {
  const { events } = parseAddEventCalendarHtml(fixture, NOW);
  const recurring = events.filter((e) => e.id === "dn2rqbr2dpkx");
  assert.equal(recurring.length, 13);
  assert.equal(new Set(recurring.map((e) => e.start_utc)).size, 13);
});

test("winter events start at 05:00 UTC (3 pm AEST) and summer at 04:00 UTC (3 pm AEDT)", () => {
  const { events } = parseAddEventCalendarHtml(fixture, NOW);
  const april = events.find((e) => e.start_utc.startsWith("2027-04-26"));
  const june = events.find((e) => e.start_utc.startsWith("2027-06-28"));
  assert.equal(april?.start_utc, "2027-04-26T05:00:00.000Z");
  assert.equal(june?.start_utc, "2027-06-28T05:00:00.000Z");
});

test("no location or other output ever contains a URL", () => {
  const { events } = parseAddEventCalendarHtml(fixture, NOW);
  for (const e of events) {
    assert.doesNotMatch(e.location_label ?? "", /https?:\/\/|www\./i);
    assert.doesNotMatch(e.title, /https?:\/\//i);
    assert.match(e.url, /^https:\/\/www\.addevent\.com\/event\/[A-Za-z0-9]+$/);
  }
  assert.doesNotMatch(JSON.stringify(events), /teams\.(microsoft|example)/i);
});

test("meeting-link locations fall back to the description's Location line", () => {
  const { events } = parseAddEventCalendarHtml(fixture, NOW);
  const trainersEdge = events.find((e) => e.id === "fwvg9vzw1w3y");
  assert.equal(trainersEdge?.location_label, "Online (Teams)");
});

test("event ids and titles are decoded from HTML", () => {
  const { events } = parseAddEventCalendarHtml(fixture, NOW);
  const inside = events.find((e) => e.id === "y219qgzbv9f6");
  assert.equal(inside?.title, "Inside VET: Industry Engagement & Relevance");
});

test("page with no event cards throws parse_empty", () => {
  assert.throws(
    () => parseAddEventCalendarHtml("<html><body><p>Calendar unavailable</p></body></html>", NOW),
    (err) => err instanceof AddEventParseError && err.code === "parse_empty",
  );
});

test("cards that cannot be read alone also throw parse_empty", () => {
  const html = card("Mystery", "Someday soon");
  assert.throws(
    () => parseAddEventCalendarHtml(html, NOW),
    (err) => err instanceof AddEventParseError && err.code === "parse_empty",
  );
});

test("the same events read identically whatever labelled zone the page used (PHT = UTC+8)", () => {
  // The page showed (PHT) to one request and (UTC) to another. Shift every fixture card's
  // clock by +8 hours (all events start before 16:00 UTC, so the date never changes).
  const shifted = fixture.replace(
    /(<p class="it dat">[^<]*?⋅\s*)(\d{1,2}):(\d{2})(\s*–\s*)(\d{1,2}):(\d{2})\s*\(UTC\)/g,
    (_m, pre, h1, m1, mid, h2, m2) =>
      `${pre}${String((Number(h1) + 8) % 24).padStart(2, "0")}:${m1}${mid}${String((Number(h2) + 8) % 24).padStart(2, "0")}:${m2} (PHT)`,
  );
  assert.notEqual(shifted, fixture);
  const base = parseAddEventCalendarHtml(fixture, NOW);
  const viaPht = parseAddEventCalendarHtml(shifted, NOW);
  assert.deepEqual(
    viaPht.events.map((e) => [e.id, e.start_utc, e.end_utc]),
    base.events.map((e) => [e.id, e.start_utc, e.end_utc]),
  );
  assert.equal(viaPht.events.length, 23);
});

test("Sydney-labelled pages convert with their fixed AEST/AEDT offsets", () => {
  const html =
    card("Summer", "Monday 26 October ⋅ 15:00 – 16:30 (AEDT)") +
    card("Winter", "Monday 26 April ⋅ 15:00 – 16:30 (AEST)");
  const { events } = parseAddEventCalendarHtml(html, NOW);
  assert.equal(events[0].start_utc, "2026-10-26T04:00:00.000Z");
  assert.equal(events[0].end_utc, "2026-10-26T05:30:00.000Z");
  assert.equal(events[1].start_utc, "2027-04-26T05:00:00.000Z");
});

test("a labelled date later than the UTC date keeps the weekday check on the labelled date", () => {
  // Tuesday 27 October 01:30 AEDT is Monday 26 October 14:30 UTC.
  const html = card("Late night", "Tuesday 27 October ⋅ 01:30 – 3:00 (AEDT)");
  const { events } = parseAddEventCalendarHtml(html, NOW);
  assert.equal(events[0].start_utc, "2026-10-26T14:30:00.000Z");
});

test("an unknown or ambiguous time zone label throws parse_unexpected_format instead of guessing", () => {
  for (const label of ["XYZ", "IST", "CST", "BST"]) {
    const html = card("Webinar", `Monday 26 October ⋅ 3:00 – 4:30 (${label})`);
    assert.throws(
      () => parseAddEventCalendarHtml(html, NOW),
      (err) => err instanceof AddEventParseError && err.code === "parse_unexpected_format",
      label,
    );
  }
});

test("accepts the alternate HTML-encoded separator the live page mixes in", () => {
  const html =
    card("Webinar", "Monday 2 November ⋅ 04:00 – 5:30 (UTC)") +
    card("Workshop", "Thursday 5 November &#x2027; 10:00 – 13:00 (PHT)");
  const { events, skipped } = parseAddEventCalendarHtml(html, NOW);
  assert.equal(skipped, 0);
  assert.deepEqual(events.map((e) => e.start_utc), ["2026-11-02T04:00:00.000Z", "2026-11-05T02:00:00.000Z"]);
});

test("a card with an impossible date is skipped, others kept", () => {
  const html =
    card("Good", "Monday 26 October ⋅ 04:00 – 5:30 (UTC)") +
    card("Impossible", "Monday 30 February ⋅ 04:00 – 5:30 (UTC)");
  const { events, skipped } = parseAddEventCalendarHtml(html, NOW);
  assert.equal(events.length, 1);
  assert.equal(skipped, 1);
});

test("a card that only fits a date far beyond the horizon is skipped, not given a guessed year", () => {
  // Monday 24 April next falls in 2028, about 550 days after NOW.
  const html =
    card("Good", "Monday 26 October ⋅ 04:00 – 5:30 (UTC)") +
    card("Far", "Monday 24 April ⋅ 04:00 – 5:30 (UTC)");
  const { events, skipped } = parseAddEventCalendarHtml(html, NOW);
  assert.equal(events.length, 1);
  assert.equal(skipped, 1);
});

test("an end time earlier than the start rolls to the next day", () => {
  const html = card("Late", "Monday 26 October ⋅ 22:00 – 1:00 (UTC)");
  const { events } = parseAddEventCalendarHtml(html, NOW);
  assert.equal(events[0].end_utc, "2026-10-27T01:00:00.000Z");
});

test("events earlier than yesterday are not assigned to the current year", () => {
  // Monday 5 October is before NOW (20 Oct 2026), so the next Monday-5-October is 2037; outside the window.
  const html = card("Past", "Monday 5 October ⋅ 04:00 – 5:30 (UTC)");
  assert.throws(
    () => parseAddEventCalendarHtml(html, NOW),
    (err) => err instanceof AddEventParseError && err.code === "parse_empty",
  );
});

test("decodeEntities handles named and numeric entities and leaves unknown ones", () => {
  assert.equal(decodeEntities("A &amp; B &#39;x&#39; &#x2014; &bogus;"), "A & B 'x' — &bogus;");
});
