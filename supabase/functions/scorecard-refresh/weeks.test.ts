import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { lastCompletedWeekKey, snapshotWeekEnding, sydneyDate } from "./weeks.ts";

describe("sydneyDate", () => {
  it("uses Sydney, not UTC", () => {
    // 14:00 UTC on 16 November is already 17 November in Sydney (AEDT, UTC+11).
    assert.equal(sydneyDate(new Date("2026-11-16T14:00:00Z")), "2026-11-17");
    assert.equal(sydneyDate(new Date("2026-11-16T12:00:00Z")), "2026-11-16");
  });
});

describe("lastCompletedWeekKey", () => {
  it("is the Monday of the previous week from a Tuesday", () => {
    // Tuesday 17 Nov 2026 (Sydney): last completed week is Mon 9 to Sun 15 Nov.
    assert.equal(lastCompletedWeekKey(new Date("2026-11-17T03:00:00Z")), "2026-11-09");
  });
  it("on the Monday after a week ends, picks the week that just ended", () => {
    // The weekly job runs Sunday 16:30 UTC = Monday 03:30 Sydney.
    assert.equal(lastCompletedWeekKey(new Date("2026-11-22T16:30:00Z")), "2026-11-16");
  });
  it("on a Sunday in Sydney, the current week has not ended yet", () => {
    // Sunday 22 Nov 2026, 10:00 Sydney = 23:00 UTC on 21 Nov.
    assert.equal(lastCompletedWeekKey(new Date("2026-11-21T23:00:00Z")), "2026-11-09");
  });
  it("always returns a Monday", () => {
    for (let day = 0; day < 14; day++) {
      const key = lastCompletedWeekKey(new Date(Date.UTC(2026, 10, 10 + day, 6)));
      assert.equal(new Date(`${key}T00:00:00Z`).getUTCDay(), 1, key);
    }
  });
  it("crosses a month and year boundary", () => {
    // Sunday 3 Jan 2027, 12:00 Sydney = 01:00 UTC: the week ending 3 Jan has not completed.
    assert.equal(lastCompletedWeekKey(new Date("2027-01-03T01:00:00Z")), "2026-12-21");
  });
});

describe("snapshotWeekEnding", () => {
  it("maps a Monday key to the Sunday that ends the week", () => {
    assert.equal(snapshotWeekEnding("2026-11-09"), "2026-11-15");
    assert.equal(snapshotWeekEnding("2026-12-28"), "2027-01-03");
  });
  it("leaves a Sunday (or any other date) unchanged", () => {
    assert.equal(snapshotWeekEnding("2026-11-15"), "2026-11-15");
    assert.equal(snapshotWeekEnding("2026-11-11"), "2026-11-11");
  });
});
