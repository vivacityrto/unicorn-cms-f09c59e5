/**
 * Ask Viv Client Navigation Manifest (shared)
 *
 * Static route/label/description list for the ask-viv-assistant-client
 * `find_portal_page` tool. Edge functions (Deno) and the frontend (Vite)
 * are separate build/runtime boundaries in this repo — nothing under
 * supabase/functions imports from src/ anywhere else in the codebase — so
 * this mirrors, rather than imports, the real client-portal menu. Keep in
 * sync with:
 *   - src/components/client/ClientSidebar.tsx (client-portal items)
 *   - src/config/navigationConfig.ts academyMenuSections (Academy items)
 * A page renamed or moved in either of those without a matching update here
 * will make the assistant recommend a stale path.
 */

export interface PortalPageEntry {
  label: string;
  path: string;
  description: string;
  /** Only shown to Admin-role tenant users, e.g. user management. */
  adminOnly?: boolean;
}

export const CLIENT_PORTAL_PAGES: PortalPageEntry[] = [
  { label: "Home", path: "/client/home", description: "Client portal home/overview page" },
  { label: "Inbox", path: "/client/inbox", description: "Messages and requests to/from your Vivacity consultant" },
  { label: "Tasks", path: "/client/tasks", description: "Action items and to-dos assigned to your organisation" },
  { label: "Packages", path: "/client/packages", description: "Your active and past consulting packages and their stages" },
  { label: "Governance Documents", path: "/client/governance-documents", description: "Governance policy and procedure documents", adminOnly: true },
  { label: "Files", path: "/client/files", description: "Files and evidence shared with or by your organisation" },
  { label: "Resource Hub", path: "/client/resource-hub", description: "Templates, guides, and reference material" },
  { label: "Calendar", path: "/client/calendar", description: "Upcoming meetings and scheduled sessions" },
  { label: "Reports", path: "/client/reports", description: "Compliance and progress reports for your organisation" },
  { label: "Support Tickets", path: "/client/support-tickets", description: "Raise or track a support request" },
  { label: "Users", path: "/client/users", description: "Manage who has access to your organisation's portal — invite a secondary contact, team member, or Academy-only learner, or resend/check an invite", adminOnly: true },
  { label: "Staff PDPs", path: "/client/staff-pdps", description: "Staff professional development plans", adminOnly: true },
  { label: "TGA Details", path: "/client/tga", description: "Your Training.gov.au registration and scope details" },
  { label: "Membership Certificate", path: "/client/certificate", description: "Your Vivacity membership certificate" },
  { label: "Settings", path: "/settings", description: "Account and organisation settings" },
  { label: "Profile", path: "/profile", description: "Your personal profile details" },
];

// Note: /academy/team ("Team Members") exists as a route but was verified
// live (Playwright, 6 Aug) to render placeholder/mock data unconnected to
// the real tenant — deliberately excluded here so find_portal_page never
// recommends it. Academy-only learner invites go through /client/users
// (access scope = "Academy only" there), confirmed live against a real
// account with that access scope already set.
export const ACADEMY_PAGES: PortalPageEntry[] = [
  { label: "Academy Dashboard", path: "/academy", description: "Vivacity Academy home — your learning overview" },
  { label: "My Courses", path: "/academy/courses", description: "Courses you're enrolled in and their progress" },
  { label: "My PDP", path: "/academy/pdp", description: "Your personal development plan in Vivacity Academy" },
  { label: "Certificates", path: "/academy/certificates", description: "Certificates you've earned from completed courses" },
  { label: "Events", path: "/academy/events", description: "Upcoming Vivacity Academy training events" },
  { label: "Community", path: "/academy/community", description: "Vivacity Academy community/discussion area" },
];

export const ALL_PORTAL_PAGES: PortalPageEntry[] = [...CLIENT_PORTAL_PAGES, ...ACADEMY_PAGES];

/** Very small fuzzy matcher — token overlap between the query and each page's label/description. No DB, no embeddings. */
export function findPortalPages(query: string, limit = 5): PortalPageEntry[] {
  const q = query.toLowerCase();
  const queryTokens = q.split(/\W+/).filter((t) => t.length > 2);

  const scored = ALL_PORTAL_PAGES.map((page) => {
    const haystack = `${page.label} ${page.description}`.toLowerCase();
    let score = 0;
    if (haystack.includes(q)) score += 5;
    for (const token of queryTokens) {
      if (haystack.includes(token)) score += 1;
    }
    return { page, score };
  }).filter((s) => s.score > 0);

  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, limit).map((s) => s.page);
}
