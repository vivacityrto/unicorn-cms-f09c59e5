import { ClipboardList } from "lucide-react";
import AudienceHubPage from "@/components/academy/AudienceHubPage";

export default function AdministrationAssistantPage() {
  return (
    <AudienceHubPage
      audienceKey="administration_assistant"
      title="Administration Assistant"
      description="Operational excellence for administration and student-services teams."
      icon={<ClipboardList className="h-6 w-6" />}
      accentColour="#7130A0"
    />
  );
}
