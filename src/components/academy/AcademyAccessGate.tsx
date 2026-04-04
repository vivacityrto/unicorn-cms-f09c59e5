import type { ReactNode } from "react";
import { useClientTenant } from "@/contexts/ClientTenantContext";
import { GraduationCap, MessageCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useHelpCenter } from "@/components/help-center";

interface AcademyAccessGateProps {
  children: ReactNode;
}

/**
 * Wraps Academy pages. If the tenant's academy_access_enabled is false,
 * renders an "Access Required" screen instead of the page content.
 */
export default function AcademyAccessGate({ children }: AcademyAccessGateProps) {
  const { academyAccessEnabled } = useClientTenant();
  const { openHelpCenter } = useHelpCenter();

  if (!academyAccessEnabled) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] text-center px-6">
        <div
          className="flex items-center justify-center h-20 w-20 rounded-2xl mb-6"
          style={{
            background: "linear-gradient(135deg, #7130A0, #ed1878)",
          }}
        >
          <GraduationCap className="h-10 w-10 text-white" />
        </div>
        <h1 className="text-2xl font-bold text-foreground mb-2">Vivacity Academy</h1>
        <p className="text-muted-foreground max-w-md mb-6">
          Your organisation's Academy access is not yet active. Contact your Vivacity consultant to get started.
        </p>
        <Button
          onClick={() => openHelpCenter("chatbot")}
          className="gap-2"
          style={{ backgroundColor: "#ed1878" }}
        >
          <MessageCircle className="h-4 w-4" />
          Message CSC
        </Button>
      </div>
    );
  }

  return <>{children}</>;
}
