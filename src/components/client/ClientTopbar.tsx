import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import {
  HelpCircle,
  Settings,
  LogOut,
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
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { useAuth } from "@/hooks/useAuth";
import { useClientNotifications } from "@/hooks/useClientNotifications";
import { useClientTenant } from "@/contexts/ClientTenantContext";
import { useClientActingUser } from "@/hooks/useClientActingUser";
import { useClientPreview } from "@/contexts/ClientPreviewContext";
import { useHelpCenter } from "@/components/help-center";
import vivacityLogo from "@/assets/vivacity-logo.svg";
import unicornLogo from "@/assets/unicorn-logo-login.svg";

interface ClientTopbarProps {
  isPreview: boolean;
}

export function ClientTopbar({ isPreview }: ClientTopbarProps) {
  
  const [notifFilter, setNotifFilter] = useState<string | null>(null);
  const { profile, signOut } = useAuth();
  const { openHelpCenter, canAccess: canAccessHelpCenter } = useHelpCenter();
  const { unreadCount, unreadByType, notifications, markAllAsRead, markAsRead } = useClientNotifications();
  const { activeTenantId, logoUrl } = useClientTenant();
  const { actingUser, isLoading: actingUserLoading } = useClientActingUser();
  const { actingUserId, actingUserOptions, setActingUserId } = useClientPreview();

  const [elapsedMin, setElapsedMin] = useState(0);

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

  const filteredClientNotifications = notifFilter
    ? notifications.filter((n) => n.type === notifFilter)
    : notifications;

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
      className="h-[72px] bg-card border-b flex items-center justify-between px-4 md:px-6"
      style={{
        borderColor: "hsl(270 20% 88%)",
      }}
    >
      {/* Left: Unicorn + Vivacity logos */}
      <div className="flex items-center gap-3 min-w-0 flex-shrink-0">
        <img
          src={unicornLogo}
          alt="Unicorn 2.0"
          className="h-14 w-auto flex-shrink-0"
          loading="eager"
        />
        <img
          src={vivacityLogo}
          alt="Vivacity Coaching & Consulting"
          className="h-10 w-auto flex-shrink-0"
          loading="eager"
        />
      </div>
      {/* Center: preview banner or spacer */}
      {isPreview ? (
        <div className="flex-1 flex items-center justify-center min-w-0 px-4">
          <div
            className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-xs border max-w-full"
            style={{
              backgroundColor: "hsl(270 60% 97%)",
              borderColor: "hsl(270 30% 80%)",
              color: "hsl(270 55% 41%)",
            }}
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
      <div className="flex items-center gap-1 flex-shrink-0 ml-2">
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

        {/* Notifications */}
        <Popover>
          <PopoverTrigger asChild>
            <Button variant="ghost" size="icon" className="h-9 w-9 relative text-muted-foreground hover:text-foreground">
              <Bell
                className={`h-4 w-4 ${unreadCount > 0 ? "animate-[bell-ring_0.5s_ease-in-out]" : ""}`}
                style={unreadCount > 0 ? { color: "hsl(330 86% 51%)" } : undefined}
              />
              {unreadCount > 0 && (
                <>
                  <span
                    className="absolute top-0 right-0 h-2 w-2 rounded-full"
                    style={{ backgroundColor: "hsl(0 72% 51%)" }}
                  />
                  <span
                    className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] rounded-full text-[10px] font-bold flex items-center justify-center text-white animate-pulse"
                    style={{ backgroundColor: "hsl(330 86% 51%)" }}
                  >
                    {unreadCount > 99 ? "99+" : unreadCount}
                  </span>
                </>
              )}
            </Button>
          </PopoverTrigger>
          <PopoverContent align="end" className="w-[480px] p-0">
            <div className="p-3 border-b border-border flex items-center justify-between">
              <h3 className="text-sm font-semibold text-foreground">
                Notifications
              </h3>
              {unreadCount > 0 && (
                <Button variant="ghost" size="sm" className="text-xs h-6 px-2" onClick={() => markAllAsRead()}>
                  Mark all read
                </Button>
              )}
            </div>
            {/* Type filter badges */}
            {Object.keys(unreadByType).length > 0 && (
              <div className="px-3 py-2 border-b border-border flex gap-1.5 flex-wrap bg-muted/30">
                {Object.entries(unreadByType).map(([type, count]) => (
                  <span
                    key={type}
                    className={`text-[11px] px-2 py-0.5 rounded-full capitalize cursor-pointer select-none transition-colors ${
                      notifFilter === type
                        ? 'bg-primary text-primary-foreground'
                        : 'bg-muted text-muted-foreground hover:bg-muted/80'
                    }`}
                    onClick={() => setNotifFilter(notifFilter === type ? null : type)}
                  >
                    {type.replace(/_/g, ' ')}: {count}
                  </span>
                ))}
                {notifFilter && (
                  <span
                    className="text-[11px] px-2 py-0.5 rounded-full bg-secondary text-secondary-foreground cursor-pointer select-none"
                    onClick={() => setNotifFilter(null)}
                  >
                    Clear
                  </span>
                )}
              </div>
            )}
            <div className="max-h-[480px] overflow-y-auto">
              {filteredClientNotifications.length === 0 ? (
                <p className="text-sm text-muted-foreground p-4 text-center">
                  {notifFilter ? 'No notifications of this type' : 'No notifications'}
                </p>
              ) : (
                filteredClientNotifications.slice(0, 5).map((n) => (
                  <Link
                    key={n.id}
                    to={n.link || '/client/inbox?tab=notifications'}
                    onClick={() => { if (!n.is_read) markAsRead(n.id); }}
                    className="block px-3 py-2.5 border-b last:border-0 hover:bg-muted/50 transition-colors border-border"
                  >
                    <div className="flex items-start gap-1.5">
                      <div className="flex-1 min-w-0 space-y-0.5">
                        <p className="text-sm font-medium text-foreground leading-tight">{n.title}</p>
                        <p className="text-xs text-muted-foreground line-clamp-2">
                          {(n.message || '').replace(/<[^>]*>/g, '').slice(0, 100)}
                        </p>
                        <p className="text-[10px] text-muted-foreground/60">
                          {new Date(n.created_at).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                        </p>
                      </div>
                      {!n.is_read && (
                        <span className="mt-1 h-2.5 w-2.5 rounded-full bg-destructive flex-shrink-0" />
                      )}
                    </div>
                  </Link>
                ))
              )}
            </div>
            <div className="p-2 border-t border-border">
              <Button variant="ghost" size="sm" className="w-full text-xs" asChild>
                <Link to="/client/inbox?tab=notifications">View all notifications</Link>
              </Button>
            </div>
          </PopoverContent>
        </Popover>

        {/* Tenant Logo */}
        {logoUrl && (
          <img
            src={logoUrl}
            alt="Tenant logo"
            className="h-8 w-auto rounded object-contain"
          />
        )}

        {/* Profile dropdown */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" className="relative h-9 w-9 rounded-full p-0 ml-1">
              <Avatar className="h-8 w-8 border-2" style={{ borderColor: "hsl(270 20% 88%)" }}>
                <AvatarImage src={displayUser?.avatar_url || ""} alt={getUserDisplayName()} />
                <AvatarFallback
                  className="text-xs font-semibold"
                  style={{
                    backgroundColor: "hsl(270 20% 88%)",
                    color: "hsl(270 55% 41%)",
                  }}
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
  );
}
