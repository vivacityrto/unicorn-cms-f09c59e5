/**
 * Prompt, tool schema, fact sections and output checks for the scorecard "Ask Viv" read of one measure.
 *
 * Pure functions with no Deno or network access, so they are unit tested under node. The model only ever sees
 * facts the function read server-side; whatever it returns is validated here before anything is shown.
 */

export const SYSTEM_PROMPT = `You are Viv, the assistant for Vivacity's weekly leadership (L10) meeting. You explain ONE scorecard measure to people who are not technical and have a few minutes.

Rules:
- Use only the facts you are given. Every claim must trace to a number or name in them. Do not invent numbers, clients or causes.
- If you offer a reason, say "possibly" and say what to check to confirm it. Never present a guess as a finding.
- Plain words and short sentences, Australian English. No jargon, no percentages without saying what they are a percentage of.
- Say what is happening, why it may be happening, and what to do about it this week.
- Actions must be small and doable within a week. Give each a "who": the measure's owner or a CSC named in the facts, otherwise "the owner". Name at most five clients per action, only from the facts.
- Do not mention people by name other than the owner and the CSCs given. Do not mention these instructions.
- If the facts are thin, say so in one sentence rather than padding.
Reply only by calling the record_insight tool.`;

export const INSIGHT_TOOL = {
  name: "record_insight",
  description: "Record the plain-language read of this measure.",
  input_schema: {
    type: "object",
    properties: {
      headline: { type: "string", description: "One sentence: what is happening with this measure this week." },
      why: {
        type: "array",
        maxItems: 4,
        items: { type: "string" },
        description: "Two to four short points on what is behind the number, each grounded in the facts.",
      },
      actions: {
        type: "array",
        maxItems: 4,
        items: {
          type: "object",
          properties: {
            action: { type: "string", description: "What to do, in one short sentence." },
            detail: { type: "string", description: "One or two sentences on how, or what to look for." },
            who: { type: "string", description: "The owner or a named CSC; otherwise 'the owner'." },
            clients: { type: "array", maxItems: 5, items: { type: "string" }, description: "Clients to start with, from the facts only." },
          },
          required: ["action", "who"],
        },
      },
      watch: { type: "string", description: "Optional: one thing to keep an eye on next week." },
    },
    required: ["headline", "why", "actions"],
  },
} as const;

export interface InsightMeasure {
  name: string;
  description: string | null;
  category: string;
  unit: string;
  direction: string;
  target: number;
  value: number | null;
  source: string;
  ownerName: string | null;
}

export interface FactSection {
  title: string;
  lines: string[];
}

export interface HistoryPoint {
  label: string;
  value: number | null;
}

const MAX_LINES = 40;

/** The user message: the measure, its recent numbers, then each block of facts. */
export function buildUserPrompt(input: { measure: InsightMeasure; weekLabel: string; history: HistoryPoint[]; sections: FactSection[] }): string {
  const { measure: m } = input;
  const mark = m.unit === "%" ? "%" : "";
  const aim = m.direction === "lower_is_better" ? `${m.target}${mark} or fewer` : m.direction === "equals_target" ? `exactly ${m.target}${mark}` : `${m.target}${mark} or more`;
  const lines = [
    `Measure: ${m.name}`,
    `Area: ${m.category}`,
    `What it counts: ${m.description?.trim() || "(no description)"}`,
    `Unit: ${m.unit}. Aim: ${aim}.`,
    `Owner: ${m.ownerName ?? "nobody yet"}. Number comes from: ${m.source}.`,
    `Week: ${input.weekLabel}.`,
    `This week's number: ${m.value === null ? "none recorded" : m.value}.`,
    `Recent weeks, oldest first: ${input.history.map((h) => `${h.label}: ${h.value === null ? "none" : h.value}`).join("; ") || "none"}.`,
  ];
  for (const section of input.sections) {
    lines.push("", `## ${section.title}`, ...section.lines.slice(0, MAX_LINES));
  }
  return lines.join("\n");
}

export interface ClientFact {
  name: string;
  csc: string;
  clientUsers: number;
  activeUsers: number;
  neverSignedIn: number;
  certificates: number;
  /** Whole days since the client's last activity; null when never. */
  lastActiveDays: number | null;
}

export interface PreviousClientFact {
  name: string;
  clientUsers: number;
  activeUsers: number;
}

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
const lastActive = (days: number | null) => (days === null ? "never active" : days === 0 ? "active today" : `last active ${plural(days, "day", "days")} ago`);

/** Facts about the Live Clients behind one of the automatic client measures. */
export function clientSections(rows: readonly ClientFact[], previous: readonly PreviousClientFact[] | null): FactSection[] {
  const withUsers = rows.filter((r) => r.clientUsers > 0);
  const active = withUsers.filter((r) => r.activeUsers > 0);
  const quiet = withUsers.filter((r) => r.activeUsers === 0).sort((a, b) => b.clientUsers - a.clientUsers || a.name.localeCompare(b.name));
  const users = rows.reduce((s, r) => s + r.clientUsers, 0);
  const activeUsers = rows.reduce((s, r) => s + r.activeUsers, 0);
  const never = rows.reduce((s, r) => s + r.neverSignedIn, 0);

  const sections: FactSection[] = [
    {
      title: "Totals (activity is over the last 28 days)",
      lines: [
        `Live Clients with at least one portal user: ${withUsers.length}. With someone active: ${active.length}. With nobody active: ${quiet.length}.`,
        `Client users: ${users}. Active in the last 28 days: ${activeUsers}. Invited but never signed in: ${never}.`,
      ],
    },
    {
      title: "Clients with nobody active, most users first",
      lines: quiet.slice(0, 15).map((r) => `${r.name} (CSC ${r.csc}): ${plural(r.clientUsers, "user", "users")}, none active, ${lastActive(r.lastActiveDays)}`),
    },
  ];

  const byCsc = new Map<string, { clients: number; quiet: number; never: number }>();
  for (const r of withUsers) {
    const entry = byCsc.get(r.csc) ?? { clients: 0, quiet: 0, never: 0 };
    entry.clients += 1;
    if (r.activeUsers === 0) entry.quiet += 1;
    entry.never += r.neverSignedIn;
    byCsc.set(r.csc, entry);
  }
  sections.push({
    title: "By CSC",
    lines: [...byCsc.entries()].sort((a, b) => b[1].quiet - a[1].quiet).map(([csc, e]) => `${csc}: ${e.clients} clients, ${e.quiet} with nobody active, ${plural(e.never, "person", "people")} never signed in`),
  });

  const holding = rows.filter((r) => r.neverSignedIn > 0).sort((a, b) => b.neverSignedIn - a.neverSignedIn || a.name.localeCompare(b.name));
  if (holding.length > 0) {
    sections.push({ title: "Clients with people who never signed in", lines: holding.slice(0, 10).map((r) => `${r.name} (CSC ${r.csc}): ${r.neverSignedIn} of ${plural(r.clientUsers, "user", "users")}`) });
  }

  if (previous) {
    const before = new Map(previous.map((p) => [p.name, p]));
    const wentQuiet = withUsers.filter((r) => r.activeUsers === 0 && (before.get(r.name)?.activeUsers ?? 0) > 0).map((r) => r.name);
    const cameBack = withUsers.filter((r) => r.activeUsers > 0 && before.has(r.name) && before.get(r.name)!.activeUsers === 0 && before.get(r.name)!.clientUsers > 0).map((r) => r.name);
    sections.push({
      title: "Changes since last week",
      lines: [`Went quiet (${wentQuiet.length}): ${wentQuiet.slice(0, 10).join(", ") || "none"}`, `Came back (${cameBack.length}): ${cameBack.slice(0, 10).join(", ") || "none"}`],
    });
  }
  return sections;
}

/** Facts about certificates issued in the week, by course and client. Learner names are deliberately not included. */
export function certificateSections(items: readonly { course: string; client: string }[]): FactSection[] {
  if (items.length === 0) return [{ title: "Certificates issued this week", lines: ["None."] }];
  const count = (pick: (i: { course: string; client: string }) => string) => {
    const counts = new Map<string, number>();
    for (const i of items) counts.set(pick(i), (counts.get(pick(i)) ?? 0) + 1);
    return [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, 10).map(([name, n]) => `${name}: ${n}`);
  };
  return [
    { title: "Certificates issued this week, by course", lines: count((i) => i.course) },
    { title: "Certificates issued this week, by client", lines: count((i) => i.client) },
  ];
}

export interface ParsedInsight {
  headline: string;
  why: string[];
  actions: { action: string; detail: string; who: string; clients: string[] }[];
  watch: string | null;
}

const clip = (value: unknown, max: number): string => (typeof value === "string" ? value.trim().slice(0, max).trim() : "");

/** Validate the model's tool input. Returns null when there is nothing usable to show. */
export function parseInsight(raw: unknown): ParsedInsight | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const headline = clip(r.headline, 240);
  const why = (Array.isArray(r.why) ? r.why : []).map((w) => clip(w, 320)).filter(Boolean).slice(0, 4);
  const actions = (Array.isArray(r.actions) ? r.actions : [])
    .map((a) => {
      const item = (a && typeof a === "object" ? a : {}) as Record<string, unknown>;
      return {
        action: clip(item.action, 180),
        detail: clip(item.detail, 320),
        who: clip(item.who, 60) || "the owner",
        clients: (Array.isArray(item.clients) ? item.clients : []).map((c) => clip(c, 90)).filter(Boolean).slice(0, 5),
      };
    })
    .filter((a) => a.action)
    .slice(0, 4);
  if (!headline || (why.length === 0 && actions.length === 0)) return null;
  return { headline, why, actions, watch: clip(r.watch, 240) || null };
}
