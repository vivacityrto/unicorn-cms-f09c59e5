import { useState } from "react";
import { Link, useLocation } from "react-router-dom";
import {
  LayoutDashboard,
  FileText,
  Library,
  Calendar,
  Bell,
  BarChart3,
  Users,
  HelpCircle,
  Menu,
  X,
  Sparkles,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
  DropdownMenuLabel,
} from "@/components/ui/dropdown-menu";
import { Badge } from "@/components/ui/badge";
import { Settings, LogOut } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { ClientTenantProvider, useClientTenant } from "@/contexts/ClientTenantContext";
import { HelpCenterProvider, HelpCenterDrawer, useHelpCenter } from "@/components/help-center";
import { ClientFooter } from "@/components/client/ClientFooter";
import { ImpersonationBanner } from "@/components/client/ImpersonationBanner";
import { FloatingChatbot } from "@/components/help-center/FloatingChatbot";
import { cn } from "@/lib/utils";

const clientMenuItems = [
  { icon: LayoutDashboard, label: "Home", path: "/client/home" },
  { icon: FileText, label: "Documents", path: "/client/documents" },
  { icon: Library, label: "Resource Hub", path: "/client/resource-hub" },
  { icon: Calendar, label: "Calendar", path: "/client/calendar" },
  { icon: Bell, label: "Notifications", path: "/client/notifications" },
  { icon: BarChart3, label: "Reports", path: "/client/reports" },
  { icon: Users, label: "Team", path: "/client/users" },
];

function ClientLayoutInner({ children }: { children: React.ReactNode }) {
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const location = useLocation();
  const { profile, signOut } = useAuth();
  const { tenantName, isPreview } = useClientTenant();
  const { openHelpCenter } = useHelpCenter();

  const getInitials = () => {
    if (profile?.first_name && profile?.last_name) {
      return `${profile.first_name[0]}${profile.last_name[0]}`.toUpperCase();
    }
    return (profile?.email?.split("@")[0] || "U").substring(0, 2).toUpperCase();
  };

  const getUserDisplayName = () => {
    if (profile?.first_name && profile?.last_name) {
      return `${profile.first_name} ${profile.last_name}`;
    }
    return profile?.email?.split("@")[0] || "User";
  };

  return (
    <div className="min-h-screen bg-background overflow-x-hidden">
      {/* Impersonation Banner */}
      {isPreview && <ImpersonationBanner />}

      {/* Mobile sidebar toggle */}
      <button
        onClick={() => setSidebarOpen(true)}
        className={`fixed top-4 left-4 z-40 p-2 rounded-lg bg-primary text-primary-foreground shadow-lg md:hidden ${sidebarOpen ? "hidden" : "flex"} items-center justify-center min-w-[44px] min-h-[44px]`}
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
          "transition-all duration-300 flex flex-col fixed left-0 h-screen z-30 bg-card border-r border-border",
          isPreview ? "top-12" : "top-0",
          sidebarOpen ? "w-60" : "w-16",
          "max-md:w-[85vw] max-md:max-w-72",
          !sidebarOpen && "max-md:-translate-x-full"
        )}
      >
        {/* Sidebar Header */}
        <div className="px-3 pt-3 pb-3 border-b border-border flex items-center justify-between">
          {sidebarOpen ? (
            <>
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <Sparkles className="h-3 w-3" />
                <span>Client Portal</span>
              </div>
              <button
                onClick={() => setSidebarOpen(false)}
                className="p-1.5 rounded-full hover:bg-muted/30 text-muted-foreground"
              >
                <X className="w-4 h-4" />
              </button>
            </>
          ) : (
            <button
              onClick={() => setSidebarOpen(true)}
              className="p-2 rounded-lg hover:bg-muted/30 text-muted-foreground"
            >
              <Menu className="w-5 h-5" />
            </button>
          )}
        </div>

        {/* Nav Items */}
        <nav className="flex-1 py-4 overflow-y-auto scrollbar-hide">
          {clientMenuItems.map((item) => {
            const Icon = item.icon;
            const isActive = location.pathname === item.path;
            return (
              <Link
                key={item.path}
                to={item.path}
                className={cn(
                  "flex items-center gap-2 px-4 mx-2 mb-1 transition-colors text-sm rounded-full min-h-[44px]",
                  isActive
                    ? "bg-muted/40 border border-border text-brand-fuchsia"
                    : "text-foreground hover:bg-muted/30 hover:text-brand-fuchsia"
                )}
                style={{ paddingTop: "10px", paddingBottom: "10px" }}
              >
                <Icon className={cn("w-4 h-4 flex-shrink-0", isActive ? "text-brand-fuchsia" : "text-secondary")} />
                {sidebarOpen && (
                  <span className="font-medium leading-snug break-words hyphens-auto">
                    {item.label}
                  </span>
                )}
              </Link>
            );
          })}
        </nav>

        {/* Bottom spacing */}
        <div className="pb-4" />
      </aside>

      {/* Main Content */}
      <div
        className={cn(
          "flex flex-col min-h-screen w-full min-w-0 transition-all duration-300 overflow-x-hidden",
          sidebarOpen ? "md:pl-60" : "md:pl-16",
          "pl-0"
        )}
      >
        {/* Top Bar */}
        <header className="h-14 bg-card border-b border-border flex items-center justify-between px-6 sticky top-0 z-20">
          {/* Left: Tenant name */}
          <div className="flex items-center gap-2 min-w-0">
            {tenantName && (
              <h1 className="text-sm font-semibold text-secondary truncate max-w-[200px]">
                {tenantName}
              </h1>
            )}
          </div>

          {/* Right: Help + Profile */}
          <div className="flex items-center gap-2 flex-shrink-0">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => openHelpCenter("chatbot")}
              className="h-9 w-9"
            >
              <HelpCircle className="h-4 w-4" />
            </Button>

            <Button variant="ghost" size="icon" className="h-9 w-9" asChild>
              <Link to="/client/notifications">
                <Bell className="h-4 w-4" />
              </Link>
            </Button>

            {/* Profile dropdown */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" className="relative h-9 w-9 rounded-full p-0">
                  <Avatar className="h-9 w-9 border-2 border-border">
                    <AvatarImage src={profile?.avatar_url || ""} alt={getUserDisplayName()} />
                    <AvatarFallback className="bg-primary/10 text-primary font-semibold text-xs">
                      {getInitials()}
                    </AvatarFallback>
                  </Avatar>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <DropdownMenuLabel className="font-normal">
                  <div className="flex flex-col space-y-1">
                    <p className="text-sm font-medium">{getUserDisplayName()}</p>
                    <p className="text-xs text-muted-foreground truncate">{profile?.email}</p>
                    <Badge variant="outline" className="w-fit text-xs">
                      {profile?.unicorn_role || "User"}
                    </Badge>
                  </div>
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem asChild>
                  <Link to="/settings?tab=profile" className="flex items-center">
                    <Settings className="mr-2 h-4 w-4" />
                    Profile Settings
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  className="text-destructive focus:text-destructive"
                  onClick={signOut}
                >
                  <LogOut className="mr-2 h-4 w-4" />
                  Sign Out
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </header>

        {/* Page Content */}
        <main className="flex-1 w-full min-w-0 p-4 md:p-6 overflow-y-auto">
          {children}
        </main>

        {/* Footer */}
        <ClientFooter />

        {/* Floating Chatbot */}
        <FloatingChatbot />
      </div>

      {/* Help Center Drawer */}
      <HelpCenterDrawer />
    </div>
  );
}

export function ClientLayout({ children }: { children: React.ReactNode }) {
  return (
    <ClientTenantProvider>
      <HelpCenterProvider>
        <ClientLayoutInner>{children}</ClientLayoutInner>
      </HelpCenterProvider>
    </ClientTenantProvider>
  );
}
