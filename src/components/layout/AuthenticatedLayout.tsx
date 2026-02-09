import { useAuth } from "@/hooks/useAuth";
import { useTenantType } from "@/contexts/TenantTypeContext";
import { DashboardLayout } from "@/components/DashboardLayout";
import { AcademyLayout } from "@/components/layout/AcademyLayout";
import { NetworkStatusIndicator } from "@/components/NetworkStatusIndicator";
import { useDevOverflowWarning } from "@/hooks/useDevOverflowWarning";
import { Loader2 } from "lucide-react";

interface AuthenticatedLayoutProps {
  children: React.ReactNode;
}

/**
 * AuthenticatedLayout - Automatically selects the appropriate layout
 * based on the user's tenant type:
 *
 * - Vivacity Team members -> DashboardLayout (full admin interface)
 * - Compliance System members -> DashboardLayout (client compliance interface)
 * - Academy members -> AcademyLayout (learning platform interface)
 */
export const AuthenticatedLayout = ({ children }: AuthenticatedLayoutProps) => {
  const { profile, loading: authLoading } = useAuth();
  const { isAcademyMember, loading: tenantLoading } = useTenantType();

  // Dev-only: Warn about page overflow issues
  useDevOverflowWarning();

  const loading = authLoading || tenantLoading;

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  // Check if user is Vivacity Team
  const isVivacityTeam = ["Super Admin", "Team Leader", "Team Member"].includes(
    profile?.unicorn_role || ""
  );

  // Vivacity Team always uses DashboardLayout
  if (isVivacityTeam) {
    return (
      <>
        <NetworkStatusIndicator />
        <DashboardLayout>{children}</DashboardLayout>
      </>
    );
  }

  // Academy members use AcademyLayout
  if (isAcademyMember) {
    return (
      <>
        <NetworkStatusIndicator />
        <AcademyLayout>{children}</AcademyLayout>
      </>
    );
  }

  // Default to DashboardLayout (compliance members, client users)
  return (
    <>
      <NetworkStatusIndicator />
      <DashboardLayout>{children}</DashboardLayout>
    </>
  );
};
