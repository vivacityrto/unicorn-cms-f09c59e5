import { ClientLayout } from "@/components/layout/ClientLayout";
import { ShieldCheck } from "lucide-react";

export default function AcademyComplianceManagerWrapper() {
  return (
    <ClientLayout>
      <div className="space-y-6">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <ShieldCheck className="h-6 w-6" style={{ color: "#ed1878" }} />
            <h1 className="text-2xl font-bold text-foreground">Compliance Manager</h1>
          </div>
          <p className="text-muted-foreground">Standards, audits, quality assurance, and regulatory compliance</p>
        </div>
        <div className="text-center py-16 text-muted-foreground">
          <ShieldCheck className="h-12 w-12 mx-auto mb-4 opacity-50" />
          <p>Compliance Manager content coming soon</p>
        </div>
      </div>
    </ClientLayout>
  );
}
