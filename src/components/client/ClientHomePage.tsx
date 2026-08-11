import { useMemo } from "react";
import {
  Bot,
  MessageCircle,
  FileText,
  Calendar,
  Library,
  ArrowRight,
  ShieldCheck,
  Briefcase,
  CalendarPlus,
  Mail,
} from "lucide-react";
import { differenceInMonths, format, parseISO } from "date-fns";
import { Card, CardContent } from "@/components/ui/card";
import { Button, buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useHelpCenter } from "@/components/help-center";
import { Link } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { useOpenDocumentRequest } from "@/components/layout/ClientLayout";
import { useClientActingUser } from "@/hooks/useClientActingUser";
import { useClientPreview } from "@/contexts/ClientPreviewContext";
import { useClientTenant } from "@/contexts/ClientTenantContext";
import { useClientHomeHero } from "@/hooks/use-client-home-hero";
import { useClientProgress, type ClientProgress } from "@/hooks/useClientProgress";
import { useClientHomeFeed } from "@/hooks/use-client-home-feed";
import { useClientPackageDashboards, type ClientPackageDashboardRow } from "@/hooks/use-client-package-dashboard";
import { PackageStatusPill } from "./package-dashboard/PackageStatusPill";
import { AuditReadinessCard } from "./AuditReadinessCard";
import { AuditPreparationSection } from "./AuditPreparationSection";
import { ClientAuditReportsSection } from "./ClientAuditReportsSection";
import { ClientUpcomingAuditSection } from "./ClientUpcomingAuditSection";
import { HomeNeedsAttentionSection } from "./home/HomeNeedsAttentionSection";
import { HomeComingUpSection } from "./home/HomeComingUpSection";
import { HomeVivacityServicesSection } from "./home/HomeVivacityServicesSection";
import { HomeRecentActivitySection } from "./home/HomeRecentActivitySection";

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

function getInitials(name: string): string {
  return (
    name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((p) => p.charAt(0).toUpperCase())
      .join("") || "?"
  );
}

function riskBadge(risk: ClientProgress["risk_state"]) {
  switch (risk) {
    case "on_track":
      return (
        <Badge className="bg-primary/15 text-primary hover:bg-primary/20 border-primary/20">
          On Track
        </Badge>
      );
    case "needs_attention":
      return (
        <Badge className="bg-amber-100 text-amber-800 hover:bg-amber-100 border-amber-200">
          Needs Attention
        </Badge>
      );
    case "action_required":
      return (
        <Badge className="bg-red-100 text-red-800 hover:bg-red-100 border-red-200">
          Action Required
        </Badge>
      );
    default:
      return <Badge variant="secondary">—</Badge>;
  }
}

function packageSubLine(p: ClientProgress): string {
  const total = (p.phase_completion ?? 0) === 0 && (p.steps_remaining ?? 0) === 0;
  if (total && !p.current_phase_name) {
    // Best-effort edge case: nothing set up yet
    return "Stage progress not yet set up";
  }
  if (!p.current_phase_name) {
    return `100% complete · All stages complete`;
  }
  return `${p.phase_completion}% complete · ${p.steps_remaining} stage${
    p.steps_remaining === 1 ? "" : "s"
  } remaining · Currently in ${p.current_phase_name}`;
}

// ───────── sub-components ─────────

function CSCCard({
  cscName,
  cscEmail,
  cscRoleLabel,
  cscAvatarUrl,
  hasCSC,
  onMessage,
}: {
  cscName: string | null;
  cscEmail: string | null;
  cscRoleLabel: string;
  cscAvatarUrl: string | null;
  hasCSC: boolean;
  onMessage?: () => void;
}) {
  const displayName = hasCSC ? cscName ?? "Not yet assigned" : "Not yet assigned";

  const messageBtn = (
    <Button
      variant="outline"
      size="sm"
      onClick={onMessage}
      disabled={!hasCSC}
      className={!hasCSC ? "cursor-not-allowed" : ""}
    >
      <Mail className="h-4 w-4 mr-1.5" />
      Message
    </Button>
  );
  const bookBtn = hasCSC ? (
    <Link
      to="/client/calendar"
      className={cn(buttonVariants({ variant: "outline", size: "sm" }))}
    >
      <CalendarPlus className="h-4 w-4 mr-1.5" />
      Book consult
    </Link>
  ) : (
    <Button size="sm" variant="outline" disabled className="cursor-not-allowed">
      <CalendarPlus className="h-4 w-4 mr-1.5" />
      Book consult
    </Button>
  );

  return (
    <Card>
      <CardContent className="p-5">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div className="flex items-center gap-4 min-w-0">
            <Avatar className="h-12 w-12">
              {cscAvatarUrl ? <AvatarImage src={cscAvatarUrl} alt={displayName} /> : null}
              <AvatarFallback>{getInitials(displayName)}</AvatarFallback>
            </Avatar>
            <div className="min-w-0">
              <div className="text-xs uppercase tracking-wide text-muted-foreground">
                Your {cscRoleLabel}
              </div>
              <div className="font-semibold text-foreground truncate">{displayName}</div>
              {hasCSC && cscEmail ? (
                <div className="text-xs text-muted-foreground truncate">{cscEmail}</div>
              ) : null}
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {onMessage && (
              hasCSC ? (
                messageBtn
              ) : (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span className="inline-block">{messageBtn}</span>
                  </TooltipTrigger>
                  <TooltipContent>
                    Your CSC assignment is pending — contact info@vivacity.com.au
                  </TooltipContent>
                </Tooltip>
              )
            )}
            {hasCSC ? (
              bookBtn
            ) : (
              <Tooltip>
                <TooltipTrigger asChild>
                  <span className="inline-block">{bookBtn}</span>
                </TooltipTrigger>
                <TooltipContent>
                  Your CSC assignment is pending — contact info@vivacity.com.au
                </TooltipContent>
              </Tooltip>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function AuditReadinessEmpty() {
  return (
    <Card>
      <CardContent className="p-5 flex items-center gap-3">
        <div className="h-9 w-9 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
          <ShieldCheck className="h-5 w-5 text-primary" />
        </div>
        <p className="text-sm text-muted-foreground">
          No audits yet — your CSC will set one up when it's time.
        </p>
      </CardContent>
    </Card>
  );
}

function PackagesStrip({
  rows,
  isLoading,
  statusByPackage,
}: {
  rows: ClientProgress[];
  isLoading: boolean;
  statusByPackage: Map<number, ClientPackageDashboardRow["status_pill"]>;
}) {
  return (
    <Card>
      <CardContent className="p-5 space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="font-semibold text-foreground">Your packages</h3>
        </div>
        {isLoading ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">No active packages right now.</p>
        ) : (
          <ul className="divide-y divide-border">
            {rows.map((p) => (
              <li
                key={p.package_instance_id}
                className="py-3 first:pt-0 last:pb-0 flex flex-col gap-2 md:flex-row md:items-center md:justify-between"
              >
                <div className="flex items-start gap-3 min-w-0">
                  <Briefcase className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
                  <div className="min-w-0">
                    <div className="font-medium text-foreground truncate">{p.package_name}</div>
                    <div className="text-xs text-muted-foreground">{packageSubLine(p)}</div>
                  </div>
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  {/* Same status_pill the Packages page reads, so a package
                      can't show "On Track" here and "Drifting" there. */}
                  {statusByPackage.has(p.package_instance_id) ? (
                    <PackageStatusPill status={statusByPackage.get(p.package_instance_id)!} />
                  ) : (
                    riskBadge(p.risk_state)
                  )}
                  <Link
                    to="/client/packages"
                    className="text-sm text-primary hover:underline inline-flex items-center"
                  >
                    View
                    <ArrowRight className="h-3.5 w-3.5 ml-1" />
                  </Link>
                </div>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

type QuickAction = {
  label: string;
  subtitle: string;
  icon: typeof Bot;
  onClick?: () => void;
  to?: string;
  emphasised?: boolean;
  disabled?: boolean;
  disabledTooltip?: string;
};

function QuickActionsRow({ actions }: { actions: QuickAction[] }) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
      {actions.map((a) => {
        const Icon = a.icon;
        const inner = (
          <CardContent className="p-4 flex items-start gap-3">
            <div
              className={`h-10 w-10 rounded-full flex items-center justify-center shrink-0 ${
                a.emphasised ? "bg-primary/10" : "bg-secondary/10"
              }`}
            >
              <Icon className={`h-5 w-5 ${a.emphasised ? "text-primary" : "text-secondary"}`} />
            </div>
            <div className="min-w-0">
              <div className="font-medium text-foreground">{a.label}</div>
              <div className="text-xs text-muted-foreground mt-0.5">{a.subtitle}</div>
            </div>
          </CardContent>
        );
        const cardCls = `cursor-pointer hover:border-primary/40 transition-colors ${
          a.emphasised ? "border-2 border-primary/30 bg-primary/5" : ""
        }`;
        if (a.disabled) {
          return (
            <Tooltip key={a.label}>
              <TooltipTrigger asChild>
                <Card
                  aria-disabled="true"
                  className="opacity-60 cursor-not-allowed h-full"
                >
                  {inner}
                </Card>
              </TooltipTrigger>
              <TooltipContent>{a.disabledTooltip ?? "Coming soon"}</TooltipContent>
            </Tooltip>
          );
        }
        if (a.to) {
          return (
            <Link key={a.label} to={a.to} className="block h-full">
              <Card className={`${cardCls} h-full`}>{inner}</Card>
            </Link>
          );
        }
        return (
          <Card key={a.label} onClick={a.onClick} className={`${cardCls} h-full`}>
            {inner}
          </Card>
        );
      })}
    </div>
  );
}

// ───────── page ─────────

export function ClientHomePage() {
  const { openHelpCenter, canAccess: canAccessHelpCenter } = useHelpCenter();
  const { profile } = useAuth();
  const { actingUser } = useClientActingUser();
  const { isPreviewMode } = useClientPreview();
  const { activeTenantId } = useClientTenant();
  const openDocumentRequest = useOpenDocumentRequest();

  // In preview mode with no valid acting user, do not leak staff identity.
  const displayName = actingUser?.first_name
    ?? (isPreviewMode ? "" : profile?.first_name);
  const { data: hero } = useClientHomeHero();
  const { data: progressList, isLoading: progressLoading } = useClientProgress(activeTenantId);
  const { data: packageDashboards } = useClientPackageDashboards();
  const feed = useClientHomeFeed();

  const statusByPackage = useMemo(() => {
    const map = new Map<number, ClientPackageDashboardRow["status_pill"]>();
    (packageDashboards ?? []).forEach((d) => map.set(d.package_instance_id, d.status_pill));
    return map;
  }, [packageDashboards]);

  const greeting = timeAwareGreeting();
  const tenureText = formatTenure(hero?.member_since ?? null);
  const hasCSC = !!hero?.csc_user_id;
  const showAuditEmpty = (hero?.audits_total ?? 0) === 0;
  const progressRows = progressList ?? [];

  const quickActions: QuickAction[] = [
    {
      label: "Book consult",
      subtitle: "Schedule time with your CSC",
      icon: CalendarPlus,
      to: "/client/calendar",
    },
    ...(canAccessHelpCenter
      ? [
          {
            label: "Message CSC",
            subtitle: "Quick question? Send a note",
            icon: MessageCircle,
            onClick: () => openHelpCenter("csc"),
          } as QuickAction,
        ]
      : []),
    // TODO: re-enable when document request workflow is complete
    {
      label: "Request document",
      subtitle: "Ask Vivacity to share or create",
      icon: FileText,
      disabled: true,
      disabledTooltip: "Coming soon — your CSC will reach out directly for now",
    },
    ...(canAccessHelpCenter
      ? [
          {
            label: "Ask the Chatbot",
            subtitle: "Get answers fast. Logged.",
            icon: Bot,
            onClick: () => openHelpCenter("chatbot"),
          } as QuickAction,
        ]
      : []),
  ];

  return (
    <TooltipProvider>
      <div className="space-y-8 max-w-5xl">
        {/* Hero */}
        <div>
          <h1 className="text-2xl font-bold text-secondary">
            {greeting}
            {displayName ? `, ${displayName}` : ""}
          </h1>
          <p className="text-sm text-muted-foreground mt-1">{tenureText}</p>
        </div>

        {/* CSC card */}
        <CSCCard
          cscName={hero?.csc_display_name ?? null}
          cscEmail={hero?.csc_email ?? null}
          cscRoleLabel={hero?.csc_role_label ?? "CSC"}
          cscAvatarUrl={hero?.csc_avatar_url ?? null}
          hasCSC={hasCSC}
          onMessage={canAccessHelpCenter ? () => openHelpCenter("csc") : undefined}
        />

        {/* Audit readiness — empty-state aware */}
        {showAuditEmpty ? <AuditReadinessEmpty /> : <AuditReadinessCard />}

        {/* Your packages strip */}
        <PackagesStrip rows={progressRows} isLoading={progressLoading} statusByPackage={statusByPackage} />

        {/* Quick actions */}
        <QuickActionsRow actions={quickActions} />

        {/* Needs attention — overdue tasks + urgent pinned notes (hidden when empty) */}
        <HomeNeedsAttentionSection events={feed.needsAttention} />

        {/* Coming up — task due dates within 12 weeks (hidden when empty) */}
        <HomeComingUpSection events={feed.comingUp} isLoading={feed.isLoading} />

        {/* Vivacity services — forward-looking signposts */}
        <HomeVivacityServicesSection />

        {/* Recent activity — last 30 days of cross-package events (hidden when empty) */}
        <HomeRecentActivitySection events={feed.recentActivity} isLoading={feed.isLoading} />

        {/* Upcoming Audit Schedule */}
        <ClientUpcomingAuditSection />

        {/* Audit Preparation Portal */}
        <AuditPreparationSection />

        {/* Audit Reports */}
        <ClientAuditReportsSection />

        {/* Quick links footer */}
        <div>
          <h3 className="font-semibold text-foreground mb-3">Quick links</h3>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" asChild>
              <Link to="/client/governance-documents">
                <ShieldCheck className="h-3.5 w-3.5 mr-1" /> Governance Documents
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
            {/* TODO: re-enable when document request workflow is complete */}
            <Tooltip>
              <TooltipTrigger asChild>
                <span tabIndex={0}>
                  <Button variant="outline" size="sm" disabled>
                    <FileText className="h-3.5 w-3.5 mr-1" /> Request a document
                  </Button>
                </span>
              </TooltipTrigger>
              <TooltipContent>Coming soon — your CSC will reach out directly for now</TooltipContent>
            </Tooltip>
            {canAccessHelpCenter && (
              <Button variant="outline" size="sm" onClick={() => openHelpCenter("chatbot")}>
                <Bot className="h-3.5 w-3.5 mr-1" /> Ask Chatbot
              </Button>
            )}
          </div>
        </div>
      </div>
    </TooltipProvider>
  );
}
