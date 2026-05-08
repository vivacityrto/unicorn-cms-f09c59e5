import { AcademyLayout } from "@/components/layout/AcademyLayout";
import { AddEventEmbed } from "@/components/calendar/AddEventEmbed";

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

        <AddEventEmbed />
      </div>
    </AcademyLayout>
  );
};

export default AcademyEvents;
