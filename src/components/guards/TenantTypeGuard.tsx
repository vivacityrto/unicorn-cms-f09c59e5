import { Navigate, useLocation } from "react-router-dom";
import { useTenantType, TenantType } from "@/contexts/TenantTypeContext";
import { Loader2 } from "lucide-react";

interface TenantTypeGuardProps {
  children: React.ReactNode;
  allowedTypes: TenantType[];
  redirectTo?: string;
}

/**
 * TenantTypeGuard - Protects routes based on tenant type
 *
 * @param allowedTypes - Array of tenant types that can access this route
 * @param redirectTo - Where to redirect if access is denied (defaults to appropriate dashboard)
 */
export const TenantTypeGuard = ({
  children,
  allowedTypes,
  redirectTo,
}: TenantTypeGuardProps) => {
  const { tenantType, isAcademyMember, loading } = useTenantType();
  const location = useLocation();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  // If no tenant type yet, allow access (they might be mid-login)
  if (!tenantType) {
    return <>{children}</>;
  }

  // Check if current tenant type is allowed
  const isAllowed = allowedTypes.includes(tenantType);

  if (!isAllowed) {
    // Determine redirect destination
    const destination = redirectTo || (isAcademyMember ? "/academy" : "/dashboard");
    return <Navigate to={destination} replace state={{ from: location }} />;
  }

  return <>{children}</>;
};

/**
 * ComplianceOnlyGuard - Shorthand for compliance-only routes
 */
export const ComplianceOnlyGuard = ({
  children,
}: {
  children: React.ReactNode;
}) => (
  <TenantTypeGuard
    allowedTypes={["compliance_system"]}
    redirectTo="/academy"
  >
    {children}
  </TenantTypeGuard>
);

/**
 * AcademyOnlyGuard - Shorthand for academy-only routes
 */
export const AcademyOnlyGuard = ({
  children,
}: {
  children: React.ReactNode;
}) => (
  <TenantTypeGuard
    allowedTypes={["academy_solo", "academy_team", "academy_elite"]}
    redirectTo="/dashboard"
  >
    {children}
  </TenantTypeGuard>
);
