import { CalendarPlus, Sparkles, GraduationCap, type LucideIcon } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { HomeReportingRemindersCard } from "./HomeReportingRemindersCard";
import { useClientReportingReminders } from "@/hooks/use-client-reporting-reminders";

interface ServiceCard {
  icon: LucideIcon;
  title: string;
  subtitle: string;
}

const SERVICES: ServiceCard[] = [
  {
    icon: CalendarPlus,
    title: "Upcoming events",
    subtitle: "Vivacity webinars, masterclasses, peer sessions",
  },
  {
    icon: Sparkles,
    title: "Superhero Tools Unleashed",
    subtitle: "Compliance superpowers, monthly drops",
  },
  {
    icon: GraduationCap,
    title: "Trainer PD",
    subtitle: "Professional development for your team",
  },
];

export function HomeVivacityServicesSection() {
  const { data, isLoading } = useClientReportingReminders();
  const remindersVisible = isLoading || (data && data.length > 0);

  return (
    <section>
      <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground mb-2">
        From Vivacity
      </h2>
      <div className="space-y-3">
        {remindersVisible && <HomeReportingRemindersCard />}
        <div
          className={
            remindersVisible
              ? "grid grid-cols-1 sm:grid-cols-3 gap-3"
              : "grid grid-cols-1 sm:grid-cols-3 gap-3"
          }
        >
          {SERVICES.map((s) => {
            const Icon = s.icon;
            return (
              <Card
                key={s.title}
                className="border-border hover:border-purple-300 transition-colors"
              >
                <CardContent className="p-4 flex gap-3">
                  <div className="shrink-0">
                    <div className="h-9 w-9 rounded-md bg-purple-100 flex items-center justify-center">
                      <Icon className="h-5 w-5 text-purple-600" />
                    </div>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2">
                      <h3 className="text-sm font-semibold text-foreground">
                        {s.title}
                      </h3>
                      <Badge variant="secondary" className="text-[10px] shrink-0">
                        Coming soon
                      </Badge>
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">
                      {s.subtitle}
                    </p>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      </div>
    </section>
  );
}
