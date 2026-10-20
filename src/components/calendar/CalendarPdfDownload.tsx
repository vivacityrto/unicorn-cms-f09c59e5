import { useState } from "react";
import type { DateRange as PickerRange } from "react-day-picker";
import { addMonths, format, startOfDay } from "date-fns";
import { FunctionsHttpError } from "@supabase/supabase-js";
import { Download, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import type { CalendarEvent } from "@/lib/calendar/eventsPdf";

interface EventsResponse {
  events: CalendarEvent[];
  skipped: number;
  fetched_at: string;
}

const GENERIC_ERROR = "The events calendar could not be downloaded right now. Please try again in a few minutes.";

async function fetchEvents(): Promise<EventsResponse> {
  const { data, error } = await supabase.functions.invoke("addevent-calendar-events");
  if (error) {
    let message = GENERIC_ERROR;
    if (error instanceof FunctionsHttpError) {
      try {
        const body = (await error.context.json()) as { error?: string };
        if (body?.error) message = body.error;
      } catch {
        // keep the generic message
      }
    }
    throw new Error(message);
  }
  const body = data as Partial<EventsResponse> | null;
  if (!body || !Array.isArray(body.events)) throw new Error(GENERIC_ERROR);
  return { events: body.events, skipped: body.skipped ?? 0, fetched_at: body.fetched_at ?? "" };
}

function defaultRange(): PickerRange {
  const today = startOfDay(new Date());
  return { from: today, to: addMonths(today, 3) };
}

/**
 * "Download calendar (PDF)" button with a date range picker. Fetches the
 * upcoming events from the `addevent-calendar-events` Edge Function and builds
 * the PDF in the browser. Never produces a PDF with no events: a failed fetch
 * or an empty range shows a message instead.
 */
export function CalendarPdfDownload() {
  const [open, setOpen] = useState(false);
  const [range, setRange] = useState<PickerRange | undefined>(defaultRange);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ kind: "error" | "info"; text: string } | null>(null);

  const setPreset = (months: number | "all") => {
    const today = startOfDay(new Date());
    setRange({ from: today, to: months === "all" ? addMonths(today, 24) : addMonths(today, months) });
    setMessage(null);
  };

  const handleDownload = async () => {
    if (!range?.from) {
      setMessage({ kind: "info", text: "Choose the dates you want to include." });
      return;
    }
    const picked = { from: format(range.from, "yyyy-MM-dd"), to: format(range.to ?? range.from, "yyyy-MM-dd") };
    setBusy(true);
    setMessage(null);
    try {
      const { events, skipped } = await fetchEvents();
      const { buildCalendarPdf, calendarPdfFilename, filterEventsByRange } = await import("@/lib/calendar/eventsPdf");
      const inRange = filterEventsByRange(events, picked);
      if (inRange.length === 0) {
        setMessage({ kind: "info", text: "There are no events scheduled between those dates. Try a longer range." });
        return;
      }
      buildCalendarPdf({ events: inRange, range: picked, skipped }).save(calendarPdfFilename(picked));
      setOpen(false);
    } catch (err) {
      setMessage({ kind: "error", text: err instanceof Error ? err.message : GENERIC_ERROR });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) setMessage(null);
      }}
    >
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" className="gap-2">
          <Download className="h-4 w-4" />
          Download calendar (PDF)
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-3" align="start">
        <p className="mb-2 text-sm font-medium">Choose the dates to include</p>
        <div className="mb-2 flex flex-wrap gap-2">
          <Button type="button" variant="ghost" size="sm" onClick={() => setPreset(3)}>
            Next 3 months
          </Button>
          <Button type="button" variant="ghost" size="sm" onClick={() => setPreset(6)}>
            Next 6 months
          </Button>
          <Button type="button" variant="ghost" size="sm" onClick={() => setPreset("all")}>
            All upcoming
          </Button>
        </div>
        <Calendar
          mode="range"
          selected={range}
          onSelect={(next) => {
            setRange(next);
            setMessage(null);
          }}
          defaultMonth={range?.from}
          numberOfMonths={1}
          weekStartsOn={1}
          initialFocus
          className="p-0 pointer-events-auto"
        />
        <p className="mt-2 text-xs text-muted-foreground">
          {range?.from
            ? `${format(range.from, "d MMMM yyyy")} to ${format(range.to ?? range.from, "d MMMM yyyy")}`
            : "No dates chosen"}
          . Times are shown in AEST/AEDT.
        </p>
        {message && (
          <p role="alert" className={`mt-2 max-w-xs text-sm ${message.kind === "error" ? "text-destructive" : "text-muted-foreground"}`}>
            {message.text}
          </p>
        )}
        <Button className="mt-3 w-full gap-2" onClick={handleDownload} disabled={busy}>
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
          {busy ? "Preparing PDF…" : "Download PDF"}
        </Button>
      </PopoverContent>
    </Popover>
  );
}
