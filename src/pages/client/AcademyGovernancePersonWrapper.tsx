import { ClientLayout } from "@/components/layout/ClientLayout";
import { Building2 } from "lucide-react";

export default function AcademyGovernancePersonWrapper() {
  return (
    <ClientLayout>
      <div className="space-y-6">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Building2 className="h-6 w-6" style={{ color: "#7130A0" }} />
            <h1 className="text-2xl font-bold text-foreground">Governance Person</h1>
          </div>
          <p className="text-muted-foreground">Board obligations, strategic governance, and business management</p>
        </div>
        <div className="text-center py-16 text-muted-foreground">
          <Building2 className="h-12 w-12 mx-auto mb-4 opacity-50" />
          <p>Governance Person content coming soon</p>
        </div>
      </div>
    </ClientLayout>
  );
}
