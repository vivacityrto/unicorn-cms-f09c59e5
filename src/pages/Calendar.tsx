import { useEffect } from 'react';

export default function Calendar() {
  useEffect(() => {
    // Load AddEvent script
    const script = document.createElement('script');
    script.src = 'https://cdn.addevent.com/libs/stc/1.0.2/stc.min.js';
    script.async = true;
    script.defer = true;
    document.body.appendChild(script);

    // Load calendar embed script
    const calScript = document.createElement('script');
    calScript.type = 'text/javascript';
    calScript.async = true;
    calScript.src = 'https://cdn.addevent.com/libs/cal/js/cal.embed.t1.init.js';
    calScript.className = 'ae-emd-script';
    document.body.appendChild(calScript);

    return () => {
      // Cleanup scripts on unmount
      if (script.parentNode) script.parentNode.removeChild(script);
      if (calScript.parentNode) calScript.parentNode.removeChild(calScript);
    };
  }, []);

  return (
    <div className="p-6 space-y-6 animate-fade-in">
      <div>
        <h1 className="text-3xl font-bold mb-2">Event Calendar</h1>
        <p className="text-muted-foreground">Browse Vivacity's upcoming workshops, webinars, and training events. Click 'Add to Calendar' to sync our events calendar with your own calendar app.</p>
      </div>

      <div className="space-y-4">
        <div className="flex gap-4">
          <a
            title="Add to Calendar"
            className="addeventstc"
            data-id="DE347781"
            href="https://www.addevent.com/calendar/DE347781"
            target="_blank"
            rel="nofollow noopener"
          >
            Add to Calendar
          </a>
          <a
            title="Vivacity Calendar"
            href="https://www.vivacity.training/wp-content/uploads/2023/11/Vivacity-Calendar-2024.pdf"
            target="_blank"
            rel="noopener"
          >
            Download PDF to Print
          </a>
        </div>

        <div
          className="ae-emd-cal"
          data-calendar="DE347781"
          data-calendars="DE347781"
          data-calendars-selected="DE347781"
          data-configure="true"
          data-title=""
          data-title-show="true"
          data-today="true"
          data-datenav="true"
          data-date="true"
          data-monthweektoggle="true"
          data-subscribebtn="true"
          data-swimonth="true"
          data-swiweek="true"
          data-swischedule="true"
          data-print="true"
          data-timezone="true"
          data-defaultview="month"
          data-firstday="1"
          data-datetimeformat="1"
        />
      </div>
    </div>
  );
}
