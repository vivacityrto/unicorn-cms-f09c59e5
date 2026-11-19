import { RailTip, SIDEBAR_GRADIENT } from "@/components/layout/sidebarKit";
import { Link, useLocation } from "react-router-dom";
import {
  LayoutDashboard,
  FolderOpen,
  Library,
  Calendar,
  // Bell removed — Notifications consolidated into Inbox
  BarChart3,
  Users,
  Menu,
  X,
  MessageCircle,
  Headphones,
  Bot,
  ShieldCheck,
  Shield,
  CheckSquare,
  // MessageSquare removed — Communications consolidated into Inbox
  Package2,
  Inbox,
  GraduationCap,
  ExternalLink,
  LifeBuoy,
  ScrollText,
  Award,
  Globe,
  Activity,
  Pin,
  PinOff,
} from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useClientTenant } from "@/contexts/ClientTenantContext";
import { useAuth } from "@/hooks/useAuth";
import { useHelpCenter } from "@/components/help-center";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

interface SidebarMenuItem {
  icon: React.ElementType;
  label: string;
  /** One short line, shown in the floating label when the sidebar is collapsed to icons. */
  description: string;
  path: string;
  adminOnly?: boolean;
}

const clientMenuItemsBefore: SidebarMenuItem[] = [
  { icon: Inbox, label: "Inbox", description: "Messages and notifications", path: "/client/inbox" },
  { icon: LayoutDashboard, label: "Home", description: "Your overview", path: "/client/home" },
  { icon: CheckSquare, label: "Tasks", description: "What needs doing", path: "/client/tasks" },
  { icon: Package2, label: "Packages", description: "Your packages and progress", path: "/client/packages" },
  { icon: ScrollText, label: "Governance Documents", description: "Policies and governance records", path: "/client/governance-documents", adminOnly: true },
  { icon: FolderOpen, label: "Files", description: "Documents shared with you", path: "/client/files" },
];

// Embedded Academy submenu removed 2026-05-08 — canonical Academy now lives at
// /academy/* under AcademyLayout, opened in a new tab from the row below.

const clientMenuItemsAfter: SidebarMenuItem[] = [
  { icon: Library, label: "Resource Hub", description: "Guides and templates", path: "/client/resource-hub" },
  { icon: Calendar, label: "Calendar", description: "Meetings and due dates", path: "/client/calendar" },
  { icon: BarChart3, label: "Reports", description: "Your compliance reports", path: "/client/reports" },
  { icon: Globe, label: "Regulatory Updates", description: "Changes from the regulators", path: "/client/regulatory-updates" },
  { icon: LifeBuoy, label: "Support Tickets", description: "Get help from the team", path: "/client/support-tickets" },
  { icon: Users, label: "Users", description: "Who can use the portal", path: "/client/users", adminOnly: true },
  { icon: GraduationCap, label: "Staff PDPs", description: "Staff development plans", path: "/client/staff-pdps", adminOnly: true },
  { icon: Activity, label: "Academy Activity", description: "Training progress", path: "/client/academy-activity", adminOnly: true },
  { icon: ShieldCheck, label: "TGA Details", description: "Your registration details", path: "/client/tga" },
  { icon: Award, label: "Membership Certificate", description: "Your certificate", path: "/client/certificate" },
];

interface ClientSidebarProps {
  sidebarOpen: boolean;
  setSidebarOpen: (open: boolean) => void;
  /** Whether the menu starts open, and how to change that. Omitted where there is no such setting. */
  defaultOpen?: boolean;
  setDefaultOpen?: (open: boolean) => void;
}

/** The pin in the open sidebar's header: pinned means the menu starts open every time, unpinned means it starts as icons. */
function StartOpenPin({ pinned, onChange }: { pinned: boolean; onChange: (open: boolean) => void }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          aria-pressed={pinned}
          aria-label="Start with the menu open"
          onClick={() => onChange(!pinned)}
          className={cn(
            'p-1.5 rounded-full transition-colors hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70',
            pinned ? 'bg-white/20 text-white' : 'text-white/70',
          )}
        >
          {pinned ? <Pin className="w-4 h-4" /> : <PinOff className="w-4 h-4" />}
        </button>
      </TooltipTrigger>
      <TooltipContent side="bottom" className="max-w-[16rem] rounded-xl border-border bg-popover px-3 py-2 shadow-lg">
        <p className="text-[13px] font-semibold leading-tight text-foreground">{pinned ? 'Menu starts open' : 'Menu starts as icons'}</p>
        <p className="mt-0.5 text-xs leading-snug text-muted-foreground">
          {pinned ? 'Press to start with icons only.' : 'Press to always start with the full menu open.'}
        </p>
      </TooltipContent>
    </Tooltip>
  );
}

function NavItem({ item, isActive, sidebarOpen: sOpen }: { item: SidebarMenuItem; isActive: boolean; sidebarOpen: boolean }) {
  const Icon = item.icon;
  return (
    <RailTip show={!sOpen} label={item.label} description={item.description}>
    <Link
      to={item.path}
      aria-label={sOpen ? undefined : item.label}
      className={cn(
        "flex items-center gap-3 mx-2 mb-1 transition-all text-sm rounded-lg min-h-[44px] relative",
        sOpen ? "px-4" : "px-0 justify-center",
        isActive
          ? "bg-white/15 text-white font-semibold"
          : "text-white/80 hover:bg-white/10 hover:text-white"
      )}
      style={{ paddingTop: "10px", paddingBottom: "10px" }}
    >
      {isActive && (
        <div
          className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-6 rounded-r-full"
          style={{ backgroundColor: "hsl(189 74% 50%)" }}
        />
      )}
      <Icon
        className="w-[18px] h-[18px] flex-shrink-0"
        style={{ color: isActive ? "hsl(189 74% 50%)" : "currentColor" }}
      />
      {sOpen && <span className="leading-snug break-words hyphens-auto">{item.label}</span>}
    </Link>
    </RailTip>
  );
}

export function ClientSidebar({ sidebarOpen, setSidebarOpen, defaultOpen = false, setDefaultOpen }: ClientSidebarProps) {
  const location = useLocation();
  const {
    tenantName,
    isPreview,
    academyAccessEnabled,
    canManagePortalUsers,
    activeTenantId,
  } = useClientTenant();
  const { isSuperAdmin } = useAuth();
  const { openHelpCenter, canAccess: canAccessHelpCenter } = useHelpCenter();
  // Staff in preview retain full sidebar; otherwise use tenant_user-derived gate.
  const canManageUsers = isSuperAdmin() || isPreview || canManagePortalUsers;

  const { data: complyhubData } = useQuery({
    queryKey: ["client-sidebar-complyhub-url", activeTenantId],
    queryFn: async () => {
      const { data } = await supabase
        .from("tenants")
        .select("complyhub_url")
        .eq("id", activeTenantId!)
        .single();
      return data;
    },
    enabled: !!activeTenantId,
    staleTime: 5 * 60 * 1000,
  });

  const complyhubUrl = complyhubData?.complyhub_url?.trim();

  const filterAdmin = (items: SidebarMenuItem[]) =>
    items.filter((item) => !item.adminOnly || canManageUsers);

  return (
    <TooltipProvider delayDuration={120}>
      {/* Mobile sidebar toggle */}
      <button
        onClick={() => setSidebarOpen(true)}
        className={`fixed top-4 left-4 z-40 p-2 rounded-lg bg-white/20 text-white shadow-lg md:hidden ${sidebarOpen ? "hidden" : "flex"} items-center justify-center min-w-[44px] min-h-[44px]`}
        aria-label="Open sidebar"
      >
        <Menu className="w-5 h-5" />
      </button>

      {/* Mobile overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-20 md:hidden"
          onClick={() => setSidebarOpen(false)}
          aria-hidden="true"
        />
      )}

      {/* Left Sidebar */}
      <aside
        className={cn(
          "sidebar-motion flex flex-col fixed left-0 z-30",
          isPreview ? "top-12 h-[calc(100vh-3rem)]" : "top-0 h-screen",
          sidebarOpen ? "w-60" : "w-16",
          "max-md:w-[85vw] max-md:max-w-72",
          !sidebarOpen && "max-md:-translate-x-full"
        )}
        style={{
          background: SIDEBAR_GRADIENT,
        }}
      >
        {/* Header */}
        <div className="px-3 pt-4 pb-3 border-b border-white/15 flex items-center justify-between">
          {sidebarOpen ? (
            <>
              <div className="flex flex-col gap-0.5">
                <span className="text-xs font-medium text-white/60 uppercase tracking-wider">Client Portal</span>
                {tenantName && (
                  <span className="text-sm font-semibold text-white truncate max-w-[160px]">{tenantName}</span>
                )}
              </div>
              <div className="flex items-center gap-0.5">
                {setDefaultOpen && <StartOpenPin pinned={defaultOpen} onChange={setDefaultOpen} />}
                <button onClick={() => setSidebarOpen(false)} aria-label="Close the menu" className="p-1.5 rounded-full hover:bg-white/10 text-white/70 transition-colors">
                  <X className="w-4 h-4" />
                </button>
              </div>
            </>
          ) : (
            <RailTip show label="Open the menu" description="Show the full menu with names">
              <button onClick={() => setSidebarOpen(true)} aria-label="Open the menu" className="p-2 rounded-lg hover:bg-white/10 text-white/70 transition-colors mx-auto">
                <Menu className="w-5 h-5" />
              </button>
            </RailTip>
          )}
        </div>

        {/* Nav Items */}
        <nav className="flex-1 py-4 overflow-y-auto scrollbar-hide">
          {/* Items before Academy */}
          {filterAdmin(clientMenuItemsBefore).map((item) => (
            <NavItem key={item.path} item={item} isActive={location.pathname === item.path} sidebarOpen={sidebarOpen} />
          ))}

          {/* Vivacity Academy — opens canonical Academy app in a new tab */}
          {academyAccessEnabled && (
            <RailTip show={!sidebarOpen} label="Vivacity Academy" description="Training and courses (opens in a new tab)">
            <a
              href="/academy"
              aria-label={sidebarOpen ? undefined : "Vivacity Academy, opens in a new tab"}
              target="_blank"
              rel="noopener noreferrer"
              className={cn(
                "flex items-center gap-3 mx-2 mb-1 transition-all text-sm rounded-lg min-h-[44px] relative text-white/80 hover:bg-white/10 hover:text-white",
                sidebarOpen ? "px-4" : "px-0 justify-center",
              )}
              style={{ paddingTop: "10px", paddingBottom: "10px" }}
            >
              <span
                className="w-[22px] h-[22px] rounded-md flex items-center justify-center flex-shrink-0"
                style={{ background: "linear-gradient(135deg, #7130A0, #ED1878)" }}
              >
                <GraduationCap className="w-3.5 h-3.5 text-white" />
              </span>
              {sidebarOpen && (
                <>
                  <span className="leading-snug flex-1">Vivacity Academy</span>
                  <ExternalLink className="w-3.5 h-3.5 text-white/60 flex-shrink-0" aria-hidden="true" />
                </>
              )}
            </a>
            </RailTip>
          )}

          {/* ComplyHub — opens external ComplyHub URL for this tenant */}
          {complyhubUrl && (
            <RailTip show={!sidebarOpen} label="ComplyHub" description="Your compliance platform (opens in a new tab)">
            <a
              href={complyhubUrl}
              aria-label={sidebarOpen ? undefined : "ComplyHub, opens in a new tab"}
              target="_blank"
              rel="noopener noreferrer"
              className={cn(
                "flex items-center gap-3 mx-2 mb-1 transition-all text-sm rounded-lg min-h-[44px] relative text-white/80 hover:bg-white/10 hover:text-white",
                sidebarOpen ? "px-4" : "px-0 justify-center",
              )}
              style={{ paddingTop: "10px", paddingBottom: "10px" }}
            >
              <span
                className="w-[22px] h-[22px] rounded-md flex items-center justify-center flex-shrink-0"
                style={{ background: "linear-gradient(135deg, #7130A0, #ED1878)" }}
              >
                <Shield className="w-3.5 h-3.5 text-white" />
              </span>
              {sidebarOpen && (
                <>
                  <span className="leading-snug flex-1">ComplyHub</span>
                  <ExternalLink className="w-3.5 h-3.5 text-white/60 flex-shrink-0" aria-hidden="true" />
                </>
              )}
            </a>
            </RailTip>
          )}



          {/* Items after Academy */}
          {filterAdmin(clientMenuItemsAfter).map((item) => {
            const isActive = item.path === "/client/support-tickets"
              ? location.pathname.startsWith("/client/support-tickets")
              : location.pathname === item.path;
            return <NavItem key={item.path} item={item} isActive={isActive} sidebarOpen={sidebarOpen} />;
          })}
        </nav>

        {/* Footer — Help Center entries gated to primary/secondary contacts */}
        {canAccessHelpCenter && (
          <div className="border-t border-white/15 py-3 px-2 space-y-1">
            <RailTip show={!sidebarOpen} label="Ask Viv" description="Your assistant for questions about your account">
              <button
                onClick={() => openHelpCenter("chatbot")}
                aria-label={sidebarOpen ? undefined : "Ask Viv"}
                className={cn(
                  "flex items-center gap-3 w-full transition-colors text-sm rounded-lg min-h-[40px] text-white/70 hover:bg-white/10 hover:text-white",
                  sidebarOpen ? "px-4" : "px-0 justify-center"
                )}
              >
                <Bot className="w-[18px] h-[18px] flex-shrink-0" />
                {sidebarOpen && <span>Help</span>}
              </button>
            </RailTip>
            <RailTip show={!sidebarOpen} label="Message your consultant" description="Send your consultant a message">
              <button
                onClick={() => openHelpCenter("csc")}
                aria-label={sidebarOpen ? undefined : "Message your consultant"}
                className={cn(
                  "flex items-center gap-3 w-full transition-colors text-sm rounded-lg min-h-[40px] text-white/70 hover:bg-white/10 hover:text-white",
                  sidebarOpen ? "px-4" : "px-0 justify-center"
                )}
              >
                <MessageCircle className="w-[18px] h-[18px] flex-shrink-0" />
                {sidebarOpen && <span>Message CSC</span>}
              </button>
            </RailTip>
            <RailTip show={!sidebarOpen} label="Contact support" description="Ask the Vivacity team for help">
              <button
                onClick={() => openHelpCenter("support")}
                aria-label={sidebarOpen ? undefined : "Contact support"}
                className={cn(
                  "flex items-center gap-3 w-full transition-colors text-sm rounded-lg min-h-[40px] text-white/70 hover:bg-white/10 hover:text-white",
                  sidebarOpen ? "px-4" : "px-0 justify-center"
                )}
              >
                <Headphones className="w-[18px] h-[18px] flex-shrink-0" />
                {sidebarOpen && <span>Support</span>}
              </button>
            </RailTip>
          </div>
        )}
      </aside>
    </TooltipProvider>
  );
}
