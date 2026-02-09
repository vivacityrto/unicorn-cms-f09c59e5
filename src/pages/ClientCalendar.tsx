import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Calendar, Bell } from "lucide-react";
import { AddEventEmbed } from "@/components/calendar/AddEventEmbed";
import { ClientRemindersCalendar } from "@/components/client/ClientRemindersCalendar";

export default function ClientCalendar() {
  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h1 className="text-3xl font-bold mb-2">Calendar</h1>
        <p className="text-muted-foreground">
          View upcoming events, tasks, meetings, and reminders.
        </p>
      </div>

      <Tabs defaultValue="events" className="w-full">
        <TabsList>
          <TabsTrigger value="events" className="gap-2">
            <Calendar className="h-4 w-4" />
            Events
          </TabsTrigger>
          <TabsTrigger value="reminders" className="gap-2">
            <Bell className="h-4 w-4" />
            My Reminders
          </TabsTrigger>
        </TabsList>

        <TabsContent value="events" className="mt-4">
          <AddEventEmbed />
        </TabsContent>

        <TabsContent value="reminders" className="mt-4">
          <ClientRemindersCalendar />
        </TabsContent>
      </Tabs>
    </div>
  );
}
