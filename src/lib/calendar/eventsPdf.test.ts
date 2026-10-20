import { describe, expect, it } from "vitest";
import {
  buildCalendarPdf,
  calendarPdfFilename,
  eventDateKey,
  filterEventsByRange,
  formatEventDate,
  formatEventDateShort,
  formatEventTime,
  groupEventsByMonth,
  pdfSafeText,
  zonedParts,
  type CalendarEvent,
} from "./eventsPdf";

function ev(id: string, start: string, end: string, extra: Partial<CalendarEvent> = {}): CalendarEvent {
  return {
    id,
    title: `Event ${id}`,
    start_utc: start,
    end_utc: end,
    location_label: "Online (Teams)",
    url: `https://www.addevent.com/event/${id}`,
    ...extra,
  };
}

describe("Sydney time formatting", () => {
  it("shows 3:00 pm AEDT for a summer 04:00 UTC start", () => {
    expect(formatEventTime("2026-11-04T04:00:00.000Z", "2026-11-04T05:30:00.000Z")).toBe("3:00 pm – 4:30 pm AEDT");
  });

  it("shows 3:00 pm AEST for a winter 05:00 UTC start", () => {
    expect(formatEventTime("2027-06-28T05:00:00.000Z", "2027-06-28T06:30:00.000Z")).toBe("3:00 pm – 4:30 pm AEST");
  });

  it("switches label across the April 2027 daylight saving end (4 April)", () => {
    expect(zonedParts("2027-04-03T04:00:00.000Z").zoneLabel).toBe("AEDT");
    expect(zonedParts("2027-04-05T05:00:00.000Z").zoneLabel).toBe("AEST");
  });

  it("switches label across the October 2026 daylight saving start (4 October)", () => {
    expect(zonedParts("2026-10-03T05:00:00.000Z").zoneLabel).toBe("AEST");
    expect(zonedParts("2026-10-05T04:00:00.000Z").zoneLabel).toBe("AEDT");
  });

  it("formats dates as weekday DD Month YYYY in Sydney time", () => {
    expect(formatEventDate("2026-11-04T04:00:00.000Z")).toBe("Wednesday 4 November 2026");
  });

  it("uses a short weekday for the compact table date", () => {
    expect(formatEventDateShort("2026-11-04T04:00:00.000Z")).toBe("Wed 4 November 2026");
  });

  it("moves the date forward when Sydney is already on the next day", () => {
    // 14:30 UTC on 26 Oct 2026 is 1:30 am on 27 Oct in Sydney (AEDT).
    expect(formatEventDate("2026-10-26T14:30:00.000Z")).toBe("Tuesday 27 October 2026");
    expect(eventDateKey("2026-10-26T14:30:00.000Z")).toBe("2026-10-27");
  });

  it("formats midnight and noon correctly", () => {
    // 13:00 UTC in summer is midnight AEDT; 01:00 UTC is noon AEDT.
    expect(formatEventTime("2026-11-04T13:00:00.000Z", "2026-11-04T14:00:00.000Z")).toBe("12:00 am – 1:00 am AEDT");
    expect(formatEventTime("2026-11-04T01:00:00.000Z", "2026-11-04T02:00:00.000Z")).toBe("12:00 pm – 1:00 pm AEDT");
  });
});

describe("range filtering and grouping", () => {
  const events = [
    ev("c", "2026-12-17T02:00:00.000Z", "2026-12-17T06:00:00.000Z"),
    ev("a", "2026-11-04T04:00:00.000Z", "2026-11-04T05:30:00.000Z"),
    ev("b", "2026-11-16T04:00:00.000Z", "2026-11-16T05:30:00.000Z"),
    ev("d", "2027-01-25T04:00:00.000Z", "2027-01-25T05:30:00.000Z"),
  ];

  it("keeps events inside the inclusive range, sorted by start", () => {
    const result = filterEventsByRange(events, { from: "2026-11-04", to: "2026-12-17" });
    expect(result.map((e) => e.id)).toEqual(["a", "b", "c"]);
  });

  it("includes an event on the boundary day by its Sydney date", () => {
    // 4 Nov 3 pm Sydney is still 4 Nov, so a range ending on 4 Nov includes it.
    expect(filterEventsByRange(events, { from: "2026-11-01", to: "2026-11-04" }).map((e) => e.id)).toEqual(["a"]);
    expect(filterEventsByRange(events, { from: "2026-11-05", to: "2026-11-15" })).toEqual([]);
  });

  it("groups by Sydney month label across a year boundary", () => {
    const groups = groupEventsByMonth(filterEventsByRange(events, { from: "2026-11-01", to: "2027-01-31" }));
    expect(groups.map((g) => g.label)).toEqual(["November 2026", "December 2026", "January 2027"]);
    expect(groups[0].events.map((e) => e.id)).toEqual(["a", "b"]);
  });
});

describe("pdfSafeText", () => {
  it("replaces typographic characters that built-in PDF fonts cannot draw", () => {
    expect(pdfSafeText("Superhero Tools — RTO … ‘x’ “y” – z")).toBe("Superhero Tools - RTO ... 'x' \"y\" - z");
  });

  it("replaces anything outside Latin-1 with a question mark rather than corrupting the PDF", () => {
    expect(pdfSafeText("Learn \u{1F680} now")).toMatch(/^Learn \?+ now$/);
  });
});

describe("calendarPdfFilename", () => {
  it("includes the selected range", () => {
    expect(calendarPdfFilename({ from: "2026-11-01", to: "2027-01-31" })).toBe(
      "Vivacity-Events-Calendar_2026-11-01_to_2027-01-31.pdf",
    );
  });
});

describe("buildCalendarPdf", () => {
  const events = [
    ev("a", "2026-11-04T04:00:00.000Z", "2026-11-04T05:30:00.000Z", { title: "Trainers Edge — Coaching" }),
    ev("b", "2026-12-17T02:00:00.000Z", "2026-12-17T06:00:00.000Z", { location_label: null }),
  ];

  it("renders the title, range, month groups, events, times and brand footer", () => {
    const doc = buildCalendarPdf({
      events,
      range: { from: "2026-11-01", to: "2026-12-31" },
      generatedAt: new Date(2026, 9, 20),
    });
    const text = doc.output();
    expect(text).toContain("Vivacity Events Calendar");
    expect(text).toContain("1 November 2026 to 31 December 2026");
    expect(text).toContain("November 2026");
    expect(text).toContain("December 2026");
    expect(text).toContain("Trainers Edge - Coaching");
    expect(text).toContain("Wed 4 November 2026");
    expect(text).toContain("3:00 pm");
    expect(text).toContain("AEDT");
    expect(text).toContain("We make Compliance Simple!");
    expect(text).toContain("Generated 20 October 2026");
    expect(text).toContain("Page 1 of 1");
  });

  it("adds a link annotation to the event page for each event", () => {
    const text = buildCalendarPdf({ events, range: { from: "2026-11-01", to: "2026-12-31" } }).output();
    expect(text).toContain("https://www.addevent.com/event/a");
    expect(text).toContain("https://www.addevent.com/event/b");
  });

  it("mentions unreadable events when some were skipped, and not otherwise", () => {
    const withSkips = buildCalendarPdf({ events, range: { from: "2026-11-01", to: "2026-12-31" }, skipped: 2 }).output();
    expect(withSkips).toContain("2 listed events were not readable");
    const without = buildCalendarPdf({ events, range: { from: "2026-11-01", to: "2026-12-31" } }).output();
    expect(without).not.toContain("not readable");
  });

  it("paginates a long list and numbers every page", () => {
    const many = Array.from({ length: 60 }, (_, i) =>
      ev(`e${i}`, `2026-11-${String((i % 28) + 1).padStart(2, "0")}T04:00:00.000Z`, `2026-11-${String((i % 28) + 1).padStart(2, "0")}T05:30:00.000Z`),
    );
    const doc = buildCalendarPdf({ events: many, range: { from: "2026-11-01", to: "2026-11-30" } });
    const pages = doc.getNumberOfPages();
    expect(pages).toBeGreaterThan(1);
    expect(doc.output()).toContain(`Page ${pages} of ${pages}`);
  });
});
