import { useLocation, Link } from "react-router-dom";
import {
  Bell,
  Settings,
  LogOut,
  ChevronLeft,
  GraduationCap,
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
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/hooks/useAuth";
import { useUserAccess } from "@/hooks/useUserAccess";
import { useCurrentRelationshipRole } from "@/hooks/useCurrentRelationshipRole";
import { relationshipRoleLabel } from "@/lib/roles/relationshipRole";
import { NotificationDropdown } from "@/components/NotificationDropdown";
import { useClientTenant } from "@/contexts/ClientTenantContext";

// Academy route titles
const academyRouteTitles: Record<string, string> = {
  "/academy": "Academy Dashboard",
  "/academy/courses": "My Courses",
  "/academy/certificates": "Certificates",
  "/academy/events": "Events",
  "/academy/community": "Community",
  "/academy/profile": "Profile",
  "/settings": "Profile Settings",
};

function titleFromPath(pathname: string): string {
  // Suppress raw lesson ID on lesson viewer routes — breadcrumb inside the page handles context
  if (/^\/academy\/course\/[^/]+\/lesson\/[^/]+/.test(pathname)) return "";
  const fromLookup = academyRouteTitles[pathname];
  if (fromLookup) return fromLookup;
  const segments = pathname.split("/").filter(Boolean);
  const last = segments[segments.length - 1] ?? "";
  const derived = last.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
  if (derived.toLowerCase() === "academy") return "";
  return derived;
}


export function AcademyTopBar() {
  const location = useLocation();
  const { profile, signOut } = useAuth();
  const { hasFullAccess } = useUserAccess();
  const { relationshipRole } = useCurrentRelationshipRole();
  
  const { isAcademyOnly } = useClientTenant();

  const pageTitle = titleFromPath(location.pathname);

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
      {/* Left: Logo, Page Title & Breadcrumbs - shrinks to accommodate right side */}
      <div className="flex items-center gap-4 flex-1 min-w-0">
        {hasFullAccess && (
          <Link
            to="/"
            rel="noopener noreferrer"
            className="flex items-center gap-1 text-sm text-muted-foreground hover:text-[var(--viv-purple)] transition-colors flex-shrink-0"
          >
            <ChevronLeft className="h-4 w-4" />
            <span className="hidden sm:inline">Compliance System</span>
          </Link>
        )}
        <div className="flex items-center gap-2 flex-shrink-0">
          <div className="flex items-center justify-center h-8 w-8 rounded-lg" style={{ background: "var(--viv-grad-hero)" }}>
            <GraduationCap className="h-4 w-4 text-white" />
          </div>
          <span className="text-xl font-semibold text-[var(--viv-purple)]">Academy</span>
        </div>

        {pageTitle && (
          <>
            <div className="h-8 w-px bg-[var(--viv-purple-light)] flex-shrink-0" />

            <div className="flex flex-col min-w-0">
              <h1 className="text-xl font-semibold text-[var(--viv-purple)] truncate max-w-[120px] sm:max-w-[180px] md:max-w-[250px] lg:max-w-[300px]">
                {pageTitle}
              </h1>
            </div>
          </>
        )}
      </div>



      {/* Right: Actions & Avatar - never pushed off-screen */}
      <div className="flex items-center gap-2 flex-shrink-0 ml-2">
        <TooltipProvider>
          {/* Notifications */}
          {!isAcademyOnly && (
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
          )}

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
                      <AvatarFallback className="bg-[var(--viv-purple-light)] text-[var(--viv-acai)] font-semibold">
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
                  <Badge variant="secondary" className="w-fit text-xs bg-[var(--viv-cyan-light)] text-[var(--viv-fuchsia)] border-transparent">
                    {relationshipRoleLabel(relationshipRole)}
                  </Badge>
                </div>
              </DropdownMenuLabel>
              <DropdownMenuSeparator />

              {/* Menu Items */}
              <DropdownMenuItem asChild className="cursor-pointer">
                <Link to="/academy/profile" className="flex items-center">
                  <Settings className="mr-2 h-4 w-4" />
                  <span>Profile</span>
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
