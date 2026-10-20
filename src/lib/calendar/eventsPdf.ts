import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";

/** One upcoming event, as returned by the `addevent-calendar-events` Edge Function. */
export interface CalendarEvent {
  id: string;
  title: string;
  /** ISO 8601 instant (UTC). */
  start_utc: string;
  /** ISO 8601 instant (UTC). */
  end_utc: string;
  location_label: string | null;
  url: string;
}

/** Inclusive date range as `yyyy-MM-dd` strings, read as Sydney calendar dates. */
export interface DateRange {
  from: string;
  to: string;
}

export const CALENDAR_TIME_ZONE = "Australia/Sydney";

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

const BRAND = {
  purple: [113, 48, 160] as [number, number, number],
  fuchsia: [237, 24, 120] as [number, number, number],
  acai: [68, 35, 95] as [number, number, number],
  lightPurple: [223, 216, 232] as [number, number, number],
};

const zonedFormatter = new Intl.DateTimeFormat("en-AU", {
  timeZone: CALENDAR_TIME_ZONE,
  year: "numeric",
  month: "numeric",
  day: "numeric",
  hour: "numeric",
  minute: "numeric",
  weekday: "long",
  hourCycle: "h23",
});

interface ZonedParts {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  weekday: string;
  /** "AEST" (+10) or "AEDT" (+11). */
  zoneLabel: string;
}

/** Wall-clock parts of an instant in Sydney time, with the AEST/AEDT label for that instant. */
export function zonedParts(iso: string): ZonedParts {
  const instant = new Date(iso);
  const parts: Record<string, string> = {};
  for (const p of zonedFormatter.formatToParts(instant)) parts[p.type] = p.value;
  const year = Number(parts.year);
  const month = Number(parts.month);
  const day = Number(parts.day);
  const hour = Number(parts.hour) % 24;
  const minute = Number(parts.minute);
  const wallAsUtc = Date.UTC(year, month - 1, day, hour, minute);
  const instantMinute = Math.floor(instant.getTime() / 60000) * 60000;
  const offsetMinutes = Math.round((wallAsUtc - instantMinute) / 60000);
  return {
    year,
    month,
    day,
    hour,
    minute,
    weekday: parts.weekday,
    zoneLabel: offsetMinutes === 660 ? "AEDT" : "AEST",
  };
}

function formatClock(hour: number, minute: number): string {
  const h12 = hour % 12 === 0 ? 12 : hour % 12;
  return `${h12}:${String(minute).padStart(2, "0")} ${hour < 12 ? "am" : "pm"}`;
}

/** "Wednesday 4 November 2026" (Sydney date). */
export function formatEventDate(iso: string): string {
  const p = zonedParts(iso);
  return `${p.weekday} ${p.day} ${MONTH_NAMES[p.month - 1]} ${p.year}`;
}

/** "Wed 4 November 2026" (Sydney date), the compact form used in the PDF table. */
export function formatEventDateShort(iso: string): string {
  const p = zonedParts(iso);
  return `${p.weekday.slice(0, 3)} ${p.day} ${MONTH_NAMES[p.month - 1]} ${p.year}`;
}

/** "3:00 pm – 4:30 pm AEDT" (Sydney time, label from the start instant). */
export function formatEventTime(startIso: string, endIso: string): string {
  const s = zonedParts(startIso);
  const e = zonedParts(endIso);
  return `${formatClock(s.hour, s.minute)} – ${formatClock(e.hour, e.minute)} ${s.zoneLabel}`;
}

/** "20 October 2026" for a plain date (no time zone shift applied). */
export function formatLongDate(date: Date): string {
  return `${date.getDate()} ${MONTH_NAMES[date.getMonth()]} ${date.getFullYear()}`;
}

function formatRangeDate(ymd: string): string {
  const [y, m, d] = ymd.split("-").map(Number);
  return `${d} ${MONTH_NAMES[m - 1]} ${y}`;
}

/** Sydney calendar date of an instant as `yyyy-MM-dd`. */
export function eventDateKey(iso: string): string {
  const p = zonedParts(iso);
  return `${p.year}-${String(p.month).padStart(2, "0")}-${String(p.day).padStart(2, "0")}`;
}

/** Events whose Sydney start date falls inside the inclusive range, in start order. */
export function filterEventsByRange(events: CalendarEvent[], range: DateRange): CalendarEvent[] {
  return events
    .filter((e) => {
      const key = eventDateKey(e.start_utc);
      return key >= range.from && key <= range.to;
    })
    .sort((a, b) => (a.start_utc < b.start_utc ? -1 : a.start_utc > b.start_utc ? 1 : 0));
}

export interface MonthGroup {
  label: string;
  events: CalendarEvent[];
}

export function groupEventsByMonth(events: CalendarEvent[]): MonthGroup[] {
  const groups: MonthGroup[] = [];
  for (const event of events) {
    const p = zonedParts(event.start_utc);
    const label = `${MONTH_NAMES[p.month - 1]} ${p.year}`;
    const last = groups[groups.length - 1];
    if (last && last.label === label) last.events.push(event);
    else groups.push({ label, events: [event] });
  }
  return groups;
}

/** jsPDF's built-in fonts only cover Latin-1; swap common typographic characters for plain ones. */
export function pdfSafeText(text: string): string {
  return text
    .replace(/[\u2013\u2014\u2212]/g, "-")
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/\u2026/g, "...")
    .replace(/[\u00A0\u2007\u202F]/g, " ")
    // eslint-disable-next-line no-control-regex
    .replace(/[^\u0000-\u00FF]/g, "?");
}

export function calendarPdfFilename(range: DateRange): string {
  return `Vivacity-Events-Calendar_${range.from}_to_${range.to}.pdf`;
}

export interface BuildCalendarPdfOptions {
  events: CalendarEvent[];
  range: DateRange;
  /** Events the source page listed but that could not be read. */
  skipped?: number;
  generatedAt?: Date;
}

const PAGE_MARGIN_X = 14;
const HEADER_HEIGHT = 30;
const FOOTER_RESERVE = 16;

export function buildCalendarPdf(options: BuildCalendarPdfOptions): jsPDF {
  const { events, range, skipped = 0, generatedAt = new Date() } = options;
  const doc = new jsPDF({ unit: "mm", format: "a4", orientation: "portrait" });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();

  // Header band (first page).
  doc.setFillColor(...BRAND.purple);
  doc.rect(0, 0, pageWidth, HEADER_HEIGHT, "F");
  doc.setFillColor(...BRAND.fuchsia);
  doc.rect(0, HEADER_HEIGHT, pageWidth, 1.2, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(20);
  doc.text("Vivacity Events Calendar", PAGE_MARGIN_X, 14);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.text(
    pdfSafeText(`${formatRangeDate(range.from)} to ${formatRangeDate(range.to)}  |  Times shown in AEST/AEDT (Sydney)`),
    PAGE_MARGIN_X,
    22,
  );
  if (skipped > 0) {
    doc.setFontSize(8);
    doc.text(
      pdfSafeText(`${skipped} listed event${skipped === 1 ? " was" : "s were"} not readable and ${skipped === 1 ? "is" : "are"} not included.`),
      PAGE_MARGIN_X,
      27,
    );
  }

  // Body: one table, month group rows, link on the event title.
  const urlByRowIndex = new Map<number, string>();
  const body: Array<Array<string | { content: string; colSpan: number; styles: Record<string, unknown> }>> = [];
  for (const group of groupEventsByMonth(events)) {
    body.push([
      {
        content: pdfSafeText(group.label),
        colSpan: 4,
        styles: { fillColor: BRAND.lightPurple, textColor: BRAND.acai, fontStyle: "bold", fontSize: 10 },
      },
    ]);
    for (const event of group.events) {
      urlByRowIndex.set(body.length, event.url);
      body.push([
        pdfSafeText(formatEventDateShort(event.start_utc)),
        pdfSafeText(formatEventTime(event.start_utc, event.end_utc)),
        pdfSafeText(event.title),
        pdfSafeText(event.location_label ?? ""),
      ]);
    }
  }

  autoTable(doc, {
    startY: HEADER_HEIGHT + 8,
    margin: { top: 16, left: PAGE_MARGIN_X, right: PAGE_MARGIN_X, bottom: FOOTER_RESERVE },
    head: [["Date", "Time", "Event", "Location"]],
    body,
    theme: "grid",
    styles: { font: "helvetica", fontSize: 8.5, cellPadding: 2.2, lineColor: BRAND.lightPurple, textColor: [40, 40, 40], valign: "top" },
    headStyles: { fillColor: BRAND.purple, textColor: 255, fontStyle: "bold" },
    columnStyles: {
      0: { cellWidth: 38 },
      1: { cellWidth: 44 },
      2: { cellWidth: 68, textColor: BRAND.purple },
      3: { cellWidth: 32 },
    },
    didDrawCell: (data) => {
      if (data.section !== "body" || data.column.index !== 2) return;
      const url = urlByRowIndex.get(data.row.index);
      if (url) doc.link(data.cell.x, data.cell.y, data.cell.width, data.cell.height, { url });
    },
  });

  // Footer on every page, once the page count is known.
  const pageCount = doc.getNumberOfPages();
  for (let page = 1; page <= pageCount; page++) {
    doc.setPage(page);
    doc.setDrawColor(...BRAND.fuchsia);
    doc.setLineWidth(0.5);
    doc.line(PAGE_MARGIN_X, pageHeight - 12, pageWidth - PAGE_MARGIN_X, pageHeight - 12);
    doc.setTextColor(...BRAND.acai);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9);
    doc.text("We make Compliance Simple!", PAGE_MARGIN_X, pageHeight - 7);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.text(`Generated ${formatLongDate(generatedAt)}`, pageWidth / 2, pageHeight - 7, { align: "center" });
    doc.text(`Page ${page} of ${pageCount}`, pageWidth - PAGE_MARGIN_X, pageHeight - 7, { align: "right" });
  }

  return doc;
}
