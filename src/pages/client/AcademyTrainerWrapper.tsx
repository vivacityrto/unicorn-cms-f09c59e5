import { ClientLayout } from "@/components/layout/ClientLayout";
import { Users } from "lucide-react";

export default function AcademyTrainerWrapper() {
  return (
    <ClientLayout>
      <div className="space-y-6">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Users className="h-6 w-6" style={{ color: "#23c0dd" }} />
            <h1 className="text-2xl font-bold text-foreground">Trainer Hub</h1>
          </div>
          <p className="text-muted-foreground">Professional development for trainers and assessors</p>
        </div>
        <div className="text-center py-16 text-muted-foreground">
          <Users className="h-12 w-12 mx-auto mb-4 opacity-50" />
          <p>Trainer Hub content coming soon</p>
        </div>
      </div>
    </ClientLayout>
  );
}
