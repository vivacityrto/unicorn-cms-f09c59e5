import { AddEventEmbed } from "@/components/calendar/AddEventEmbed";

export default function Calendar() {
  return (
    <div className="p-6 space-y-6 animate-fade-in">
      <div>
        <h1 className="text-3xl font-bold mb-2">Event Calendar</h1>
        <p className="text-muted-foreground">Browse Vivacity's upcoming workshops, webinars, and training events. Click 'Add to Calendar' to sync our events calendar with your own calendar app.</p>
      </div>

      <AddEventEmbed />
    </div>
  );
}
