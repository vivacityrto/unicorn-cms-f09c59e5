import { useState, useEffect } from "react";
import { useLocation, Link, useNavigate } from "react-router-dom";
import {
  Bell,
  LogOut,
  Settings,
  Search,
  ChevronRight,
  Lightbulb,
  LifeBuoy,
  NotebookPen,
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
import { NotificationDropdown } from "@/components/NotificationDropdown";
import { FloatingSuggestionsDialog } from "./FloatingSuggestionsDialog";
import { SupportTicketsPanel } from "@/components/support-tickets/SupportTicketsPanel";
import { DailyNotesPanel } from "@/components/task-notes/DailyNotesPanel";

import { AskVivButton } from "@/components/ask-viv";
import { useHelpCenter } from "@/components/help-center";
import unicornLogo from "@/assets/unicorn-logo-login.svg";
import vivacityLogo from "@/assets/vivacity-logo.svg";
import { HelpCircle } from "lucide-react";

// Route to page title mapping
const routeTitles: Record<string, string> = {
  "/dashboard": "Dashboard",
  "/triage-dashboard": "Triage Dashboard",
  "/inbox": "Inbox",
  "/kpi": "KPI Dashboard",
  "/my-work": "My Work",
  "/tasks": "Tasks",
  "/time-inbox": "Time Inbox",
  "/email-triage": "Email Triage",
  "/work/calendar": "My Calendar",
  "/work/meetings": "Meetings",
  "/calendar": "Event Calendar",
  "/manage-tenants": "Clients",

  "/manage-documents": "Documents",
  "/communications": "Communications",
  "/rto-tips": "RTO Tips",
  "/suggestions": "Suggestions",
  "/suggestions/new": "New Suggestion",
  "/support-tickets": "Support Tickets",
  "/support-tickets/new": "New Support Ticket",
  "/compliance-audits": "Compliance Auditor",
  "/audits": "Audits",
  "/clients/bulk-membership-certificates": "Cert & Contact Register",
  "/eos": "EOS Overview",
  "/eos/leadership": "Leadership Dashboard",
  "/eos/scorecard": "Scorecard",
  "/eos/vto": "Mission Control",
  "/eos/rocks": "Rocks",
  "/eos/flight-plan": "Flight Plan",
  "/eos/risks-opportunities": "Risks & Opportunities",
  "/eos/todos": "To-Dos",
  "/eos/meetings": "Meetings",
  "/eos/qc": "Quarterly Conversations",
  "/eos/accountability": "Accountability Chart",
  "/eos/gwc-trends": "GWC Trends",
  "/eos/rock-analysis": "Rock Analysis",
  "/eos/client-impact": "Client Impact",
  "/processes": "Processes",
  "/resource-hub": "Content Dashboard",
  "/resource-hub/templates": "Templates Manager",
  "/resource-hub/checklists": "Checklists Manager",
  "/resource-hub/registers-forms": "Registers & Forms Manager",
  "/resource-hub/audit-evidence": "Audit & Evidence Library",
  "/resource-hub/training-webinars": "Training & Webinar Library",
  "/resource-hub/guides-howto": "Guides & How-To Library",
  "/resource-hub/ci-tools": "CI Tools Library",
  "/resource-hub/updates": "Updates Log Manager",
  "/admin/team-users": "Team Users",
  "/admin/tenant-users": "Tenant Users",
  "/manage-invites": "Manage Invites",
  "/admin/user-audit": "User Audit",
  "/admin/email-templates": "Email Templates",
  "/admin/manage-packages": "Manage Packages",
  "/admin/stages": "Manage Stages",
  "/admin/stage-builder": "Stage Builder",
  "/admin/stage-analytics": "Stage Analytics",
  "/admin/eos-processes": "EOS Processes",
  "/admin/knowledge": "Knowledge Library",
  "/admin/assistant": "AI Assistant",
  "/admin/addin-settings": "Add-in Settings",
  "/admin/addin-diagnostics": "Add-in Diagnostics",
  "/admin/clickup-mapping": "ClickUp Mapping",
  "/admin/clickup-import": "ClickUp Import",
  "/admin/code-tables": "Code Tables",
  "/administration/role-permissions": "Role Permissions",
  "/admin/lifecycle-checklists": "Lifecycle Checklists",
  "/admin/merge-field-tags": "Merge Field Tags",
  "/admin/governance-documents": "Governance Documents",
  "/admin/sharepoint-sites": "SharePoint Sites",
  "/admin/settings/reporting-obligations": "Reporting Obligations",
  "/admin/operations": "Operations Dashboard",
  "/admin/compliance-packs": "Compliance Packs",
  "/admin/diagnostics/zero-progress-packages": "Zero-Progress Packages",
  "/internal/ask-viv/flags": "Ask Viv Flags",
  "/admin/regulator-watch": "Regulator Watch",
  "/admin/risk-radar": "Risk Radar",
  "/admin/template-gap-analysis": "Template Gap Analysis",
  "/admin/strategic-command": "Strategic Command",
  "/admin/workflow-optimisation": "Workflow Optimisation",
  "/admin/strategic-orchestration": "Strategic Orchestration",
  "/admin/bulk-invite": "Bulk Invite",
  "/admin/staff-engagements": "People",
  "/admin/cohort-sender": "Cohort Sender",
  "/settings": "Profile Settings",
  "/reports": "Reports",
  "/team-settings": "Team Settings",
  "/executive": "Executive Dashboard",
  "/executive/financial-controls": "Financial Controls",
  "/executive/client-commitments": "Client Commitments",
  "/executive/decision-queue": "Decision Queue",
  // Client portal routes
  "/client/home": "Home",
  "/client/governance-documents": "Governance Documents",
  "/client/resource-hub": "Resource Hub",
  "/client/calendar": "Calendar",
  "/client/notifications": "Notifications",
  "/client/reports": "Reports",
  "/client/users": "Team",
  // Academy routes
  "/academy": "Academy Dashboard",
  "/academy/courses": "My Courses",
  "/academy/certificates": "Certificates",
  "/academy/events": "Events",
  "/academy/community": "Community",
  "/academy/team": "Team Members",
  // SuperAdmin Academy routes
  "/superadmin/academy/certificates": "Certificates",
  "/superadmin/academy/enrollments": "Enrolments",
  "/superadmin/academy/tenant-access": "Tenant Access",
  "/superadmin/academy/builder": "Academy Builder",
  "/superadmin/academy/package-course-rules": "Package → Course Rules",
  "/superadmin/workforce-pdp": "Workforce PDP",
};

// Breadcrumb generation based on route
const getBreadcrumbs = (pathname: string) => {
  const segments = pathname.split("/").filter(Boolean);
  const breadcrumbs: { label: string; path: string }[] = [];

  let currentPath = "";
  segments.forEach((segment, index) => {
    currentPath += `/${segment}`;
    const title = routeTitles[currentPath] || segment.charAt(0).toUpperCase() + segment.slice(1).replace(/-/g, " ");
    breadcrumbs.push({
      label: title,
      path: currentPath,
    });
  });

  return breadcrumbs;
};

// Shared shape for the two utility buttons below: same size/shape/border
// framework so they read as a matched pair, with each keeping its own
// accent (Support Tickets' brand-aqua fill) so they stay distinguishable
// from one another at a glance.
const UTILITY_BUTTON_CLASS = 'h-10 w-10 rounded-full shrink-0';

function SupportTicketsButton() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            size="icon"
            className={`${UTILITY_BUTTON_CLASS} bg-brand-aqua text-white hover:bg-brand-aqua-600 border border-transparent`}
            onClick={() => setOpen(prev => !prev)}
          >
            <LifeBuoy className="h-4 w-4" />
          </Button>
        </TooltipTrigger>
        <TooltipContent>
          <p>Support Tickets</p>
        </TooltipContent>
      </Tooltip>
      <SupportTicketsPanel open={open} onOpenChange={setOpen} />
    </>
  );
}

function DailyNotesButton() {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);

  if (!user?.id) return null;

  return (
    <>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="outline"
            size="icon"
            className={UTILITY_BUTTON_CLASS}
            onClick={() => setOpen(prev => !prev)}
          >
            <NotebookPen className="h-4 w-4" />
          </Button>
        </TooltipTrigger>
        <TooltipContent>
          <p>Daily Notes</p>
        </TooltipContent>
      </Tooltip>
      <DailyNotesPanel open={open} onOpenChange={setOpen} userId={user.id} />
    </>
  );
}

interface TopBarProps {
  showSearch?: boolean;
}

export function TopBar({ showSearch = false }: TopBarProps) {
  const location = useLocation();
  const { profile, signOut } = useAuth();
  const [searchQuery, setSearchQuery] = useState("");
  const helpCenter = useHelpCenter();

  const userRole = profile?.unicorn_role || "User";
  const isClientRole = userRole === "Admin" || userRole === "User";

  const pageTitle = routeTitles[location.pathname] || "Page";
  const breadcrumbs = getBreadcrumbs(location.pathname);
  const showBreadcrumbs = breadcrumbs.length > 1;


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

  const getRoleBadgeVariant = (role: string) => {
    switch (role) {
      case "Super Admin":
        return "default";
      case "Team Leader":
        return "secondary";
      case "Team Member":
        return "outline";
      default:
        return "outline";
    }
  };

  return (
    <header className="h-16 bg-card border-b border-border flex items-center justify-between pl-16 pr-6 md:px-6 sticky top-0 z-20">
      {/* Left: Logo, Page Title & Breadcrumbs - shrinks to accommodate right side */}
      <div className="flex items-center gap-4 flex-1 min-w-0">
        <img
          src={unicornLogo}
          alt="Unicorn 2.0"
          className="h-16 flex-shrink-0"
          width="117"
          height="64"
          loading="eager"
        />
        <img
          src={vivacityLogo}
          alt="Vivacity Coaching & Consulting"
          className="h-10 flex-shrink-0 hidden sm:block"
          loading="eager"
        />

        <div className="h-8 w-px bg-border flex-shrink-0 hidden sm:block" />
        
        <div className="flex flex-col min-w-0">
          {showBreadcrumbs && (
            <nav className="flex items-center gap-1 text-xs text-muted-foreground">
              {breadcrumbs.slice(0, -1).map((crumb, index) => (
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
          <h1 className="text-lg font-semibold text-foreground truncate max-w-[120px] sm:max-w-[180px] md:max-w-[250px] lg:max-w-[300px]">
            {pageTitle}
          </h1>
        </div>
      </div>

      {/* Center: Optional Global Search */}
      {showSearch && (
        <div className="flex-1 max-w-md mx-8">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10 bg-muted/50"
            />
          </div>
        </div>
      )}

      {/* Right: Actions & Avatar - never pushed off-screen */}
      <div className="flex items-center gap-2 flex-shrink-0 ml-2">
        <TooltipProvider>
          {/* Daily Notes button */}
          <DailyNotesButton />
          {/* Support Tickets button */}
          <SupportTicketsButton />
          {/* Help Center button - Client roles only, gated to primary/secondary contacts */}
          {isClientRole && helpCenter.canAccess && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => helpCenter.openHelpCenter("chatbot")}
                  className="h-10 w-10"
                >
                  <HelpCircle className="h-5 w-5" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                <p>Help Center</p>
              </TooltipContent>
            </Tooltip>
          )}

          {/* Ask Viv - Knowledge Assistant (SuperAdmin only) */}
          <AskVivButton />



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
                  <Badge variant={getRoleBadgeVariant(userRole)} className="w-fit text-xs">
                    {userRole}
                  </Badge>
                </div>
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              
              {/* Menu Items */}
              <DropdownMenuItem asChild className="cursor-pointer">
                <Link to="/settings?tab=profile" className="flex items-center">
                  <Settings className="mr-2 h-4 w-4" />
                  <span>Profile Settings</span>
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
