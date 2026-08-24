import { GraduationCap } from "lucide-react";
import { useClientTenant } from "@/contexts/ClientTenantContext";
import { AcademyActivityDashboard } from "@/components/client/AcademyActivityDashboard";

export default function AcademyActivityPage() {
  const { activeTenantId } = useClientTenant();
  if (!activeTenantId) return null;
  return <div className="container mx-auto space-y-6"><div><div className="flex items-center gap-2"><GraduationCap className="h-6 w-6 text-primary" /><h1 className="text-2xl font-bold">Academy Activity</h1></div><p className="mt-1 text-sm text-muted-foreground">See how your team is engaging with Vivacity Academy and where a helpful check-in may be useful.</p></div><AcademyActivityDashboard tenantId={activeTenantId} /></div>;
}
