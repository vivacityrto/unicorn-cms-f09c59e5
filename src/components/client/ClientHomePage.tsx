import { Bot, MessageCircle, Headphones, FileText, Calendar, Library, ArrowRight, ShieldCheck } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useHelpCenter } from "@/components/help-center";
import { Link } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { useOpenDocumentRequest } from "@/components/layout/ClientLayout";
import { useClientActingUser } from "@/hooks/useClientActingUser";
import { useClientTenant } from "@/contexts/ClientTenantContext";
import { ClientProgressSummary } from "./ClientProgressSummary";
import { ProgressAnchors } from "@/components/compliance/ProgressAnchors";
import { MomentumBanner } from "@/components/dashboard/MomentumBanner";
import { useMomentumState } from "@/hooks/useMomentumState";

export function ClientHomePage() {
  const { openHelpCenter } = useHelpCenter();
  const { profile } = useAuth();
  const { actingUser } = useClientActingUser();
  const { activeTenantId } = useClientTenant();
  const openDocumentRequest = useOpenDocumentRequest();

  const displayName = actingUser?.first_name || profile?.first_name;
  const { data: momentumStates } = useMomentumState(activeTenantId);
  const primaryMomentum = momentumStates?.[0] ?? null;

  return (
    <div className="space-y-8 max-w-5xl">
      {/* Welcome */}
      <div>
        <h1 className="text-2xl font-bold text-secondary">
          Welcome{displayName ? `, ${displayName}` : ""}
        </h1>
        <p className="text-muted-foreground mt-1">What do you need today?</p>
      </div>

      {/* Progress Summary */}
      <ClientProgressSummary tenantId={activeTenantId} />

      {/* Momentum Banner (client variant) */}
      {primaryMomentum && (
        <MomentumBanner state={primaryMomentum} variant="client" />
      )}

      {/* Progress Anchors */}
      <ProgressAnchors tenantId={activeTenantId} variant="client" />

      {/* Row 1: What do you need? */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Chatbot - Primary */}
        <Card className="border-2 border-primary/30 bg-primary/5 hover:border-primary/50 transition-colors">
          <CardContent className="p-5 flex flex-col items-start gap-3">
            <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center">
              <Bot className="h-5 w-5 text-primary" />
            </div>
            <div>
              <h3 className="font-semibold text-foreground">Ask the Chatbot</h3>
              <p className="text-sm text-muted-foreground mt-1">
                Get answers fast. Logged to your account.
              </p>
            </div>
            <Button onClick={() => openHelpCenter("chatbot")} className="mt-auto w-full">
              Ask now
            </Button>
          </CardContent>
        </Card>

        {/* Request a document - replaces Message CSC */}
        <Card className="hover:border-secondary/30 transition-colors">
          <CardContent className="p-5 flex flex-col items-start gap-3">
            <div className="h-10 w-10 rounded-full bg-secondary/10 flex items-center justify-center">
              <FileText className="h-5 w-5 text-secondary" />
            </div>
            <div>
              <h3 className="font-semibold text-foreground">Request a document</h3>
              <p className="text-sm text-muted-foreground mt-1">
                Ask Vivacity to share or create a document. Logged to your account.
              </p>
            </div>
            <Button variant="outline" onClick={() => openDocumentRequest()} className="mt-auto w-full">
              Create request
            </Button>
          </CardContent>
        </Card>

        {/* Support - Secondary */}
        <Card className="hover:border-secondary/30 transition-colors">
          <CardContent className="p-5 flex flex-col items-start gap-3">
            <div className="h-10 w-10 rounded-full bg-secondary/10 flex items-center justify-center">
              <Headphones className="h-5 w-5 text-secondary" />
            </div>
            <div>
              <h3 className="font-semibold text-foreground">Support</h3>
              <p className="text-sm text-muted-foreground mt-1">
                For technical issues and access help.
              </p>
            </div>
            <Button variant="outline" onClick={() => openHelpCenter("support")} className="mt-auto w-full">
              Contact support
            </Button>
          </CardContent>
        </Card>
      </div>

      {/* Row 2: Your next items */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card>
          <CardContent className="p-5">
            <h3 className="font-semibold text-foreground mb-3">Upcoming reminders</h3>
            <p className="text-sm text-muted-foreground py-6 text-center">
              No upcoming reminders in the next 14 days.
            </p>
            <Button variant="outline" size="sm" asChild className="w-full">
              <Link to="/client/calendar">
                Open calendar <ArrowRight className="h-3.5 w-3.5 ml-1" />
              </Link>
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-5">
            <h3 className="font-semibold text-foreground mb-3">Unread notifications</h3>
            <p className="text-sm text-muted-foreground py-6 text-center">
              You're all caught up.
            </p>
            <Button variant="outline" size="sm" asChild className="w-full">
              <Link to="/client/notifications">
                View all notifications <ArrowRight className="h-3.5 w-3.5 ml-1" />
              </Link>
            </Button>
          </CardContent>
        </Card>
      </div>

      {/* Row 3: Quick links */}
      <div>
        <h3 className="font-semibold text-foreground mb-3">Quick links</h3>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" asChild>
            <Link to="/client/documents">
              <FileText className="h-3.5 w-3.5 mr-1" /> Documents
            </Link>
          </Button>
          <Button variant="outline" size="sm" asChild>
            <Link to="/client/calendar">
              <Calendar className="h-3.5 w-3.5 mr-1" /> Calendar
            </Link>
          </Button>
          <Button variant="outline" size="sm" asChild>
            <Link to="/client/resource-hub">
              <Library className="h-3.5 w-3.5 mr-1" /> Resource Hub
            </Link>
          </Button>
          <Button variant="outline" size="sm" asChild>
            <Link to="/client/documents?tab=governance">
              <ShieldCheck className="h-3.5 w-3.5 mr-1" /> Governance Register
            </Link>
          </Button>
          <Button variant="outline" size="sm" onClick={() => openDocumentRequest()}>
            <FileText className="h-3.5 w-3.5 mr-1" /> Request a document
          </Button>
          <Button variant="outline" size="sm" onClick={() => openHelpCenter("chatbot")}>
            <Bot className="h-3.5 w-3.5 mr-1" /> Ask Chatbot
          </Button>
        </div>
      </div>
    </div>
  );
}
