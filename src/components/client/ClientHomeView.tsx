import { useMemo, type ReactNode } from "react";
import { Bot, Calendar, FileText, Library, ShieldCheck } from "lucide-react";
import { Link } from "react-router-dom";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import type { HomeFeedRow } from "@/hooks/use-client-home-feed";
import { HomeNeedsAttentionSection } from "./home/HomeNeedsAttentionSection";
import { HomeComingUpSection } from "./home/HomeComingUpSection";
import { HomeVivacityServicesSection } from "./home/HomeVivacityServicesSection";
import { HomeRecentActivitySection } from "./home/HomeRecentActivitySection";
import { HomeHero } from "./home/HomeHero";
import { HomeKpiTiles } from "./home/HomeKpiTiles";
import { HomePackageCards } from "./home/HomePackageCards";
import { HomeSummaryCard } from "./home/HomeSummaryCard";
import { activePackages, summaryLines, totalsOf, type HomePackage } from "./home/homeInsights";

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

export interface ClientHomeViewProps {
  greeting: string;
  name: string | null | undefined;
  tenure: string;
  csc: { name: string | null; email: string | null; roleLabel: string; avatarUrl: string | null; assigned: boolean };
  packages: readonly HomePackage[];
  packagesLoading: boolean;
  feed: { comingUp: HomeFeedRow[]; needsAttention: HomeFeedRow[]; recentActivity: HomeFeedRow[]; isLoading: boolean };
  showAuditsNote: boolean;
  canAccessHelpCenter: boolean;
  onMessage?: () => void;
  onAsk?: () => void;
  /** Slots for the sections that load their own data. */
  academy?: ReactNode;
  regulatory?: ReactNode;
  messages?: ReactNode;
  reminders?: ReactNode;
  audits?: ReactNode;
}

/**
 * The Home layout. It fills the width the portal gives it (the same width as the status banner above it), with the
 * packages and learning on the left and what needs you on the right. Full-width rows sit underneath so no column
 * is left holding a gap.
 */
export function ClientHomeView(p: ClientHomeViewProps) {
  const hasActive = activePackages(p.packages).length > 0;
  const totals = useMemo(() => (hasActive ? totalsOf(p.packages) : null), [p.packages, hasActive]);
  const lines = useMemo(() => summaryLines(p.packages), [p.packages]);

  return (
    <TooltipProvider>
      <div className="w-full min-w-0 space-y-6">
        <HomeHero
          greeting={p.greeting}
          name={p.name}
          tenure={p.tenure}
          totals={totals}
          attentionCount={p.feed.needsAttention.length}
          csc={p.csc}
          onMessage={p.onMessage}
          onAsk={p.onAsk}
        />

        {totals && <HomeKpiTiles totals={totals} />}

        <div className="grid gap-6 xl:grid-cols-[minmax(0,2fr)_minmax(20rem,1fr)]">
          <div className="min-w-0 space-y-6">
            <HomePackageCards rows={p.packages} isLoading={p.packagesLoading} />
            {p.academy}
            {p.regulatory}
            <HomeRecentActivitySection events={p.feed.recentActivity} isLoading={p.feed.isLoading} />
            {/* What Vivacity has sent and what is coming due, side by side and compact, inside this column under
                Recent activity. If only one has anything to show it takes the full width. */}
            {(p.messages || p.reminders) && (
              <div className="grid items-stretch gap-4 lg:grid-cols-2 lg:[&>*:only-child]:col-span-2">
                {p.messages}
                {p.reminders}
              </div>
            )}
            {p.audits}
          </div>

          <aside className="min-w-0 space-y-6" aria-label="What needs you">
            <HomeSummaryCard lines={lines} />
            <HomeNeedsAttentionSection events={p.feed.needsAttention} />
            <HomeComingUpSection events={p.feed.comingUp} isLoading={p.feed.isLoading} />
            {p.showAuditsNote && <AuditsNote />}
          </aside>
        </div>

        <HomeVivacityServicesSection />

        <div>
          <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-muted-foreground">Quick links</h2>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" asChild>
              <Link to="/client/governance-documents"><ShieldCheck className="mr-1 h-3.5 w-3.5" /> Governance Documents</Link>
            </Button>
            <Button variant="outline" size="sm" asChild>
              <Link to="/client/calendar"><Calendar className="mr-1 h-3.5 w-3.5" /> Calendar</Link>
            </Button>
            <Button variant="outline" size="sm" asChild>
              <Link to="/client/resource-hub"><Library className="mr-1 h-3.5 w-3.5" /> Resource Hub</Link>
            </Button>
            {/* TODO: re-enable when document request workflow is complete */}
            <Tooltip>
              <TooltipTrigger asChild>
                <span tabIndex={0}>
                  <Button variant="outline" size="sm" disabled><FileText className="mr-1 h-3.5 w-3.5" /> Request a document</Button>
                </span>
              </TooltipTrigger>
              <TooltipContent>Coming soon. Your CSC will reach out directly for now.</TooltipContent>
            </Tooltip>
            {p.canAccessHelpCenter && (
              <Button variant="outline" size="sm" onClick={p.onAsk}><Bot className="mr-1 h-3.5 w-3.5" /> Ask Viv</Button>
            )}
          </div>
        </div>
      </div>
    </TooltipProvider>
  );
}
