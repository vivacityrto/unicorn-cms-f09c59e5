import { differenceInMonths, format, parseISO } from "date-fns";
import { useHelpCenter } from "@/components/help-center";
import { useAuth } from "@/hooks/useAuth";
import { useClientActingUser } from "@/hooks/useClientActingUser";
import { useClientPreview } from "@/contexts/ClientPreviewContext";
import { useClientTenant } from "@/contexts/ClientTenantContext";
import { useClientHomeHero } from "@/hooks/use-client-home-hero";
import { useClientHomeFeed } from "@/hooks/use-client-home-feed";
import { useClientPackageDashboards } from "@/hooks/use-client-package-dashboard";
import { useClientReportingReminders } from "@/hooks/use-client-reporting-reminders";
import { ClientUpcomingAuditSection } from "./ClientUpcomingAuditSection";
import { AuditPreparationSection } from "./AuditPreparationSection";
import { ClientAuditReportsSection } from "./ClientAuditReportsSection";
import { HomeAcademyCard } from "./home/HomeAcademyCard";
import { HomeReportingRemindersCard } from "./home/HomeReportingRemindersCard";
import { HomeMessagesCard, HomeRegulatoryCard } from "./home/HomeUpdatesCards";
import { ClientHomeView } from "./ClientHomeView";

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

// ───────── page ─────────

export function ClientHomePage() {
  const { openHelpCenter, canAccess: canAccessHelpCenter } = useHelpCenter();
  const { profile } = useAuth();
  const { actingUser } = useClientActingUser();
  const { isPreviewMode } = useClientPreview();
  const { activeTenantId } = useClientTenant();

  // In preview mode with no valid acting user, do not leak staff identity.
  const displayName = actingUser?.first_name ?? (isPreviewMode ? "" : profile?.first_name);
  const { data: hero } = useClientHomeHero();
  const { data: packageDashboards, isLoading: packagesLoading } = useClientPackageDashboards();
  const feed = useClientHomeFeed();
  const { data: reminders, isLoading: remindersLoading } = useClientReportingReminders();
  const showAudits = (hero?.audits_total ?? 0) > 0;

  return (
    <ClientHomeView
      greeting={timeAwareGreeting()}
      name={displayName}
      tenure={formatTenure(hero?.member_since ?? null)}
      csc={{
        name: hero?.csc_display_name ?? null,
        email: hero?.csc_email ?? null,
        roleLabel: hero?.csc_role_label ?? "CSC",
        avatarUrl: hero?.csc_avatar_url ?? null,
        assigned: !!hero?.csc_user_id,
      }}
      packages={packageDashboards ?? []}
      packagesLoading={packagesLoading}
      feed={feed}
      showAuditsNote={!showAudits}
      canAccessHelpCenter={canAccessHelpCenter}
      onMessage={canAccessHelpCenter ? () => openHelpCenter("csc") : undefined}
      onAsk={canAccessHelpCenter ? () => openHelpCenter("chatbot") : undefined}
      academy={<HomeAcademyCard tenantId={activeTenantId} />}
      regulatory={<HomeRegulatoryCard />}
      messages={<HomeMessagesCard />}
      reminders={remindersLoading || (reminders && reminders.length > 0) ? <HomeReportingRemindersCard /> : null}
      audits={
        showAudits ? (
          <>
            <ClientUpcomingAuditSection />
            <AuditPreparationSection />
            <ClientAuditReportsSection />
          </>
        ) : null
      }
    />
  );
}
