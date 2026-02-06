import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Lock, ArrowUpRight, Sparkles } from "lucide-react";
import { UpgradeModal } from "./UpgradeModal";
import type { TenantType } from "@/contexts/TenantTypeContext";

interface FeatureAccessBlockProps {
  featureName: string;
  featureDescription: string;
  tenantId: number;
  currentPlan: TenantType;
  icon?: React.ReactNode;
}

/**
 * Full-page block shown when an Academy tenant tries to access a Compliance-only feature
 */
export function FeatureAccessBlock({
  featureName,
  featureDescription,
  tenantId,
  currentPlan,
  icon,
}: FeatureAccessBlockProps) {
  const [upgradeModalOpen, setUpgradeModalOpen] = useState(false);

  return (
    <>
      <div className="min-h-[60vh] flex items-center justify-center p-6">
        <Card className="max-w-md w-full text-center">
          <CardHeader className="pb-4">
            <div className="mx-auto mb-4 h-16 w-16 rounded-full bg-muted flex items-center justify-center">
              {icon || <Lock className="h-8 w-8 text-muted-foreground" />}
            </div>
            <CardTitle className="text-xl">{featureName}</CardTitle>
            <CardDescription>{featureDescription}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="rounded-lg bg-primary/5 border border-primary/20 p-4 text-sm">
              <div className="flex items-center justify-center gap-2 text-primary font-medium mb-2">
                <Sparkles className="h-4 w-4" />
                Compliance System Feature
              </div>
              <p className="text-muted-foreground">
                This feature is available with the Compliance System subscription.
                Upgrade to unlock full access to document management, resource hub, and more.
              </p>
            </div>

            <Button 
              onClick={() => setUpgradeModalOpen(true)} 
              className="w-full"
            >
              Upgrade to Compliance System
              <ArrowUpRight className="h-4 w-4 ml-2" />
            </Button>

            <p className="text-xs text-muted-foreground">
              Need help? Contact our team to learn more about the Compliance System.
            </p>
          </CardContent>
        </Card>
      </div>

      <UpgradeModal
        open={upgradeModalOpen}
        onOpenChange={setUpgradeModalOpen}
        tenantId={tenantId}
        currentPlan={currentPlan}
        triggerType="feature_access_attempt"
        triggerContext={`feature:${featureName.toLowerCase().replace(/\s+/g, "_")}`}
      />
    </>
  );
}
