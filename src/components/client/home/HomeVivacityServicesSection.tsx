import { CalendarPlus, Sparkles, GraduationCap, type LucideIcon } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

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
  return (
    <section>
      <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground mb-2">
        From Vivacity
      </h2>
      <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
        {SERVICES.map((s) => {
          const Icon = s.icon;
          return (
            <Card key={s.title} className="border-border hover:border-primary/50 transition-colors">
              <CardContent className="flex gap-3 p-4">
                <div className="h-9 w-9 shrink-0 rounded-md bg-primary/10 flex items-center justify-center">
                  <Icon className="h-5 w-5 text-purple-600 dark:text-purple-300" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-start justify-between gap-x-2 gap-y-1">
                    <h3 className="text-sm font-semibold text-foreground">{s.title}</h3>
                    <Badge variant="secondary" className="text-[10px] shrink-0">Coming soon</Badge>
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">{s.subtitle}</p>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </section>
  );
}
