import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { AcademyLayout } from "@/components/layout/AcademyLayout";
import { AddEventEmbed } from "@/components/calendar/AddEventEmbed";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";

const HELP_STORAGE_KEY = "academy-events-help-expanded";

const EventsHelp = () => {
  // Lazy initial state — guarded for SSR/hydration safety.
  const [open, setOpen] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    try {
      return localStorage.getItem(HELP_STORAGE_KEY) === "true";
    } catch {
      return false;
    }
  });

  const handleToggle = (next: boolean) => {
    setOpen(next);
    try {
      localStorage.setItem(HELP_STORAGE_KEY, String(next));
    } catch {
      // Safari private mode and similar — ignore write failures so
      // the disclosure never crashes the page.
    }
  };

  return (
    <Collapsible open={open} onOpenChange={handleToggle}>
      <CollapsibleTrigger className="inline-flex items-center gap-1 text-sm font-medium text-[var(--viv-purple)] hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--viv-purple)] rounded">
        How this calendar works
        <ChevronDown
          className="h-4 w-4 transition-transform duration-200 data-[state=open]:rotate-180"
        />
      </CollapsibleTrigger>

      <CollapsibleContent className="mt-3 rounded-lg border border-[var(--viv-purple-light)] bg-card p-5 space-y-5">
        <p className="text-sm text-muted-foreground leading-relaxed">
          This is your live Vivacity Academy events calendar. Subscribe once and
          every new workshop, webinar, and training session appears in your own
          calendar automatically. The Microsoft Teams link for each session is
          built into the event details, so when it's time to join, you click
          straight from your calendar — no need to come back to this page.
        </p>

        <div className="grid gap-6 lg:grid-cols-2">
          <div className="space-y-2">
            <h3 className="text-base font-medium text-foreground">
              Subscribe your calendar (recommended)
            </h3>
            <p className="text-sm text-muted-foreground">
              Click <strong className="font-semibold text-foreground">Follow Calendar</strong> at the top right of the calendar and choose your platform:
            </p>
            <ul className="list-disc pl-5 space-y-1 text-sm text-muted-foreground">
              <li>Outlook (desktop or web)</li>
              <li>Google Calendar</li>
              <li>Apple Calendar (Mac, iPhone, iPad)</li>
              <li>
                Other / Mobile — copy the .ics link and paste into any calendar
                app that supports calendar subscriptions
              </li>
            </ul>
            <p className="text-sm text-muted-foreground">
              You only need to do this once. New events, time changes, and
              cancellations sync to your calendar automatically.
            </p>
          </div>

          <div className="space-y-2">
            <h3 className="text-base font-medium text-foreground">
              Add a single event
            </h3>
            <p className="text-sm text-muted-foreground">
              Prefer to add events one at a time? Click any event in the
              calendar, then choose <strong className="font-semibold text-foreground">Add to Calendar</strong> from the popup. Reminders are included.
            </p>
          </div>
        </div>

        <div className="h-px bg-[var(--viv-purple-light)]" role="separator" />

        <div className="space-y-4">
          <div className="space-y-1">
            <h3 className="text-base font-medium text-foreground">
              Joining a session
            </h3>
            <p className="text-sm text-muted-foreground">
              Every event includes the Microsoft Teams join link inside the
              event description. At the scheduled time, open the event in your
              own calendar and click the link.
            </p>
          </div>

          <div className="space-y-1">
            <h3 className="text-base font-medium text-foreground">Reminders</h3>
            <p className="text-sm text-muted-foreground">
              When you subscribe or add an individual event, AddEvent
              automatically sets reminders. You can adjust or turn these off in
              your own calendar's settings if you prefer.
            </p>
          </div>

          <div className="space-y-1">
            <h3 className="text-base font-medium text-foreground">Time zone</h3>
            <p className="text-sm text-muted-foreground">
              The calendar displays in Australia / Sydney (AEST/AEDT). Once
              subscribed, your own calendar will convert event times to your
              local time zone if you're elsewhere.
            </p>
          </div>
        </div>

        <p className="text-xs text-muted-foreground">
          Need help? Message your CSC and we'll walk you through it.
        </p>
      </CollapsibleContent>
    </Collapsible>
  );
};

const AcademyEvents = () => {
  return (
    <AcademyLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Events</h1>
          <p className="text-muted-foreground">
            Browse Vivacity's upcoming workshops, webinars, and training events.
          </p>
        </div>

        <EventsHelp />

        <AddEventEmbed />
      </div>
    </AcademyLayout>
  );
};

export default AcademyEvents;
