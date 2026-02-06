import {
  LayoutDashboard,
  FileText,
  BarChart3,
  Calendar,
  Users,
  Building2,
  Package2,
  Library,
  BookOpen,
  GraduationCap,
  Award,
  MessageSquare,
  User,
  HelpCircle,
  ExternalLink,
  type LucideIcon,
} from "lucide-react";

// Menu item interface
export interface MenuItem {
  icon: LucideIcon;
  label: string;
  path: string;
  external?: boolean;
}

// Section interface
export interface MenuSection {
  key: string;
  title: string;
  items: MenuItem[];
}

// =============================================================================
// COMPLIANCE SYSTEM MEMBER MENU
// Full platform access for RTO/compliance customers
// =============================================================================

export const complianceMenuSections: MenuSection[] = [
  {
    key: "main",
    title: "Main",
    items: [
      { icon: LayoutDashboard, label: "Dashboard", path: "/dashboard" },
      { icon: Building2, label: "Clients", path: "/manage-tenants" },
      { icon: FileText, label: "Documents", path: "/manage-documents" },
      { icon: Library, label: "Resource Hub", path: "/resource-hub" },
    ],
  },
  {
    key: "consultant",
    title: "Vivacity Consultant",
    items: [
      { icon: MessageSquare, label: "Book Consultation", path: "/consultation" },
      { icon: Calendar, label: "Scheduled Sessions", path: "/sessions" },
    ],
  },
  {
    key: "academy",
    title: "Vivacity Academy",
    items: [
      { icon: GraduationCap, label: "My Courses", path: "/academy/courses" },
      { icon: Award, label: "Certificates", path: "/academy/certificates" },
    ],
  },
  {
    key: "organisation",
    title: "Organisation",
    items: [
      { icon: Calendar, label: "Tasks", path: "/tasks" },
      { icon: Calendar, label: "Events", path: "/calendar" },
    ],
  },
];

// Compliance member footer links
export const complianceFooterLinks = [
  {
    label: "Help Centre",
    href: "https://help.vivacity.com.au",
    icon: HelpCircle,
  },
  {
    label: "Vivacity Academy",
    href: "/academy",
    internal: true,
    icon: GraduationCap,
  },
  {
    label: "Updates Log",
    href: "/resource-hub/updates",
    internal: true,
    icon: FileText,
  },
];

// =============================================================================
// VIVACITY ACADEMY MEMBER MENU
// Training-focused navigation for Academy-only customers
// =============================================================================

// Base Academy menu (for all tiers)
export const academyMenuSections: MenuSection[] = [
  {
    key: "main",
    title: "Learning",
    items: [
      { icon: LayoutDashboard, label: "Academy Dashboard", path: "/academy" },
      { icon: BookOpen, label: "My Courses", path: "/academy/courses" },
      { icon: Award, label: "Certificates", path: "/academy/certificates" },
      { icon: Calendar, label: "Events", path: "/academy/events" },
      { icon: MessageSquare, label: "Community", path: "/academy/community" },
    ],
  },
  {
    key: "account",
    title: "Account",
    items: [
      { icon: User, label: "Profile", path: "/settings" },
    ],
  },
];

// Team Members section (only for Team and Elite tiers)
export const academyTeamSection: MenuSection = {
  key: "team",
  title: "Team",
  items: [
    { icon: Users, label: "Team Members", path: "/academy/team" },
  ],
};

// Academy footer links
export const academyFooterLinks = [
  {
    label: "Help Centre",
    href: "https://help.vivacity.com.au",
    icon: HelpCircle,
    external: true,
  },
  {
    label: "FAQs",
    href: "https://vivacity.com.au/faqs",
    icon: HelpCircle,
    external: true,
  },
  {
    label: "Terms",
    href: "https://vivacity.com.au/terms",
    icon: FileText,
    external: true,
  },
  {
    label: "Privacy",
    href: "https://vivacity.com.au/privacy",
    icon: FileText,
    external: true,
  },
  {
    label: "Support",
    href: "mailto:support@vivacity.com.au",
    icon: MessageSquare,
    external: true,
  },
];

// =============================================================================
// ROUTE PROTECTION LISTS
// Routes that should be blocked based on tenant type
// =============================================================================

// Routes that require Compliance System membership
export const COMPLIANCE_ONLY_ROUTES = [
  "/manage-tenants",
  "/clients",
  "/manage-documents",
  "/document",
  "/resource-hub",
  "/consultation",
  "/sessions",
  "/tenant",
  "/package",
  "/rto-tips",
];

// Routes exclusive to Academy members
export const ACADEMY_ONLY_ROUTES = [
  "/academy",
];

// Public routes (no tenant type check)
export const PUBLIC_ROUTES = [
  "/login",
  "/reset-password",
  "/accept-invitation",
];
