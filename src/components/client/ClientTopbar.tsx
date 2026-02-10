import { useState } from "react";
import { Link } from "react-router-dom";
import {
  HelpCircle,
  Search,
  Settings,
  LogOut,
  Bell,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
import { useNotifications } from "@/hooks/useNotifications";
import { useClientTenant } from "@/contexts/ClientTenantContext";
import { useClientActingUser } from "@/hooks/useClientActingUser";
import { useHelpCenter } from "@/components/help-center";
import vivacityLogo from "@/assets/vivacity-logo.svg";

interface ClientTopbarProps {
  isPreview: boolean;
}

export function ClientTopbar({ isPreview }: ClientTopbarProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const { profile, signOut } = useAuth();
  const { openHelpCenter } = useHelpCenter();
  const { unreadCount, notifications } = useNotifications();
  const { actingUser } = useClientActingUser();

  // Use acting user (parent account in preview mode) for avatar display
  const displayUser = actingUser || profile;

  const getInitials = () => {
    const fn = actingUser?.first_name || profile?.first_name;
    const ln = actingUser?.last_name || profile?.last_name;
    if (fn && ln) return `${fn[0]}${ln[0]}`.toUpperCase();
    return (displayUser?.email?.split("@")[0] || "U").substring(0, 2).toUpperCase();
  };

  const getUserDisplayName = () => {
    const fn = actingUser?.first_name || profile?.first_name;
    const ln = actingUser?.last_name || profile?.last_name;
    if (fn && ln) return `${fn} ${ln}`;
    return displayUser?.email?.split("@")[0] || "User";
  };

  return (
    <header
      className="h-16 bg-card border-b flex items-center justify-between px-4 md:px-6"
      style={{
        borderColor: "hsl(270 20% 88%)",
      }}
    >
      {/* Left: Vivacity logo */}
      <div className="flex items-center gap-3 min-w-0 flex-shrink-0">
        <img src={vivacityLogo} alt="Vivacity" className="h-7 w-auto" />
      </div>

      {/* Center: Search */}
      <div className="flex-1 max-w-md mx-4 hidden md:block">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search documents, resources, and notifications…"
            className="pl-9 h-9 text-sm border bg-background"
            style={{
              borderColor: "hsl(270 20% 88%)",
            }}
          />
        </div>
      </div>

      {/* Right: Notifications + Help + Profile */}
      <div className="flex items-center gap-1 flex-shrink-0 ml-2">
        {/* Help */}
        <Button
          variant="ghost"
          size="icon"
          onClick={() => openHelpCenter("chatbot")}
          className="h-9 w-9 text-muted-foreground hover:text-foreground"
        >
          <HelpCircle className="h-4 w-4" />
        </Button>

        {/* Notifications */}
        <Popover>
          <PopoverTrigger asChild>
            <Button variant="ghost" size="icon" className="h-9 w-9 relative text-muted-foreground hover:text-foreground">
              <Bell
                className={`h-4 w-4 ${unreadCount > 0 ? "animate-[bell-ring_0.5s_ease-in-out]" : ""}`}
                style={unreadCount > 0 ? { color: "hsl(330 86% 51%)" } : undefined}
              />
              {unreadCount > 0 && (
                <span
                  className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] rounded-full text-[10px] font-bold flex items-center justify-center text-white animate-pulse"
                  style={{ backgroundColor: "hsl(330 86% 51%)" }}
                >
                  {unreadCount > 99 ? "99+" : unreadCount}
                </span>
              )}
            </Button>
          </PopoverTrigger>
          <PopoverContent align="end" className="w-80 p-0">
            <div className="p-3 border-b" style={{ borderColor: "hsl(270 20% 88%)" }}>
              <h3 className="text-sm font-semibold" style={{ color: "hsl(270 55% 41%)" }}>
                Notifications
              </h3>
            </div>
            <div className="max-h-64 overflow-y-auto">
              {notifications.length === 0 ? (
                <p className="text-sm text-muted-foreground p-4 text-center">
                  No unread notifications
                </p>
              ) : (
                notifications.slice(0, 5).map((n: any) => (
                  <div key={n.id} className="px-3 py-2 border-b last:border-0 hover:bg-muted/50 transition-colors" style={{ borderColor: "hsl(270 20% 88%)" }}>
                    <p className="text-sm" style={{ color: "hsl(270 47% 26%)" }}>{n.title}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">{n.message?.slice(0, 60)}</p>
                  </div>
                ))
              )}
            </div>
            <div className="p-2 border-t" style={{ borderColor: "hsl(270 20% 88%)" }}>
              <Button variant="ghost" size="sm" className="w-full text-xs" asChild>
                <Link to="/client/notifications">View all notifications</Link>
              </Button>
            </div>
          </PopoverContent>
        </Popover>

        {/* Profile dropdown */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" className="relative h-9 w-9 rounded-full p-0 ml-1">
              <Avatar className="h-8 w-8 border-2" style={{ borderColor: "hsl(270 20% 88%)" }}>
                <AvatarImage src={actingUser?.avatar_url || profile?.avatar_url || ""} alt={getUserDisplayName()} />
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
                <p className="text-xs text-muted-foreground truncate">{displayUser?.email || profile?.email}</p>
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
