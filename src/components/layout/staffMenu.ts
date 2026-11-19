import type { LucideIcon } from "lucide-react";
import { Activity, AlertTriangle, Award, BarChart3, BellRing, Blocks, BookOpen, Bot, Briefcase, Building2, Calendar, CheckSquare, ClipboardCheck, ClipboardList, Cog, Compass, Database, Download, FileCheck, FileText, Flag, Gauge, Globe, GraduationCap, Inbox, LayoutDashboard, Library, LifeBuoy, Lightbulb, ListTodo, Mail, MapPin, Network, Package2, Puzzle, Radar, Rocket, ScrollText, Search, Send, Shield, ShieldCheck, Sparkles, Tags, Target, TrendingUp, UserPlus, Users, UsersRound, Video } from "lucide-react";

// ============================================================
// VIVACITY TEAM SIDEBAR - FINAL AUTHORITY MODEL
// ============================================================

// 1. WORK Section - All Vivacity Team Roles
export const workMenuItems = [
  { icon: LayoutDashboard, label: "Dashboard", path: "/dashboard" },
  { icon: Sparkles, label: "Ask Viv", path: "/ask-viv" },
  { icon: LayoutDashboard, label: "Triage Dashboard", path: "/triage-dashboard" },
  { icon: BarChart3, label: "Executive Dashboard", path: "/executive", leadershipOnly: true },
  { icon: Inbox, label: "Inbox", path: "/inbox" },
  { icon: Mail, label: "Email Triage", path: "/email-triage", emailTriageStaffOnly: true },
  { icon: Briefcase, label: "My Work", path: "/my-work" },
  { icon: ListTodo, label: "Tasks", path: "/tasks" },
  { icon: Gauge, label: "KPI", path: "/kpi" },
  { icon: Inbox, label: "Time Inbox", path: "/time-inbox" },
  { icon: Calendar, label: "My Calendar", path: "/work/calendar" },
  { icon: Video, label: "Meetings", path: "/work/meetings" },
  { icon: Calendar, label: "Event Calendar", path: "/calendar" },
  { icon: GraduationCap, label: "Vivacity Academy", path: "/academy" },
];

export const EMAIL_TRIAGE_ROLES = new Set(["Super Admin", "Team Member", "CSC", "Integrator", "BGT"]);

// 2. CLIENTS Section - All Vivacity Team Roles
export const clientsMenuItems = [
  { icon: Building2, label: "Clients", path: "/manage-tenants" },
  { icon: Activity, label: "Client Activity", path: "/client-activity" },

  { icon: FileText, label: "Documents", path: "/manage-documents" },
  { icon: Mail, label: "Communications", path: "/communications" },
  { icon: LifeBuoy, label: "Support Tickets", path: "/support-tickets" },
  { icon: Lightbulb, label: "RTO Tips", path: "/rto-tips" },
  { icon: ClipboardCheck, label: "Audits", path: "/audits" },
  { icon: Download, label: "Cert & Contact Register", path: "/clients/bulk-membership-certificates", cscOrSuperAdminOnly: true },
];

// 3. EOS Section - Role-Aware Visibility
// Super Admin & Team Leader: full access
// Team Member: hide Leadership Dashboard, Accountability Chart
export const eosMenuItems = [
  { icon: Target, label: "EOS Overview", path: "/eos" },
  { icon: ShieldCheck, label: "Leadership Dashboard", path: "/eos/leadership", leadershipOnly: true },
  { icon: BarChart3, label: "Scorecard", path: "/eos/scorecard" },
  { icon: Gauge, label: "CST Report", path: "/eos/cst-report" },
  { icon: Flag, label: "Mission Control", path: "/eos/vto" },
  { icon: TrendingUp, label: "Rocks", path: "/eos/rocks" },
  { icon: Rocket, label: "Flight Plan", path: "/eos/flight-plan" },
  { icon: Shield, label: "Risks & Opportunities", path: "/eos/risks-opportunities" },
  { icon: ListTodo, label: "To-Dos", path: "/eos/todos" },
  { icon: Calendar, label: "Meetings", path: "/eos/meetings" },
  { icon: Users, label: "Quarterly Conversations", path: "/eos/qc" },
  { icon: Briefcase, label: "Accountability Chart", path: "/eos/accountability" },
  { icon: TrendingUp, label: "GWC Trends", path: "/eos/gwc-trends" },
  { icon: Target, label: "Rock Analysis", path: "/eos/rock-analysis" },
  { icon: BarChart3, label: "Client Impact", path: "/eos/client-impact" },
  { icon: FileText, label: "Processes", path: "/processes" },
];

// 4. RESOURCE MANAGEMENT Section - Super Admin & Team Leader only
// Admin-style management views, not browsing
export const resourceManagementMenuItems = [
  { icon: Library, label: "Content Dashboard", path: "/resource-hub" },
  { icon: FileText, label: "Templates Manager", path: "/resource-hub/templates" },
  { icon: CheckSquare, label: "Checklists Manager", path: "/resource-hub/checklists" },
  { icon: ClipboardList, label: "Registers & Forms Manager", path: "/resource-hub/registers-forms" },
  { icon: Search, label: "Audit & Evidence Library", path: "/resource-hub/audit-evidence" },
  { icon: Video, label: "Training & Webinar Library", path: "/resource-hub/training-webinars" },
  { icon: BookOpen, label: "Guides & How-To Library", path: "/resource-hub/guides-howto" },
  { icon: TrendingUp, label: "CI Tools Library", path: "/resource-hub/ci-tools" },
  { icon: ScrollText, label: "Updates Log Manager", path: "/resource-hub/updates" },
];

// 5. ADMINISTRATION Section
// Super Admin: full access
// Team Leader: read-only access to Team Users and Tenant Users
// Team Member: hidden
export interface AdministrationMenuItem {
  icon: LucideIcon;
  label: string;
  path: string;
  saOrIntegratorOnly?: boolean;
  saOrTeamLeaderOnly?: boolean;
  superAdminOnly?: boolean;
}
export const administrationMenuItems: AdministrationMenuItem[] = [
  { icon: Shield, label: "Team Users", path: "/admin/team-users" },
  { icon: Building2, label: "Tenant Users", path: "/admin/tenant-users" },
  { icon: UsersRound, label: "Contact Directory", path: "/administration/contacts" },
  { icon: Users, label: "People", path: "/admin/staff-engagements", saOrIntegratorOnly: true },

  { icon: Mail, label: "Manage Invites", path: "/manage-invites", superAdminOnly: true },
  { icon: Send, label: "Cohort Sender", path: "/admin/cohort-sender", superAdminOnly: true },
  { icon: UserPlus, label: "Bulk Invite", path: "/admin/bulk-invite", superAdminOnly: true },
  { icon: ShieldCheck, label: "User Audit", path: "/admin/user-audit", superAdminOnly: true },
  { icon: Mail, label: "Email Templates", path: "/admin/email-templates", superAdminOnly: true },
];

// 6. ACADEMY BUILDER Section - Super Admin Only
export const academyBuilderMenuItems = [
  { icon: ShieldCheck, label: "Academy Customers", path: "/superadmin/academy/tenant-access" },
  { icon: Users, label: "Enrolments", path: "/superadmin/academy/enrollments" },
  { icon: Award, label: "Certificates", path: "/superadmin/academy/certificates" },
  { icon: GraduationCap, label: "Academy Builder", path: "/superadmin/academy/builder" },
  { icon: Search, label: "Course Cleanup", path: "/superadmin/academy/course-cleanup" },
  { icon: Tags, label: "Tag Management", path: "/superadmin/academy/tag-management" },
  { icon: GraduationCap, label: "Package → Course Rules", path: "/superadmin/academy/package-course-rules" },
  { icon: ClipboardList, label: "Workforce PDP", path: "/superadmin/workforce-pdp" },
];

// 7. SYSTEM CONFIG Section - Super Admin Only
export const systemConfigMenuItems = [
  { icon: Package2, label: "Manage Packages", path: "/admin/manage-packages" },
  { icon: Blocks, label: "Manage Stages", path: "/admin/stages" },
  { icon: Sparkles, label: "Stage Builder", path: "/admin/stage-builder" },
  { icon: BarChart3, label: "Stage Analytics", path: "/admin/stage-analytics" },
  { icon: Cog, label: "EOS Processes", path: "/admin/eos-processes" },
  { icon: Library, label: "Knowledge Library", path: "/admin/knowledge" },
  { icon: Bot, label: "AI Assistant", path: "/admin/assistant" },
  { icon: Flag, label: "Ask Viv Flags", path: "/internal/ask-viv/flags" },
  { icon: Puzzle, label: "Add-in Settings", path: "/admin/addin-settings" },
  { icon: Activity, label: "Add-in Diagnostics", path: "/admin/addin-diagnostics" },
  { icon: MapPin, label: "ClickUp Mapping", path: "/admin/clickup-mapping" },
  { icon: Download, label: "ClickUp Import", path: "/admin/clickup-import" },
  { icon: Database, label: "Code Tables", path: "/admin/code-tables" },
  { icon: ShieldCheck, label: "Role Permissions", path: "/administration/role-permissions" },
  { icon: ClipboardList, label: "Lifecycle Checklists", path: "/admin/lifecycle-checklists" },
  { icon: Tags, label: "Merge Field Tags", path: "/admin/merge-field-tags" },
  { icon: Globe, label: "SharePoint Sites", path: "/admin/sharepoint-sites" },
  { icon: BellRing, label: "Reporting Obligations", path: "/admin/settings/reporting-obligations" },
  { icon: Activity, label: "Operations Dashboard", path: "/admin/operations" },
  { icon: FileCheck, label: "Compliance Packs", path: "/admin/compliance-packs" },
  { icon: AlertTriangle, label: "Zero-Progress Packages", path: "/admin/diagnostics/zero-progress-packages" },
];

// 7b. STRATEGIC INTELLIGENCE Section - Regulator Watch is available to all
// internal staff; the remaining cross-tenant tools stay Super Admin only.
// Cross-tenant analytics/orchestration tools surfaced as widgets on the Executive Dashboard
export const strategicIntelligenceMenuItems = [
  { icon: Globe, label: "Regulator Watch", path: "/admin/regulator-watch" },
  { icon: Radar, label: "Risk Radar", path: "/admin/risk-radar" },
  { icon: Search, label: "Template Gap Analysis", path: "/admin/template-gap-analysis" },
  { icon: Compass, label: "Strategic Command", path: "/admin/strategic-command" },
  { icon: TrendingUp, label: "Workflow Optimisation", path: "/admin/workflow-optimisation" },
  { icon: Network, label: "Strategic Orchestration", path: "/admin/strategic-orchestration" },
];

/** One menu item as the sidebar draws it. */
export interface StaffMenuItem {
  icon: LucideIcon;
  label: string;
  path: string;
  badge?: number;
}

export type StaffSectionKey =
  | "work"
  | "clients"
  | "eos"
  | "resourceManagement"
  | "administration"
  | "academyBuilder"
  | "systemConfig"
  | "strategicIntelligence";

/** A group in the staff menu. Its order here is the order people are used to: do not reorder. */
export interface StaffSection {
  key: StaffSectionKey;
  title: string;
  /** Stands for the group when the sidebar is collapsed to icons. */
  icon: LucideIcon;
  items: StaffMenuItem[];
  /** Something in the group needs attention (an unread message or an open ticket). */
  alert: boolean;
}

/**
 * Roles in full, with no abbreviations: CSC is a Client Success Champion, BGT is the Business Growth Team. Anything else
 * (Super Admin, Team Leader, Team Member, Integrator) already reads in full.
 */
const ROLE_LABELS: Record<string, string> = {
  CSC: "Client Success Champion",
  BGT: "Business Growth Team",
};

export function roleLabel(role: string | null | undefined): string {
  if (!role) return "Team member";
  return ROLE_LABELS[role] ?? role;
}

export interface StaffMenuContext {
  userRole: string;
  isSuperAdmin: boolean;
  isTeamLeader: boolean;
  isIntegrator: boolean;
  isCSC: boolean;
  isVivacityTeam: boolean;
  teamUnreadCount?: number;
  myAssignedConvosCount?: number;
  supportTicketsCount?: number;
}

/**
 * The staff menu for one person: the same groups, in the same order, with the same items in the same order, as the sidebar
 * has always shown. Only what a role may see is filtered out. Empty groups are dropped.
 */
export function buildStaffSections(ctx: StaffMenuContext): StaffSection[] {
  const { userRole, isSuperAdmin, isTeamLeader, isIntegrator, isCSC, isVivacityTeam } = ctx;
  const messages = (ctx.teamUnreadCount || 0) + (ctx.myAssignedConvosCount || 0);
  const tickets = ctx.supportTicketsCount || 0;
  const isEmailTriageStaff = EMAIL_TRIAGE_ROLES.has(userRole);

  const work = workMenuItems.filter((item) => {
    if (item.leadershipOnly) return isSuperAdmin || isTeamLeader;
    if (item.emailTriageStaffOnly) return isEmailTriageStaff;
    return true;
  });

  const clients = clientsMenuItems
    .map((item): StaffMenuItem & { cscOrSuperAdminOnly?: boolean } => {
      if (item.path === "/communications") return { ...item, badge: messages || undefined };
      if (item.path === "/support-tickets") return { ...item, badge: tickets || undefined };
      return item;
    })
    .filter((item) => !item.cscOrSuperAdminOnly || isSuperAdmin || userRole === "CSC");

  const eos = eosMenuItems.filter((item) => !item.leadershipOnly || isSuperAdmin || isTeamLeader);

  const administration = administrationMenuItems.filter((item) => {
    if (item.saOrIntegratorOnly) return isSuperAdmin || isIntegrator;
    if (item.saOrTeamLeaderOnly) return isSuperAdmin || isTeamLeader;
    if (item.superAdminOnly) return isSuperAdmin;
    return true;
  });

  const sections: Array<StaffSection | null> = [
    { key: "work", title: "Work", icon: Briefcase, items: work, alert: false },
    { key: "clients", title: "Clients", icon: Building2, items: clients, alert: messages + tickets > 0 },
    { key: "eos", title: "EOS", icon: Target, items: eos, alert: false },
    isSuperAdmin || isTeamLeader
      ? { key: "resourceManagement", title: "Resource Management", icon: Library, items: resourceManagementMenuItems, alert: false }
      : null,
    isVivacityTeam ? { key: "administration", title: "Administration", icon: Shield, items: administration, alert: false } : null,
    isSuperAdmin || isTeamLeader || isIntegrator || isCSC
      ? { key: "academyBuilder", title: "Academy", icon: GraduationCap, items: academyBuilderMenuItems, alert: false }
      : null,
    isSuperAdmin ? { key: "systemConfig", title: "System Config", icon: Cog, items: systemConfigMenuItems, alert: false } : null,
    isVivacityTeam
      ? {
          key: "strategicIntelligence",
          title: "Strategic Intelligence",
          icon: Compass,
          items: isSuperAdmin ? strategicIntelligenceMenuItems : [strategicIntelligenceMenuItems[0]],
          alert: false,
        }
      : null,
  ];
  return sections.filter((s): s is StaffSection => !!s && s.items.length > 0);
}

/** The group a page belongs to, so the sidebar can open it. */
export function sectionForPath(sections: readonly StaffSection[], pathname: string): StaffSectionKey | null {
  return sections.find((s) => s.items.some((i) => i.path === pathname))?.key ?? null;
}
