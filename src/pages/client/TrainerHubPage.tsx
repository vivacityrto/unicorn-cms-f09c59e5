import { Users } from "lucide-react";
import AudienceHubPage from "@/components/academy/AudienceHubPage";

export default function TrainerHubPage() {
  return (
    <AudienceHubPage
      audienceKey="trainer"
      title="Trainer Hub"
      description="Professional development for trainers and assessors in the VET sector."
      icon={<Users className="h-6 w-6" />}
      accentColour="#23c0dd"
    />
  );
}
