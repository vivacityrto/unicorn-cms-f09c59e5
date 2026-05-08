import { AcademyLayout } from "@/components/layout/AcademyLayout";
import { Card, CardContent } from "@/components/ui/card";
import { Calendar } from "lucide-react";

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

        <Card>
          <CardContent className="py-16 text-center">
            <Calendar className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
            <p className="text-base font-medium text-foreground">
              Events module coming soon
            </p>
            <p className="text-sm text-muted-foreground mt-1">
              {/* TODO: wire to events / webinars data source */}
              We're building out live events and webinars. Check back shortly.
            </p>
          </CardContent>
        </Card>
      </div>
    </AcademyLayout>
  );
};

export default AcademyEvents;
