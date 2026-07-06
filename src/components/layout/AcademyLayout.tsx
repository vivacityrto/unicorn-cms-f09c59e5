import { useState, useRef, useLayoutEffect } from "react";
import {
  LayoutDashboard,
  BookOpen,
  Award,
  Calendar,
  MessageSquare,
  User,
  Users,
  ShieldCheck,
  Building2,
  HeartHandshake,
  ClipboardList,
  Briefcase,
  Menu,
  X,
  Sparkles,
  ChevronDown,
  ChevronRight,
  GraduationCap,
} from "lucide-react";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Link, useLocation } from "react-router-dom";
import { useTenantType } from "@/contexts/TenantTypeContext";
import { AcademyTopBar } from "@/components/layout/AcademyTopBar";
import { AcademyFooter } from "@/components/layout/AcademyFooter";
import { HelpCenterProvider, HelpCenterDrawer } from "@/components/help-center";
import { ImpersonationBanner } from "@/components/client/ImpersonationBanner";
import { useClientPreview } from "@/contexts/ClientPreviewContext";
import { ClientTenantProvider, useClientTenant } from "@/contexts/ClientTenantContext";
import { useAuth } from "@/hooks/useAuth";
import { useCurrentRelationshipRole } from "@/hooks/useCurrentRelationshipRole";
import { relationshipRoleLabel } from "@/lib/roles/relationshipRole";
import { Loader2 } from "lucide-react";

// Academy menu items
const academyPathwaysItems = [
  { icon: Users, label: "Trainer Hub", path: "/academy/trainer" },
  { icon: ShieldCheck, label: "Compliance Manager", path: "/academy/compliance-manager" },
  { icon: Building2, label: "Governance Person", path: "/academy/governance-person" },
  { icon: HeartHandshake, label: "Student Support Officer", path: "/academy/student-support-officer" },
  { icon: Briefcase, label: "Administration Assistant", path: "/academy/administration-assistant" },
];

const academyMainItems = [
  { icon: LayoutDashboard, label: "Academy Dashboard", path: "/academy" },
  { icon: BookOpen, label: "My Courses", path: "/academy/courses" },
  { icon: ClipboardList, label: "My PDP", path: "/academy/pdp" },
  { icon: Award, label: "Certificates", path: "/academy/certificates" },
  { icon: Calendar, label: "Events", path: "/academy/events" },
  { icon: MessageSquare, label: "Community", path: "/academy/community" },
];

const academyAccountItems = [
  { icon: User, label: "Profile", path: "/academy/profile" },
];

const academyTeamItems = [
  { icon: Users, label: "Team Members", path: "/academy/team" },
];

export const AcademyLayout = ({ children }: { children: React.ReactNode }) => {
  return (
    <ClientTenantProvider>
      <HelpCenterProvider>
        <AcademyLayoutInner>{children}</AcademyLayoutInner>
      </HelpCenterProvider>
    </ClientTenantProvider>
  );
};

const AcademyLayoutInner = ({
  children,
}: {
  children: React.ReactNode;
}) => {
  const { academyAccessEnabled, academyAccessLoading } = useClientTenant();
  const { signOut } = useAuth();
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [sectionsOpen, setSectionsOpen] = useState({
    pathways: true,
    learning: true,
    account: false,
    team: false,
  });
  const location = useLocation();
  const { academyTier } = useTenantType();
  const { relationshipRole } = useCurrentRelationshipRole();
  const { isPreviewMode } = useClientPreview();
  const navRef = useRef<HTMLElement>(null);

  // Show team section only for Team and Elite tiers
  const showTeamSection = academyTier === "team" || academyTier === "elite";

  // Scroll active menu item into view
  useLayoutEffect(() => {
    if (navRef.current) {
      const activeItem = navRef.current.querySelector('[data-active="true"]');
      if (activeItem) {
        requestAnimationFrame(() => {
          activeItem.scrollIntoView({ block: "center", behavior: "instant" });
        });
      }
    }
  }, [location.pathname]);

  // Render menu link
  const renderMenuItem = (item: { icon: any; label: string; path: string }) => {
    const Icon = item.icon;
    const isActive = location.pathname === item.path;
    return (
      <Link
        key={item.path}
        to={item.path}
        data-active={isActive}
        className={`flex items-center gap-3 px-4 mx-2 mb-1 transition-colors text-sm rounded-lg border-l-[3px] ${
          isActive
            ? "bg-[var(--viv-cyan-light)] text-[var(--viv-purple)] font-semibold border-[var(--viv-fuchsia)]"
            : "text-[var(--viv-acai)]/80 hover:bg-[var(--viv-purple-light)]/40 hover:text-[var(--viv-purple)] border-transparent"
        }`}
        style={{ paddingTop: "12px", paddingBottom: "12px" }}
      >
        <Icon className="w-5 h-5 flex-shrink-0" />
        {sidebarOpen && <span>{item.label}</span>}
      </Link>
    );
  };

  // Render section with collapsible header
  const renderSection = (
    title: string,
    items: { icon: any; label: string; path: string }[],
    sectionKey: keyof typeof sectionsOpen
  ) => {
    if (items.length === 0) return null;

    return (
      <Collapsible
        open={sectionsOpen[sectionKey]}
        onOpenChange={(open) =>
          setSectionsOpen((prev) => ({ ...prev, [sectionKey]: open }))
        }
        className="mt-4"
      >
        {sidebarOpen && (
          <CollapsibleTrigger className="flex items-center justify-between w-full px-4 mb-2 hover:bg-[var(--viv-purple-light)]/30 py-2 rounded-lg transition-colors">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-[var(--viv-acai)]">
              {title}
            </p>
            {sectionsOpen[sectionKey] ? (
              <ChevronDown className="w-3 h-3 text-muted-foreground" />
            ) : (
              <ChevronRight className="w-3 h-3 text-muted-foreground" />
            )}
          </CollapsibleTrigger>
        )}
        <CollapsibleContent>{items.map(renderMenuItem)}</CollapsibleContent>
      </Collapsible>
    );
  };

  if (academyAccessLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-[var(--viv-fuchsia)]" />
      </div>
    );
  }

  if (!academyAccessEnabled) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-background text-center px-6">
        <div
          className="flex items-center justify-center h-20 w-20 rounded-2xl mb-6"
          style={{ background: "linear-gradient(135deg, #7130A0, #ed1878)" }}
        >
          <GraduationCap className="h-10 w-10 text-white" />
        </div>
        <h1 className="text-2xl font-bold text-foreground mb-2">Vivacity Academy</h1>
        <p className="text-muted-foreground max-w-md">
          Your organisation's Academy access is not yet active. Contact your Vivacity consultant to get started.
        </p>
        <button
          onClick={signOut}
          className="text-sm text-muted-foreground hover:text-foreground underline-offset-4 hover:underline mt-4"
        >
          Sign out
        </button>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background academy-scope">
      {/* Impersonation Banner (fixed; spacer pushes layout down) */}
      {isPreviewMode && (
        <>
          <ImpersonationBanner />
          <div className="h-12" />
        </>
      )}
      {/* Sidebar - Academy themed (lighter, learning-focused) */}
      <aside
        className={`${sidebarOpen ? "w-64" : "w-20"} bg-card border-r border-[var(--viv-purple-light)] transition-all duration-300 flex flex-col fixed left-0 z-30 ${isPreviewMode ? "top-12 h-[calc(100vh-3rem)]" : "top-0 h-screen"}`}
      >
        {/* Sidebar Header */}
        {sidebarOpen ? (
          <div className="relative px-4 pt-4 pb-4" style={{ background: "var(--viv-grad-hero)" }}>
            {/* Logo and branding */}
            <div className="flex items-center gap-3">
              <div className="flex items-center justify-center h-10 w-10 rounded-xl bg-white/20 backdrop-blur-sm">
                <GraduationCap className="h-5 w-5 text-white" />
              </div>
              <div className="flex flex-col leading-tight">
                <span className="text-xl font-semibold text-white">Vivacity</span>
                <span className="text-xs text-white/80">Academy</span>
              </div>
            </div>

            {/* Close button */}
            <button
              onClick={() => setSidebarOpen(!sidebarOpen)}
              className="absolute top-4 right-3 p-1.5 hover:bg-white/15 rounded-full transition-all duration-200 text-white/80 hover:text-white"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        ) : (
          <div className="h-16 flex items-center justify-center px-4" style={{ background: "var(--viv-grad-hero)" }}>
            <button
              onClick={() => setSidebarOpen(!sidebarOpen)}
              className="p-2 hover:bg-white/15 rounded-lg transition-colors text-white"
            >
              <Menu className="w-5 h-5" />
            </button>
          </div>
        )}

        {/* Menu Items */}
        <nav
          ref={navRef}
          className="flex-1 py-4 overflow-y-auto scrollbar-hide"
        >
          {/* Pathways Section */}
          {renderSection("Pathways", academyPathwaysItems, "pathways")}

          {/* Learning Section */}
          {renderSection("Learning", academyMainItems, "learning")}

          {/* Team Section (Team & Elite only) */}
          {showTeamSection && renderSection("Team", academyTeamItems, "team")}

          {/* Account Section */}
          {renderSection("Account", academyAccountItems, "account")}
        </nav>

        {/* Bottom section */}
        <div className="p-4 border-t border-[var(--viv-purple-light)]">
          <div className="inline-flex items-center gap-2 text-xs px-2.5 py-1 rounded-full bg-[var(--viv-purple-light)] text-[var(--viv-fuchsia)] font-medium">
            <Sparkles className="h-3 w-3 text-[var(--viv-gold)]" />
            <span>{relationshipRoleLabel(relationshipRole)}</span>
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <div
        className={`${sidebarOpen ? "ml-64" : "ml-20"} flex flex-col min-h-screen transition-all duration-300`}
      >
        {/* Academy Top Bar */}
        <AcademyTopBar />

        {/* Page Content */}
        <main className="flex-1 p-6 overflow-y-auto">{children}</main>

        {/* Academy Footer */}
        <AcademyFooter />
      </div>
      <HelpCenterDrawer />
    </div>
  );
};
