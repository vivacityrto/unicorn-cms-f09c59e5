import { useState, useRef, useLayoutEffect } from "react";
import {
  LayoutDashboard,
  BookOpen,
  Award,
  Calendar,
  MessageSquare,
  User,
  Users,
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

// Academy menu items
const academyMainItems = [
  { icon: LayoutDashboard, label: "Academy Dashboard", path: "/academy" },
  { icon: BookOpen, label: "My Courses", path: "/academy/courses" },
  { icon: Award, label: "Certificates", path: "/academy/certificates" },
  { icon: Calendar, label: "Events", path: "/academy/events" },
  { icon: MessageSquare, label: "Community", path: "/academy/community" },
];

const academyAccountItems = [
  { icon: User, label: "Profile", path: "/settings" },
];

const academyTeamItems = [
  { icon: Users, label: "Team Members", path: "/academy/team" },
];

export const AcademyLayout = ({
  children,
}: {
  children: React.ReactNode;
}) => {
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [sectionsOpen, setSectionsOpen] = useState({
    learning: true,
    account: false,
    team: false,
  });
  const location = useLocation();
  const { academyTier } = useTenantType();
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
        className={`flex items-center gap-3 px-4 mx-2 mb-1 transition-colors text-sm rounded-lg ${
          isActive
            ? "bg-primary/10 border border-primary/20 text-primary font-medium"
            : "text-foreground/70 hover:bg-muted hover:text-foreground"
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
          <CollapsibleTrigger className="flex items-center justify-between w-full px-4 mb-2 hover:bg-muted py-2 rounded-lg transition-colors">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
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

  return (
    <div className="min-h-screen bg-background">
      {/* Sidebar - Academy themed (lighter, learning-focused) */}
      <aside
        className={`${sidebarOpen ? "w-64" : "w-20"} bg-card border-r border-border transition-all duration-300 flex flex-col fixed left-0 top-0 h-screen z-30`}
      >
        {/* Sidebar Header */}
        {sidebarOpen ? (
          <div className="relative px-4 pt-4 pb-4 border-b border-border">
            {/* Logo and branding */}
            <div className="flex items-center gap-3">
              <div className="flex items-center justify-center h-10 w-10 rounded-xl bg-gradient-to-br from-primary to-primary/70">
                <GraduationCap className="h-5 w-5 text-primary-foreground" />
              </div>
              <div className="flex flex-col">
                <span className="font-bold text-lg text-foreground">Vivacity</span>
                <span className="text-xs text-muted-foreground">Academy</span>
              </div>
            </div>

            {/* Close button */}
            <button
              onClick={() => setSidebarOpen(!sidebarOpen)}
              className="absolute top-4 right-3 p-1.5 hover:bg-muted rounded-full transition-all duration-200 text-muted-foreground hover:text-foreground"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        ) : (
          <div className="h-16 flex items-center justify-center px-4 border-b border-border">
            <button
              onClick={() => setSidebarOpen(!sidebarOpen)}
              className="p-2 hover:bg-muted rounded-lg transition-colors text-foreground"
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
          {/* Learning Section */}
          {renderSection("Learning", academyMainItems, "learning")}

          {/* Team Section (Team & Elite only) */}
          {showTeamSection && renderSection("Team", academyTeamItems, "team")}

          {/* Account Section */}
          {renderSection("Account", academyAccountItems, "account")}
        </nav>

        {/* Bottom section */}
        <div className="p-4 border-t border-border">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Sparkles className="h-3 w-3" />
            <span>
              Academy{" "}
              {academyTier
                ? academyTier.charAt(0).toUpperCase() + academyTier.slice(1)
                : ""}
            </span>
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
    </div>
  );
};
