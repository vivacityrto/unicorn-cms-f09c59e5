import { useState, useEffect, useMemo, useRef } from "react";
import { useTheme } from "next-themes";
import { cn } from "@/lib/utils";
import { useCondensedHeader } from "@/hooks/useCondensedHeader";
import { Link, useNavigate } from "react-router-dom";
import { NotificationsDrawer } from "@/components/notifications/NotificationsDrawer";
import type { DrawerItem } from "@/components/notifications/drawerModel";
import {
  HelpCircle,
  Moon,
  Sun,
  Settings,
  LogOut,
  Download,
  Bell,
  Eye,
  ChevronDown,
  Check,
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
import { useAuth } from "@/hooks/useAuth";
import { useClientNotifications } from "@/hooks/useClientNotifications";
import { useClientTenant } from "@/contexts/ClientTenantContext";
import { useClientActingUser } from "@/hooks/useClientActingUser";
import { useClientPreview } from "@/contexts/ClientPreviewContext";
import { useHelpCenter } from "@/components/help-center";
import { InstallAppDialog } from "@/components/layout/InstallAppDialog";
import vivacityLogo from "@/assets/vivacity-logo.svg";
import unicornLogo from "@/assets/unicorn-logo-login.svg";
import unicornMark from "@/assets/unicorn-mark.png";
import vivacityMark from "@/assets/vivacity-mark.png";

interface ClientTopbarProps {
  isPreview: boolean;
}

/** Light/dark switch. The choice is remembered in this browser. */
function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme();
  const isDark = resolvedTheme === "dark";
  const label = isDark ? "Switch to light mode" : "Switch to dark mode";
  return (
    <Button
      variant="ghost"
      size="icon"
      onClick={() => setTheme(isDark ? "light" : "dark")}
      aria-label={label}
      title={label}
      className="h-9 w-9 text-muted-foreground hover:text-foreground"
    >
      {isDark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
    </Button>
  );
}

export function ClientTopbar({ isPreview }: ClientTopbarProps) {
  
  const [notifOpen, setNotifOpen] = useState(false);
  const bellRef = useRef<HTMLButtonElement>(null);
  const navigate = useNavigate();
  const { profile, signOut } = useAuth();
  const { openHelpCenter, canAccess: canAccessHelpCenter } = useHelpCenter();
  const { unreadCount, unreadByType, notifications, markAllAsRead, markAsRead } = useClientNotifications();
  const { activeTenantId, logoUrl } = useClientTenant();
  const { actingUser, isLoading: actingUserLoading } = useClientActingUser();
  const { actingUserId, actingUserOptions, setActingUserId } = useClientPreview();

  const [elapsedMin, setElapsedMin] = useState(0);
  const [installOpen, setInstallOpen] = useState(false);
  const condensed = useCondensedHeader();

  useEffect(() => {
    if (!isPreview) return;
    const compute = () => {
      try {
        const raw = sessionStorage.getItem("client_preview_session");
        if (!raw) return;
        const parsed = JSON.parse(raw);
        if (!parsed?.startedAt) return;
        const min = Math.floor((Date.now() - Date.parse(parsed.startedAt)) / 60000);
        setElapsedMin(min < 0 ? 0 : min);
      } catch {
        /* noop */
      }
    };
    compute();
    const id = window.setInterval(compute, 60000);
    return () => window.clearInterval(id);
  }, [isPreview]);

  const activeOption = actingUserOptions.find((o) => o.user_uuid === actingUserId);
  const activeUserName = activeOption?.full_name ?? actingUser?.first_name ?? "Client";
  const elapsedLabel =
    elapsedMin < 1 ? "< 1 min" : elapsedMin < 60 ? `${elapsedMin} min` : `${Math.floor(elapsedMin / 60)}h ${elapsedMin % 60}m`;

  const drawerItems = useMemo<DrawerItem[]>(
    () => notifications.map((n) => ({ id: n.id, type: n.type, title: n.title, message: n.message, isRead: n.is_read, createdAt: n.created_at })),
    [notifications],
  );

  // In preview/impersonation mode, always show the parent account — never fall back to the SuperAdmin profile
  const displayUser = isPreview ? actingUser : (actingUser || profile);

  const getInitials = () => {
    const fn = displayUser?.first_name;
    const ln = displayUser?.last_name;
    if (fn && ln) return `${fn[0]}${ln[0]}`.toUpperCase();
    return (displayUser?.email?.split("@")[0] || "U").substring(0, 2).toUpperCase();
  };

  const getUserDisplayName = () => {
    const fn = displayUser?.first_name;
    const ln = displayUser?.last_name;
    if (fn && ln) return `${fn} ${ln}`;
    return displayUser?.email?.split("@")[0] || "User";
  };

  return (
    <header
      data-condensed={condensed}
      className={cn(
        // In staff preview the fixed impersonation banner (3rem, same as the layout spacer) sits above, so pin below it.
        isPreview ? "top-12" : "top-0",
        "group/topbar sticky z-20 flex items-center justify-between border-b border-border px-4 md:px-6",
        // Pinned, and quieter once you scroll: shorter and slightly see-through so it stays out of the way.
        "transition-[height,background-color,box-shadow] duration-200 motion-reduce:transition-none",
        condensed ? "h-11 bg-card/90 shadow-sm backdrop-blur supports-[backdrop-filter]:bg-card/80" : "h-[4.5rem] bg-card",
      )}
    >
      {/* Left: Unicorn + Vivacity logos */}
      <div className="flex items-center gap-3 min-w-0 flex-shrink-0">
        <img
          src={condensed ? unicornMark : unicornLogo}
          alt="Unicorn 2.0"
          className={cn("flex-shrink-0 transition-all duration-200 motion-reduce:transition-none", condensed ? "h-8 w-8 object-contain" : "h-14 w-auto")}
          loading="eager"
        />
        <img
          src={condensed ? vivacityMark : vivacityLogo}
          alt="Vivacity Coaching & Consulting"
          className={cn("flex-shrink-0 transition-all duration-200 motion-reduce:transition-none", condensed ? "h-8 w-8 object-contain" : "h-10 w-auto")}
          loading="eager"
        />
      </div>
      {/* Center: preview banner or spacer */}
      {isPreview ? (
        <div className="flex-1 flex items-center justify-center min-w-0 px-4">
          <div
            className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-xs border max-w-full"
            style={{ backgroundColor: "hsl(var(--muted))", borderColor: "hsl(var(--border))", color: "hsl(var(--foreground))" }}
          >
            <Eye className="h-3.5 w-3.5 flex-shrink-0" />
            <span className="text-muted-foreground">Viewing as</span>
            {actingUserOptions.length > 1 ? (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button
                    type="button"
                    className="inline-flex items-center gap-1 font-semibold hover:underline focus:outline-none"
                  >
                    <span className="truncate max-w-[180px]">{activeUserName}</span>
                    <ChevronDown className="h-3 w-3 flex-shrink-0" />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="center" className="w-64">
                  <DropdownMenuLabel>Switch viewing as</DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  {actingUserOptions.map((opt) => (
                    <DropdownMenuItem
                      key={opt.user_uuid}
                      onClick={() => setActingUserId(opt.user_uuid)}
                      className="flex items-center justify-between gap-2"
                    >
                      <span className="truncate">{opt.full_name}</span>
                      {opt.user_uuid === actingUserId && (
                        <Check className="h-3.5 w-3.5 flex-shrink-0 text-muted-foreground" />
                      )}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            ) : (
              <span className="font-semibold truncate max-w-[180px]">{activeUserName}</span>
            )}
            <span className="text-muted-foreground">·</span>
            <span className="text-muted-foreground whitespace-nowrap">{elapsedLabel}</span>
          </div>
        </div>
      ) : (
        <div className="flex-1" />
      )}


      {/* Right: Notifications + Help + Profile */}
      <div className="topbar-actions flex items-center gap-1 flex-shrink-0 ml-2">
        {/* Help — gated to primary/secondary contacts */}
        {canAccessHelpCenter && (
          <Button
            variant="ghost"
            size="icon"
            onClick={() => openHelpCenter("chatbot")}
            className="h-9 w-9 text-muted-foreground hover:text-foreground"
          >
            <HelpCircle className="h-4 w-4" />
          </Button>
        )}

        <ThemeToggle />

        {/* Notifications */}
        <Button
          ref={bellRef}
          variant="ghost"
          size="icon"
          className="h-9 w-9 relative text-muted-foreground hover:text-foreground"
          aria-label={unreadCount > 0 ? `Notifications, ${unreadCount} unread` : "Notifications"}
          aria-haspopup="dialog"
          onClick={() => setNotifOpen(true)}
        >
          <Bell
            className={`h-4 w-4 ${unreadCount > 0 ? "animate-[bell-ring_0.5s_ease-in-out]" : ""}`}
            style={unreadCount > 0 ? { color: "hsl(330 86% 51%)" } : undefined}
          />
          {unreadCount > 0 && (
            <span
              className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] rounded-full text-[10px] font-bold flex items-center justify-center text-white"
              style={{ backgroundColor: "hsl(330 86% 51%)" }}
            >
              {unreadCount > 99 ? "99+" : unreadCount}
            </span>
          )}
        </Button>
        <NotificationsDrawer
          open={notifOpen}
          onOpenChange={setNotifOpen}
          returnFocusTo={bellRef}
          items={drawerItems}
          onOpenItem={(id) => {
            const n = notifications.find((x) => x.id === id);
            if (!n) return;
            if (!n.is_read) markAsRead(n.id);
            navigate(n.link || "/client/inbox?tab=notifications");
          }}
          onMarkRead={markAsRead}
          onMarkAllRead={markAllAsRead}
          onViewAll={() => navigate("/client/inbox?tab=notifications")}
        />

        {/* Tenant Logo */}
        {logoUrl && (
          <img
            src={logoUrl}
            alt="Tenant logo"
            className={cn("w-auto rounded object-contain transition-all", condensed ? "h-6" : "h-8")}
          />
        )}

        {/* Profile dropdown */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" className="relative h-9 w-9 rounded-full p-0 ml-1">
              <Avatar className="h-8 w-8 border-2 border-border transition-all group-data-[condensed=true]/topbar:h-6 group-data-[condensed=true]/topbar:w-6">
                <AvatarImage src={displayUser?.avatar_url || ""} alt={getUserDisplayName()} />
                <AvatarFallback
                  className="text-xs font-semibold"
                  style={{ backgroundColor: "hsl(var(--muted))", color: "hsl(var(--foreground))" }}
                >
                  {getInitials()}
                </AvatarFallback>
              </Avatar>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <DropdownMenuLabel className="font-normal">
              <div className="flex flex-col space-y-1">
                <p className="text-sm font-medium">{getUserDisplayName()}</p>
                <p className="text-xs text-muted-foreground truncate">{displayUser?.email || (isPreview ? "" : profile?.email)}</p>
              </div>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem asChild>
              <Link to="/client/profile" className="flex items-center">
                <Settings className="mr-2 h-4 w-4" />
                Profile Settings
              </Link>
            </DropdownMenuItem>
            <DropdownMenuItem className="cursor-pointer" onSelect={() => setInstallOpen(true)}>
              <Download className="mr-2 h-4 w-4" />
              Install Unicorn app
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
      <InstallAppDialog open={installOpen} onOpenChange={setInstallOpen} />
    </header>
  );
}
