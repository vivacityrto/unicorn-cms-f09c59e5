import { AcademyLayout } from "@/components/layout/AcademyLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Calendar, Clock, MapPin, Users, Video } from "lucide-react";

const events = [
  {
    id: 1,
    title: "RTO Compliance Webinar",
    description: "Live Q&A session on the latest ASQA requirements and compliance updates.",
    date: "2024-03-15",
    time: "2:00 PM AEDT",
    type: "webinar",
    attendees: 45,
    registered: true,
  },
  {
    id: 2,
    title: "Quality Assurance Workshop",
    description: "Hands-on workshop covering internal audit techniques and quality processes.",
    date: "2024-03-20",
    time: "10:00 AM AEDT",
    type: "workshop",
    attendees: 28,
    registered: true,
  },
  {
    id: 3,
    title: "Monthly Community Meetup",
    description: "Connect with other RTO professionals and share best practices.",
    date: "2024-03-25",
    time: "3:00 PM AEDT",
    type: "meetup",
    attendees: 62,
    registered: false,
  },
];

const AcademyEvents = () => {
  return (
    <AcademyLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Events</h1>
          <p className="text-muted-foreground">
            Webinars, workshops, and community events
          </p>
        </div>

        <div className="space-y-4">
          {events.map((event) => (
            <Card key={event.id}>
              <CardContent className="flex items-start gap-6 p-6">
                {/* Date Badge */}
                <div className="text-center min-w-[60px]">
                  <div className="bg-primary/10 rounded-lg p-3">
                    <div className="text-2xl font-bold text-primary">
                      {new Date(event.date).getDate()}
                    </div>
                    <div className="text-xs text-muted-foreground uppercase">
                      {new Date(event.date).toLocaleString("default", {
                        month: "short",
                      })}
                    </div>
                  </div>
                </div>

                {/* Event Details */}
                <div className="flex-1">
                  <div className="flex items-start justify-between">
                    <div>
                      <h3 className="font-semibold text-lg">{event.title}</h3>
                      <p className="text-sm text-muted-foreground mt-1">
                        {event.description}
                      </p>
                    </div>
                    <Badge
                      variant={
                        event.type === "webinar"
                          ? "default"
                          : event.type === "workshop"
                          ? "secondary"
                          : "outline"
                      }
                    >
                      {event.type}
                    </Badge>
                  </div>

                  <div className="flex items-center gap-4 mt-4 text-sm text-muted-foreground">
                    <span className="flex items-center gap-1">
                      <Clock className="h-4 w-4" />
                      {event.time}
                    </span>
                    <span className="flex items-center gap-1">
                      <Video className="h-4 w-4" />
                      Online
                    </span>
                    <span className="flex items-center gap-1">
                      <Users className="h-4 w-4" />
                      {event.attendees} attending
                    </span>
                  </div>
                </div>

                {/* Action */}
                <Button variant={event.registered ? "outline" : "default"}>
                  {event.registered ? "Registered" : "Register"}
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </AcademyLayout>
  );
};

export default AcademyEvents;
