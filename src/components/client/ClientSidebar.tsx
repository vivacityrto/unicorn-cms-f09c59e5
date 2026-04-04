import { useState } from "react";
import { Link, useLocation } from "react-router-dom";
import {
  LayoutDashboard,
  FileText,
  FolderOpen,
  Library,
  Calendar,
  Bell,
  BarChart3,
  Users,
  Menu,
  X,
  MessageCircle,
  Headphones,
  Bot,
  ShieldCheck,
  CheckSquare,
  MessageSquare,
  Package2,
  Inbox,
  GraduationCap,
  ChevronDown,
} from "lucide-react";
import { useClientTenant } from "@/contexts/ClientTenantContext";
import { useAuth } from "@/hooks/useAuth";
import { useHelpCenter } from "@/components/help-center";
import { cn } from "@/lib/utils";

interface SidebarMenuItem {
  icon: React.ElementType;
  label: string;
  path: string;
  adminOnly?: boolean;
}

const clientMenuItemsBefore: SidebarMenuItem[] = [
  { icon: Inbox, label: "Inbox", path: "/client/inbox" },
  { icon: LayoutDashboard, label: "Home", path: "/client/home" },
  { icon: CheckSquare, label: "Tasks", path: "/client/tasks" },
  { icon: Package2, label: "Packages", path: "/client/packages" },
  { icon: FileText, label: "Documents", path: "/client/documents" },
  { icon: FolderOpen, label: "Files", path: "/client/files" },
];

const academySubItems: SidebarMenuItem[] = [
  { icon: GraduationCap, label: "Trainer Hub", path: "/academy/trainer" },
  { icon: GraduationCap, label: "Compliance Manager", path: "/academy/compliance-manager" },
  { icon: GraduationCap, label: "Governance Person", path: "/academy/governance-person" },
];

const clientMenuItemsAfter: SidebarMenuItem[] = [
  { icon: Library, label: "Resource Hub", path: "/client/resource-hub" },
  { icon: Calendar, label: "Calendar", path: "/client/calendar" },
  { icon: Bell, label: "Notifications", path: "/client/notifications" },
  { icon: MessageSquare, label: "Communications", path: "/client/communications" },
  { icon: BarChart3, label: "Reports", path: "/client/reports" },
  { icon: Users, label: "Team", path: "/client/team", adminOnly: true },
  { icon: ShieldCheck, label: "TGA Details", path: "/client/tga" },
];

interface ClientSidebarProps {
  sidebarOpen: boolean;
  setSidebarOpen: (open: boolean) => void;
  onOpenDocumentRequest: () => void;
}

function NavItem({ item, isActive, sidebarOpen: sOpen }: { item: SidebarMenuItem; isActive: boolean; sidebarOpen: boolean }) {
  const Icon = item.icon;
  return (
    <Link
      to={item.path}
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
  );
}

export function ClientSidebar({ sidebarOpen, setSidebarOpen, onOpenDocumentRequest }: ClientSidebarProps) {
  const location = useLocation();
  const { tenantName, isPreview, activeTenantId, academyAccessEnabled } = useClientTenant();
  const { getTenantRole, isSuperAdmin } = useAuth();
  const { openHelpCenter } = useHelpCenter();
  const isAdmin = isSuperAdmin() || (activeTenantId ? getTenantRole(activeTenantId) === "Admin" : false);

  const isAcademyActive = location.pathname === "/academy" || location.pathname.startsWith("/academy/");
  const [academyOpen, setAcademyOpen] = useState(isAcademyActive);

  const filterAdmin = (items: SidebarMenuItem[]) =>
    items.filter((item) => !item.adminOnly || isAdmin);

  return (
    <>
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
          "transition-all duration-300 flex flex-col fixed left-0 h-screen z-30",
          isPreview ? "top-12" : "top-0",
          sidebarOpen ? "w-60" : "w-16",
          "max-md:w-[85vw] max-md:max-w-72",
          !sidebarOpen && "max-md:-translate-x-full"
        )}
        style={{
          background: "linear-gradient(180deg, hsl(270 55% 41%) 0%, hsl(330 86% 51%) 100%)",
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
              <button onClick={() => setSidebarOpen(false)} className="p-1.5 rounded-full hover:bg-white/10 text-white/70 transition-colors">
                <X className="w-4 h-4" />
              </button>
            </>
          ) : (
            <button onClick={() => setSidebarOpen(true)} className="p-2 rounded-lg hover:bg-white/10 text-white/70 transition-colors mx-auto">
              <Menu className="w-5 h-5" />
            </button>
          )}
        </div>

        {/* Nav Items */}
        <nav className="flex-1 py-4 overflow-y-auto scrollbar-hide">
          {/* Items before Academy */}
          {filterAdmin(clientMenuItemsBefore).map((item) => (
            <NavItem key={item.path} item={item} isActive={location.pathname === item.path} sidebarOpen={sidebarOpen} />
          ))}

          {/* Vivacity Academy collapsible */}
          <button
            onClick={() => setAcademyOpen((prev) => !prev)}
            className={cn(
              "flex items-center gap-3 mx-2 mb-1 w-[calc(100%-16px)] transition-all text-sm rounded-lg min-h-[44px] relative",
              sidebarOpen ? "px-4" : "px-0 justify-center",
              isAcademyActive
                ? "bg-white/15 text-white font-semibold"
                : "text-white/80 hover:bg-white/10 hover:text-white"
            )}
            style={{ paddingTop: "10px", paddingBottom: "10px" }}
          >
            {isAcademyActive && (
              <div
                className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-6 rounded-r-full"
                style={{ backgroundColor: "hsl(189 74% 50%)" }}
              />
            )}
            <GraduationCap
              className="w-[18px] h-[18px] flex-shrink-0"
              style={{ color: isAcademyActive ? "hsl(189 74% 50%)" : "currentColor" }}
            />
            {sidebarOpen && (
              <>
                <span className="leading-snug flex-1 text-left">Vivacity Academy</span>
                <ChevronDown
                  className={cn("w-4 h-4 transition-transform duration-200", academyOpen && "rotate-180")}
                />
              </>
            )}
          </button>

          {/* Academy sub-items */}
          {academyOpen && sidebarOpen && (
            <div className="ml-4">
              {academySubItems.map((sub) => {
                const active = location.pathname === sub.path;
                return (
                  <Link
                    key={sub.path}
                    to={sub.path}
                    className={cn(
                      "flex items-center gap-2 mx-2 mb-0.5 transition-all text-xs rounded-lg min-h-[36px] relative pl-6",
                      active
                        ? "bg-white/15 text-white font-semibold"
                        : "text-white/70 hover:bg-white/[0.08] hover:text-white"
                    )}
                    style={{ paddingTop: "6px", paddingBottom: "6px" }}
                  >
                    {active && (
                      <div
                        className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-4 rounded-r-full"
                        style={{ backgroundColor: "hsl(189 74% 50%)" }}
                      />
                    )}
                    <span>{sub.label}</span>
                  </Link>
                );
              })}
            </div>
          )}

          {/* Items after Academy */}
          {filterAdmin(clientMenuItemsAfter).map((item) => (
            <NavItem key={item.path} item={item} isActive={location.pathname === item.path} sidebarOpen={sidebarOpen} />
          ))}
        </nav>

        {/* Footer */}
        <div className="border-t border-white/15 py-3 px-2 space-y-1">
          <button
            onClick={() => openHelpCenter("chatbot")}
            className={cn(
              "flex items-center gap-3 w-full transition-colors text-sm rounded-lg min-h-[40px] text-white/70 hover:bg-white/10 hover:text-white",
              sidebarOpen ? "px-4" : "px-0 justify-center"
            )}
          >
            <Bot className="w-[18px] h-[18px] flex-shrink-0" />
            {sidebarOpen && <span>Help</span>}
          </button>
          <button
            onClick={onOpenDocumentRequest}
            className={cn(
              "flex items-center gap-3 w-full transition-colors text-sm rounded-lg min-h-[40px] text-white/70 hover:bg-white/10 hover:text-white",
              sidebarOpen ? "px-4" : "px-0 justify-center"
            )}
          >
            <MessageCircle className="w-[18px] h-[18px] flex-shrink-0" />
            {sidebarOpen && <span>Message CSC</span>}
          </button>
          <button
            onClick={() => openHelpCenter("support")}
            className={cn(
              "flex items-center gap-3 w-full transition-colors text-sm rounded-lg min-h-[40px] text-white/70 hover:bg-white/10 hover:text-white",
              sidebarOpen ? "px-4" : "px-0 justify-center"
            )}
          >
            <Headphones className="w-[18px] h-[18px] flex-shrink-0" />
            {sidebarOpen && <span>Support</span>}
          </button>
        </div>
      </aside>
    </>
  );
}
