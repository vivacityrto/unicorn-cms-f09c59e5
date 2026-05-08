import { HeartHandshake } from "lucide-react";
import AudienceHubPage from "@/components/academy/AudienceHubPage";

export default function StudentSupportOfficerPage() {
  return (
    <AudienceHubPage
      audienceKey="student_support_officer"
      title="Student Support Officer"
      description="Skills to support, engage and retain VET students."
      icon={<HeartHandshake className="h-6 w-6" />}
      accentColour="#23c0dd"
    />
  );
}
