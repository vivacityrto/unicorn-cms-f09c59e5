import { useState } from "react";
import { useLocation, Link } from "react-router-dom";
import {
  Bell,
  Settings,
  User,
  LogOut,
  Clock,
  Calendar,
  Search,
  ChevronRight,
  GraduationCap,
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
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/hooks/useAuth";
import { useTenantType } from "@/contexts/TenantTypeContext";
import { NotificationDropdown } from "@/components/NotificationDropdown";

// Academy route titles
const academyRouteTitles: Record<string, string> = {
  "/academy": "Academy Dashboard",
  "/academy/courses": "My Courses",
  "/academy/certificates": "Certificates",
  "/academy/events": "Events",
  "/academy/community": "Community",
  "/academy/team": "Team Members",
  "/academy/settings": "Settings",
  "/settings": "Profile Settings",
};

// Breadcrumb generation
const getBreadcrumbs = (pathname: string) => {
  const segments = pathname.split("/").filter(Boolean);
  const breadcrumbs: { label: string; path: string }[] = [];

  let currentPath = "";
  segments.forEach((segment) => {
    currentPath += `/${segment}`;
    const title =
      academyRouteTitles[currentPath] ||
      segment.charAt(0).toUpperCase() + segment.slice(1).replace(/-/g, " ");
    breadcrumbs.push({
      label: title,
      path: currentPath,
    });
  });

  return breadcrumbs;
};

export function AcademyTopBar() {
  const location = useLocation();
  const { profile, signOut } = useAuth();
  const { academyTier } = useTenantType();
  const [searchQuery, setSearchQuery] = useState("");

  const pageTitle = academyRouteTitles[location.pathname] || "Academy";
  const breadcrumbs = getBreadcrumbs(location.pathname);
  const showBreadcrumbs = breadcrumbs.length > 1;

  const getTierLabel = () => {
    switch (academyTier) {
      case "solo":
        return "Solo";
      case "team":
        return "Team";
      case "elite":
        return "Elite";
      default:
        return "Academy";
    }
  };

  const getInitials = (email: string) => {
    if (profile?.first_name && profile?.last_name) {
      return `${profile.first_name[0]}${profile.last_name[0]}`.toUpperCase();
    }
    return email.split("@")[0].substring(0, 2).toUpperCase();
  };

  const getUserDisplayName = () => {
    if (profile?.first_name && profile?.last_name) {
      return `${profile.first_name} ${profile.last_name}`;
    }
    return profile?.email?.split("@")[0] || "User";
  };

  return (
    <header className="h-16 bg-card border-b border-border flex items-center justify-between px-6 sticky top-0 z-20">
      {/* Left: Logo, Page Title & Breadcrumbs */}
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-2">
          <div className="flex items-center justify-center h-8 w-8 rounded-lg bg-gradient-to-br from-primary to-primary/70">
            <GraduationCap className="h-4 w-4 text-primary-foreground" />
          </div>
          <span className="font-bold text-lg text-foreground">Academy</span>
        </div>

        <div className="h-8 w-px bg-border" />

        <div className="flex flex-col">
          {showBreadcrumbs && (
            <nav className="flex items-center gap-1 text-xs text-muted-foreground">
              {breadcrumbs.slice(0, -1).map((crumb) => (
                <span key={crumb.path} className="flex items-center gap-1">
                  <Link
                    to={crumb.path}
                    className="hover:text-foreground transition-colors"
                  >
                    {crumb.label}
                  </Link>
                  <ChevronRight className="h-3 w-3" />
                </span>
              ))}
            </nav>
          )}
          <h1 className="text-lg font-semibold text-foreground truncate max-w-[300px]">
            {pageTitle}
          </h1>
        </div>
      </div>

      {/* Center: Course Search */}
      <div className="flex-1 max-w-md mx-8">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search courses..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10 bg-muted/50"
          />
        </div>
      </div>

      {/* Right: Actions & Avatar */}
      <div className="flex items-center gap-2">
        <TooltipProvider>
          {/* Notifications */}
          <Tooltip>
            <TooltipTrigger asChild>
              <div>
                <NotificationDropdown />
              </div>
            </TooltipTrigger>
            <TooltipContent>
              <p>Notifications</p>
            </TooltipContent>
          </Tooltip>

          {/* Settings */}
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                asChild
                className="group transition-all duration-200 hover:scale-105"
              >
                <Link to="/settings">
                  <Settings className="h-5 w-5 text-muted-foreground group-hover:text-foreground transition-colors" />
                </Link>
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              <p>Settings</p>
            </TooltipContent>
          </Tooltip>

          {/* User Avatar Dropdown */}
          <DropdownMenu>
            <Tooltip>
              <TooltipTrigger asChild>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="ghost"
                    className="relative h-10 w-10 rounded-full p-0 hover:ring-2 hover:ring-primary/20 transition-all"
                  >
                    <Avatar className="h-10 w-10 border-2 border-border">
                      <AvatarImage
                        src={profile?.avatar_url || ""}
                        alt={getUserDisplayName()}
                        className="object-cover"
                      />
                      <AvatarFallback className="bg-primary/10 text-primary font-semibold">
                        {getInitials(profile?.email || "U")}
                      </AvatarFallback>
                    </Avatar>
                    {/* Online indicator */}
                    <span className="absolute bottom-0 right-0 h-3 w-3 rounded-full border-2 border-card bg-[hsl(var(--success,142_76%_36%))]" />
                  </Button>
                </DropdownMenuTrigger>
              </TooltipTrigger>
              <TooltipContent>
                <p>Account menu</p>
              </TooltipContent>
            </Tooltip>
            <DropdownMenuContent align="end" className="w-64 bg-popover z-50">
              {/* User Info Header */}
              <DropdownMenuLabel className="font-normal">
                <div className="flex flex-col space-y-2">
                  <p className="text-sm font-medium leading-none">
                    {getUserDisplayName()}
                  </p>
                  <p className="text-xs text-muted-foreground truncate">
                    {profile?.email}
                  </p>
                  <Badge variant="secondary" className="w-fit text-xs">
                    Academy {getTierLabel()}
                  </Badge>
                </div>
              </DropdownMenuLabel>
              <DropdownMenuSeparator />

              {/* Menu Items */}
              <DropdownMenuItem asChild className="cursor-pointer">
                <Link to="/settings" className="flex items-center">
                  <User className="mr-2 h-4 w-4" />
                  <span>View Profile</span>
                </Link>
              </DropdownMenuItem>

              <DropdownMenuItem asChild className="cursor-pointer">
                <Link to="/academy/certificates" className="flex items-center">
                  <Calendar className="mr-2 h-4 w-4" />
                  <span>My Certificates</span>
                </Link>
              </DropdownMenuItem>

              <DropdownMenuItem asChild className="cursor-pointer">
                <Link to="/academy/events" className="flex items-center">
                  <Clock className="mr-2 h-4 w-4" />
                  <span>Upcoming Events</span>
                </Link>
              </DropdownMenuItem>

              <DropdownMenuSeparator />

              <DropdownMenuItem
                className="cursor-pointer text-destructive focus:text-destructive focus:bg-destructive/10"
                onClick={signOut}
              >
                <LogOut className="mr-2 h-4 w-4" />
                <span>Sign Out</span>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </TooltipProvider>
      </div>
    </header>
  );
}
