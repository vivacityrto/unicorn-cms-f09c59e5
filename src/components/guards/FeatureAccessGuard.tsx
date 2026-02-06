import { ReactNode } from "react";
import { useTenantType, TenantType } from "@/contexts/TenantTypeContext";
import { FeatureAccessBlock } from "@/components/billing/FeatureAccessBlock";
import { Loader2 } from "lucide-react";

type FeatureType = "compliance" | "documents" | "resource_hub" | "academy";

interface FeatureAccessGuardProps {
  children: ReactNode;
  feature: FeatureType;
  featureName?: string;
  featureDescription?: string;
  icon?: ReactNode;
}

// Features and their required tenant types
const FEATURE_REQUIREMENTS: Record<FeatureType, TenantType[]> = {
  compliance: ["compliance_system"],
  documents: ["compliance_system"],
  resource_hub: ["compliance_system"],
  academy: ["academy_solo", "academy_team", "academy_elite", "compliance_system"],
};

// Default display names for features
const FEATURE_NAMES: Record<FeatureType, string> = {
  compliance: "Compliance System",
  documents: "Document Management",
  resource_hub: "Resource Hub",
  academy: "Vivacity Academy",
};

const FEATURE_DESCRIPTIONS: Record<FeatureType, string> = {
  compliance: "Access the full compliance management system with document generation, audits, and consultant support.",
  documents: "Create, manage, and share RTO compliance documents with version control and approvals.",
  resource_hub: "Access templates, guides, and best practice resources for your compliance needs.",
  academy: "Access training courses, certifications, and learning resources.",
};

/**
 * Guard component that blocks access to features based on tenant type
 * Shows an upgrade prompt for Academy tenants trying to access Compliance features
 */
export function FeatureAccessGuard({
  children,
  feature,
  featureName,
  featureDescription,
  icon,
}: FeatureAccessGuardProps) {
  const { tenantType, tenantId, loading } = useTenantType();

  if (loading) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  // If no tenant type, allow access (edge case during login)
  if (!tenantType) {
    return <>{children}</>;
  }

  // Check if the current tenant type has access
  const allowedTypes = FEATURE_REQUIREMENTS[feature];
  const hasAccess = allowedTypes.includes(tenantType);

  if (!hasAccess) {
    return (
      <FeatureAccessBlock
        featureName={featureName || FEATURE_NAMES[feature]}
        featureDescription={featureDescription || FEATURE_DESCRIPTIONS[feature]}
        tenantId={tenantId || 0}
        currentPlan={tenantType}
        icon={icon}
      />
    );
  }

  return <>{children}</>;
}

/**
 * Shorthand guards for common features
 */
export function ComplianceFeatureGuard({ children }: { children: ReactNode }) {
  return (
    <FeatureAccessGuard feature="compliance">
      {children}
    </FeatureAccessGuard>
  );
}

export function DocumentsFeatureGuard({ children }: { children: ReactNode }) {
  return (
    <FeatureAccessGuard feature="documents">
      {children}
    </FeatureAccessGuard>
  );
}

export function ResourceHubFeatureGuard({ children }: { children: ReactNode }) {
  return (
    <FeatureAccessGuard feature="resource_hub">
      {children}
    </FeatureAccessGuard>
  );
}
