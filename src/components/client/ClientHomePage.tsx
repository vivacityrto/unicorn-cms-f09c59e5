import { useMemo } from "react";
import { Bot, Calendar, FileText, Library, ShieldCheck } from "lucide-react";
import { differenceInMonths, format, parseISO } from "date-fns";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { useHelpCenter } from "@/components/help-center";
import { Link } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { useClientActingUser } from "@/hooks/useClientActingUser";
import { useClientPreview } from "@/contexts/ClientPreviewContext";
import { useClientTenant } from "@/contexts/ClientTenantContext";
import { useClientHomeHero } from "@/hooks/use-client-home-hero";
import { useClientHomeFeed } from "@/hooks/use-client-home-feed";
import { useClientPackageDashboards } from "@/hooks/use-client-package-dashboard";
import { ClientUpcomingAuditSection } from "./ClientUpcomingAuditSection";
import { AuditPreparationSection } from "./AuditPreparationSection";
import { ClientAuditReportsSection } from "./ClientAuditReportsSection";
import { HomeNeedsAttentionSection } from "./home/HomeNeedsAttentionSection";
import { HomeComingUpSection } from "./home/HomeComingUpSection";
import { HomeVivacityServicesSection } from "./home/HomeVivacityServicesSection";
import { HomeRecentActivitySection } from "./home/HomeRecentActivitySection";
import { HomeHero } from "./home/HomeHero";
import { HomeKpiTiles } from "./home/HomeKpiTiles";
import { HomePackageCards } from "./home/HomePackageCards";
import { HomeSummaryCard } from "./home/HomeSummaryCard";
import { activePackages, summaryLines, totalsOf } from "./home/homeInsights";

// ───────── helpers ─────────

function timeAwareGreeting(now: Date = new Date()): string {
  const sydneyHour = Number(
    new Intl.DateTimeFormat("en-AU", {
      timeZone: "Australia/Sydney",
      hour: "numeric",
      hour12: false,
    }).format(now)
  );
  if (sydneyHour < 12) return "Good morning";
  if (sydneyHour < 17) return "Good afternoon";
  return "Good evening";
}

function formatTenure(memberSinceISO: string | null): string {
  if (!memberSinceISO) return "Member of Vivacity";
  const d = parseISO(memberSinceISO);
  const dateLabel = format(d, "d MMM yyyy");
  const months = differenceInMonths(new Date(), d);
  if (months <= 0) return `Member since ${dateLabel}`;
  if (months < 12) return `Member since ${dateLabel} · ${months} months`;
  const years = Math.floor(months / 12);
  const rem = months % 12;
  const duration =
    rem === 0
      ? `${years} year${years === 1 ? "" : "s"}`
      : `${years} year${years === 1 ? "" : "s"} ${rem} months`;
  return `Member since ${dateLabel} · ${duration}`;
}

function AuditsNote() {
  return (
    <Card>
      <CardContent className="flex items-center gap-3 p-4">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/10">
          <ShieldCheck className="h-5 w-5 text-primary" />
        </div>
        <p className="text-sm text-muted-foreground">No audits yet. Your CSC will set one up when it is time.</p>
      </CardContent>
    </Card>
  );
}

// ───────── page ─────────

export function ClientHomePage() {
  const { openHelpCenter, canAccess: canAccessHelpCenter } = useHelpCenter();
  const { profile } = useAuth();
  const { actingUser } = useClientActingUser();
  const { isPreviewMode } = useClientPreview();
  useClientTenant();

  // In preview mode with no valid acting user, do not leak staff identity.
  const displayName = actingUser?.first_name ?? (isPreviewMode ? "" : profile?.first_name);
  const { data: hero } = useClientHomeHero();
  const { data: packageDashboards, isLoading: packagesLoading } = useClientPackageDashboards();
  const feed = useClientHomeFeed();

  const packages = packageDashboards ?? [];
  const hasActive = activePackages(packages).length > 0;
  const totals = useMemo(() => (hasActive ? totalsOf(packages) : null), [packages, hasActive]);
  const lines = useMemo(() => summaryLines(packages), [packages]);
  const hasCSC = !!hero?.csc_user_id;
  const showAuditEmpty = (hero?.audits_total ?? 0) === 0;

  return (
    <TooltipProvider>
      <div className="max-w-7xl space-y-6">
        <HomeHero
          greeting={timeAwareGreeting()}
          name={displayName}
          tenure={formatTenure(hero?.member_since ?? null)}
          totals={totals}
          attentionCount={feed.needsAttention.length}
          csc={{
            name: hero?.csc_display_name ?? null,
            email: hero?.csc_email ?? null,
            roleLabel: hero?.csc_role_label ?? "CSC",
            avatarUrl: hero?.csc_avatar_url ?? null,
            assigned: hasCSC,
          }}
          onMessage={canAccessHelpCenter ? () => openHelpCenter("csc") : undefined}
          onAsk={canAccessHelpCenter ? () => openHelpCenter("chatbot") : undefined}
        />

        {totals && <HomeKpiTiles totals={totals} />}

        <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_23rem]">
          <div className="min-w-0 space-y-6">
            <HomePackageCards rows={packages} isLoading={packagesLoading} />
            <HomeRecentActivitySection events={feed.recentActivity} isLoading={feed.isLoading} />
            {!showAuditEmpty && (
              <>
                <ClientUpcomingAuditSection />
                <AuditPreparationSection />
                <ClientAuditReportsSection />
              </>
            )}
          </div>

          <aside className="min-w-0 space-y-6" aria-label="What needs you">
            <HomeSummaryCard lines={lines} />
            <HomeNeedsAttentionSection events={feed.needsAttention} />
            <HomeComingUpSection events={feed.comingUp} isLoading={feed.isLoading} />
            {showAuditEmpty && <AuditsNote />}
            <HomeVivacityServicesSection />
            <div>
              <h2 className="mb-2 text-base font-semibold text-foreground">Quick links</h2>
              <div className="flex flex-wrap gap-2">
                <Button variant="outline" size="sm" asChild>
                  <Link to="/client/governance-documents">
                    <ShieldCheck className="mr-1 h-3.5 w-3.5" /> Governance Documents
                  </Link>
                </Button>
                <Button variant="outline" size="sm" asChild>
                  <Link to="/client/calendar">
                    <Calendar className="mr-1 h-3.5 w-3.5" /> Calendar
                  </Link>
                </Button>
                <Button variant="outline" size="sm" asChild>
                  <Link to="/client/resource-hub">
                    <Library className="mr-1 h-3.5 w-3.5" /> Resource Hub
                  </Link>
                </Button>
                {/* TODO: re-enable when document request workflow is complete */}
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span tabIndex={0}>
                      <Button variant="outline" size="sm" disabled>
                        <FileText className="mr-1 h-3.5 w-3.5" /> Request a document
                      </Button>
                    </span>
                  </TooltipTrigger>
                  <TooltipContent>Coming soon. Your CSC will reach out directly for now.</TooltipContent>
                </Tooltip>
                {canAccessHelpCenter && (
                  <Button variant="outline" size="sm" onClick={() => openHelpCenter("chatbot")}>
                    <Bot className="mr-1 h-3.5 w-3.5" /> Ask Viv
                  </Button>
                )}
              </div>
            </div>
          </aside>
        </div>
      </div>
    </TooltipProvider>
  );
}
