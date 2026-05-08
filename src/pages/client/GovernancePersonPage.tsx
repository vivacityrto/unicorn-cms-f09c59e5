import { Building2, FileText, ArrowRight } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import AudienceHubPage from "@/components/academy/AudienceHubPage";

const ACCENT = "#7130A0";

const resources = [
  "Governing Persons Obligations Checklist (SRTO 2025)",
  "RTO Strategic Plan Template",
  "Board Meeting Agenda and Minutes Template",
];

export default function GovernancePersonPage() {
  return (
    <AudienceHubPage
      audienceKey="governance_person"
      title="Governance Person"
      description="Strategic leadership and governance for RTO Governing Persons."
      icon={<Building2 className="h-6 w-6" />}
      accentColour={ACCENT}
      extras={
        <div className="space-y-3 pt-4">
          <h2 className="text-lg font-semibold text-foreground">Governance Toolkit</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {resources.map((title) => (
              <Card key={title} className="hover:shadow-md transition-shadow cursor-pointer">
                <CardContent className="py-4 px-5 flex items-center gap-3">
                  <div
                    className="h-9 w-9 rounded-lg flex items-center justify-center flex-shrink-0"
                    style={{ backgroundColor: `${ACCENT}15` }}
                  >
                    <FileText className="h-4 w-4" style={{ color: ACCENT }} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-foreground truncate">{title}</p>
                  </div>
                  <span
                    className="text-xs font-medium flex items-center gap-0.5 flex-shrink-0"
                    style={{ color: ACCENT }}
                  >
                    View <ArrowRight className="h-3 w-3" />
                  </span>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      }
    />
  );
}
