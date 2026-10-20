# AddEvent calendar PDF download

> **Last updated:** 2026-10-20 · **Reconsider by:** 2027-01-20 · **Confidence:** high on behaviour (verified against the live AddEvent page and by tests); medium on durability, because this reads a third-party public web page, not an API.

The "Download calendar (PDF)" button on the calendar pages produces a PDF of Vivacity's upcoming events for a date range the user picks. It replaced a "Download PDF to Print" link that pointed at a 2024 PDF on the retired `www.vivacity.training` WordPress site (the host no longer resolves).

## Where it appears

`AddEventEmbed` is shared, so the button shows on `/client/calendar`, the staff `/calendar` and `/academy/events`, next to the embedded AddEvent calendar (calendar id `DE347781`, "Superhero Members").

## How it works

1. `src/components/calendar/CalendarPdfDownload.tsx` — popover with a date range picker (presets: next 3 months, next 6 months, all upcoming). Calls the Edge Function, filters to the range, builds the PDF in the browser. A failed fetch or an empty range shows a message; an empty PDF is never produced.
2. `supabase/functions/addevent-calendar-events/index.ts` — fetches the fixed public calendar page server-side (the embed is a cross-origin iframe, so the browser cannot read it), parses it, caches the result in memory for 10 minutes. Gate: `staff.internal` or any user with a `tenant_users` row. Nothing from the request reaches the outbound URL. Meeting join links are never returned.
3. `supabase/functions/_shared/addevent-calendar-parser.ts` — pure, dependency-free parser (tested under Node). Fixture: `_shared/__fixtures__/addevent-calendar-DE347781.html` (trimmed, meeting links removed).
4. `src/lib/calendar/eventsPdf.ts` — Sydney-time formatting (AEST/AEDT from the real offset) and the jsPDF/autotable layout.

## Things that are easy to get wrong

- **The page has no year.** The parser infers it from the weekday and the chronological order of the list, and skips a card rather than guess if it only fits a date more than 500 days away.
- **The page shows times in the requester's own zone.** The same request returned `(UTC)` to one client and `(PHT)` to another. The parser reads the label on every card and converts with a fixed-offset table; an unknown or ambiguous label (`IST`, `CST`, `BST`) fails loudly (`parse_unexpected_format`).
- **The date/time separator is not stable.** The page mixes `⋅` (U+22C5) and an HTML-encoded `‧` (U+2027) in one list, so any punctuation is accepted there.
- **Recurring events share one id.** Events are keyed on id plus start time.

## Failure modes (all surface as a clear message, never an empty PDF)

| Code | Meaning |
|---|---|
| `parse_empty` | The page loaded but no card could be read — AddEvent has probably changed its markup. Update the parser and re-capture the fixture. |
| `parse_unexpected_format` | A card used a time zone label the parser does not know. Add it to `ZONE_OFFSET_MINUTES` only if it is unambiguous. |
| `upstream_unavailable` | AddEvent was unreachable, slow (10 s limit) or returned an error. |

## Durable alternative

AddEvent's v2 API (`https://api.addevent.com/calevent/v2/events`, Bearer API key from the AddEvent dashboard's account settings) returns structured events with no scraping. It was not used because nobody with dashboard access was available. If a key is obtained, store it as an Edge Function secret and replace the page fetch and parser with an API call; the response shape returned to the browser can stay the same.

## Related

- Hosting a static PDF instead was considered and rejected: there is no current calendar PDF, and it would need an annual manual update.
