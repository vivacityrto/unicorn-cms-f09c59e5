import { useEffect } from "react";
import { useLocation } from "react-router-dom";

const SITE_NAME = "Unicorn";
const ORIGIN = "https://unicorn-cms.au";

type MetaEntry = { title: string; description: string; index?: boolean };

/**
 * Route metadata map. Keys are matched longest-prefix-first, so
 * "/tenant/:id" style routes inherit their section metadata.
 * Only public, crawlable routes are indexable; the authenticated app is noindex.
 */
const ROUTE_META: Record<string, MetaEntry> = {
  "/": {
    title: "Unicorn — Compliance Management for Australian RTOs",
    description:
      "Vivacity's compliance management system for Australian RTOs. Track standards, documents, packages and audits in one secure platform.",
    index: true,
  },
  "/login": {
    title: "Sign In | Unicorn Compliance Management",
    description:
      "Sign in to Unicorn to manage RTO compliance, documents, audits and client packages with Vivacity Coaching & Consulting.",
    index: true,
  },
  "/reset-password": {
    title: "Reset Your Password | Unicorn",
    description:
      "Reset the password for your Unicorn compliance management account and regain secure access to your RTO workspace.",
  },
  "/activate": {
    title: "Activate Your Account | Unicorn",
    description:
      "Activate your Unicorn account to start managing RTO compliance, evidence and governance documents securely.",
  },
  "/accept-invitation": {
    title: "Accept Your Invitation | Unicorn",
    description:
      "Accept your invitation to join your organisation's Unicorn workspace for RTO compliance management.",
  },
  "/oauth/consent": {
    title: "Authorise Application Access | Unicorn",
    description:
      "Review and authorise application access to your Unicorn compliance workspace.",
  },
  "/dashboard": {
    title: "Dashboard | Unicorn",
    description:
      "Your compliance cockpit: client health, upcoming deadlines, tasks and package progress at a glance.",
  },
  "/triage-dashboard": {
    title: "Triage Dashboard | Unicorn",
    description: "Prioritise client attention items and compliance risks across your portfolio.",
  },
  "/documents": {
    title: "Documents | Unicorn",
    description: "Browse, review and acknowledge compliance documents and governance evidence.",
  },
  "/manage-documents": {
    title: "Manage Documents | Unicorn",
    description: "Create, map and publish compliance document templates for client packages.",
  },
  "/reports": {
    title: "Reports | Unicorn",
    description: "Compliance reporting across clients, packages, time and audit outcomes.",
  },
  "/calendar": {
    title: "Calendar | Unicorn",
    description: "Meetings, deadlines and scheduled compliance activity in one calendar view.",
  },
  "/messages": {
    title: "Messages | Unicorn",
    description: "Client and team conversations, support tickets and announcements.",
  },
  "/settings": {
    title: "Settings | Unicorn",
    description: "Manage your profile, notifications and integration preferences in Unicorn.",
  },
  "/manage-users": {
    title: "Manage Users | Unicorn",
    description: "Administer user accounts, roles and access across your organisation.",
  },
  "/manage-invites": {
    title: "Manage Invitations | Unicorn",
    description: "Send, track and reconcile user invitations and their delivery status.",
  },
  "/manage-tenants": {
    title: "Manage Clients | Unicorn",
    description: "Portfolio view of RTO clients, packages, consultants and registration status.",
  },
  "/tenant": {
    title: "Client Overview | Unicorn",
    description: "Client profile, packages, timeline, documents and compliance status.",
  },
  "/manage-stages": {
    title: "Manage Stages | Unicorn",
    description: "Configure package stages, documents and workflow templates.",
  },
  "/academy": {
    title: "Academy | Unicorn",
    description: "Compliance training courses, recordings and assessments for RTO teams.",
  },
  "/audits": {
    title: "Audits & Assessments | Unicorn",
    description: "Plan, run and report on RTO audits against the Standards for RTOs 2025.",
  },
  "/admin": {
    title: "Administration | Unicorn",
    description: "System administration, integrations and platform configuration for Unicorn.",
  },
  "/portal": {
    title: "Client Portal | Unicorn",
    description: "Your compliance portal: tasks, documents, meetings and progress updates.",
  },
};

const FALLBACK: MetaEntry = {
  title: "Unicorn — Compliance Management for Australian RTOs",
  description:
    "Vivacity's compliance management system for Australian RTOs. Track standards, documents, packages and audits in one secure platform.",
};

function resolveMeta(pathname: string): MetaEntry {
  if (ROUTE_META[pathname]) return ROUTE_META[pathname];
  const match = Object.keys(ROUTE_META)
    .filter((key) => key !== "/" && pathname.startsWith(key))
    .sort((a, b) => b.length - a.length)[0];
  return match ? ROUTE_META[match] : FALLBACK;
}

function setMeta(selector: string, attr: "name" | "property", key: string, content: string) {
  let el = document.head.querySelector<HTMLMetaElement>(selector);
  if (!el) {
    el = document.createElement("meta");
    el.setAttribute(attr, key);
    document.head.appendChild(el);
  }
  el.setAttribute("content", content);
}

/**
 * Keeps document title, description, canonical and og/twitter tags in sync
 * with the active route so each page is unique for search engines.
 */
export function RouteMeta() {
  const { pathname } = useLocation();

  useEffect(() => {
    const meta = resolveMeta(pathname);
    const canonical = `${ORIGIN}${pathname === "/" ? "/" : pathname.replace(/\/+$/, "")}`;

    document.title = meta.title;
    setMeta('meta[name="description"]', "name", "description", meta.description);
    setMeta('meta[property="og:title"]', "property", "og:title", meta.title);
    setMeta('meta[property="og:description"]', "property", "og:description", meta.description);
    setMeta('meta[property="og:url"]', "property", "og:url", canonical);
    setMeta('meta[property="og:site_name"]', "property", "og:site_name", SITE_NAME);
    setMeta('meta[name="twitter:title"]', "name", "twitter:title", meta.title);
    setMeta('meta[name="twitter:description"]', "name", "twitter:description", meta.description);

    let link = document.head.querySelector<HTMLLinkElement>('link[rel="canonical"]');
    if (!link) {
      link = document.createElement("link");
      link.setAttribute("rel", "canonical");
      document.head.appendChild(link);
    }
    link.setAttribute("href", canonical);

    // Authenticated app surfaces should not be indexed.
    const robots = document.head.querySelector<HTMLMetaElement>('meta[name="robots"]');
    if (meta.index) {
      robots?.remove();
    } else {
      setMeta('meta[name="robots"]', "name", "robots", "noindex, follow");
    }
  }, [pathname]);

  return null;
}

export default RouteMeta;
