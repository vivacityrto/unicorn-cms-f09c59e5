/* @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const invoke = vi.fn();
vi.mock("@/integrations/supabase/client", () => ({
  supabase: { functions: { invoke: (...args: unknown[]) => invoke(...args) } },
}));

const save = vi.fn();
const buildCalendarPdf = vi.fn(() => ({ save }));
vi.mock("@/lib/calendar/eventsPdf", async () => {
  const actual = await vi.importActual<typeof import("@/lib/calendar/eventsPdf")>("@/lib/calendar/eventsPdf");
  return { ...actual, buildCalendarPdf: (...args: unknown[]) => (buildCalendarPdf as (...a: unknown[]) => unknown)(...args) };
});

import { FunctionsHttpError } from "@supabase/supabase-js";
import { CalendarPdfDownload } from "../CalendarPdfDownload";

function event(id: string, start: string, end: string) {
  return {
    id,
    title: `Event ${id}`,
    start_utc: start,
    end_utc: end,
    location_label: "Online (Teams)",
    url: `https://www.addevent.com/event/${id}`,
  };
}

async function openPicker() {
  const user = userEvent.setup();
  render(<CalendarPdfDownload />);
  await user.click(screen.getByRole("button", { name: /download calendar \(pdf\)/i }));
  return user;
}

describe("CalendarPdfDownload", () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date(2026, 9, 20, 10, 0, 0));
    invoke.mockReset();
    save.mockReset();
    buildCalendarPdf.mockClear();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("downloads a PDF of the events inside the default three-month range", async () => {
    invoke.mockResolvedValue({
      data: {
        events: [
          event("in", "2026-11-04T04:00:00.000Z", "2026-11-04T05:30:00.000Z"),
          event("out", "2027-06-28T05:00:00.000Z", "2027-06-28T06:30:00.000Z"),
        ],
        skipped: 0,
        fetched_at: "2026-10-20T00:00:00.000Z",
      },
      error: null,
    });
    const user = await openPicker();
    await user.click(screen.getByRole("button", { name: /^download pdf$/i }));

    await waitFor(() => expect(save).toHaveBeenCalledTimes(1));
    expect(invoke).toHaveBeenCalledWith("addevent-calendar-events");
    const arg = (buildCalendarPdf.mock.calls[0] as unknown[])[0] as { events: { id: string }[]; range: { from: string; to: string } };
    expect(arg.events.map((e) => e.id)).toEqual(["in"]);
    expect(arg.range).toEqual({ from: "2026-10-20", to: "2027-01-20" });
    expect(save).toHaveBeenCalledWith("Vivacity-Events-Calendar_2026-10-20_to_2027-01-20.pdf");
  });

  it("widens the range with the All upcoming preset", async () => {
    invoke.mockResolvedValue({
      data: {
        events: [event("far", "2027-06-28T05:00:00.000Z", "2027-06-28T06:30:00.000Z")],
        skipped: 1,
        fetched_at: "",
      },
      error: null,
    });
    const user = await openPicker();
    await user.click(screen.getByRole("button", { name: /all upcoming/i }));
    await user.click(screen.getByRole("button", { name: /^download pdf$/i }));

    await waitFor(() => expect(save).toHaveBeenCalledTimes(1));
    const arg = (buildCalendarPdf.mock.calls[0] as unknown[])[0] as { events: { id: string }[]; skipped: number };
    expect(arg.events.map((e) => e.id)).toEqual(["far"]);
    expect(arg.skipped).toBe(1);
  });

  it("shows a message and does not build a PDF when no events fall in the range", async () => {
    invoke.mockResolvedValue({
      data: { events: [event("far", "2027-06-28T05:00:00.000Z", "2027-06-28T06:30:00.000Z")], skipped: 0, fetched_at: "" },
      error: null,
    });
    const user = await openPicker();
    await user.click(screen.getByRole("button", { name: /^download pdf$/i }));

    expect(await screen.findByRole("alert")).toHaveTextContent(/no events scheduled between those dates/i);
    expect(buildCalendarPdf).not.toHaveBeenCalled();
    expect(save).not.toHaveBeenCalled();
  });

  it("shows the server's error message and does not build a PDF when the function fails", async () => {
    const response = new Response(
      JSON.stringify({ error: "The events calendar could not be read right now.", code: "parse_empty" }),
      { status: 502, headers: { "Content-Type": "application/json" } },
    );
    invoke.mockResolvedValue({ data: null, error: new FunctionsHttpError(response) });
    const user = await openPicker();
    await user.click(screen.getByRole("button", { name: /^download pdf$/i }));

    expect(await screen.findByRole("alert")).toHaveTextContent("The events calendar could not be read right now.");
    expect(buildCalendarPdf).not.toHaveBeenCalled();
    expect(save).not.toHaveBeenCalled();
  });

  it("falls back to a generic message for an unexpected response", async () => {
    invoke.mockResolvedValue({ data: { nope: true }, error: null });
    const user = await openPicker();
    await user.click(screen.getByRole("button", { name: /^download pdf$/i }));

    expect(await screen.findByRole("alert")).toHaveTextContent(/could not be downloaded right now/i);
    expect(save).not.toHaveBeenCalled();
  });
});
