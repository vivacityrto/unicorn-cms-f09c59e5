import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  INSIGHT_TOOL,
  SYSTEM_PROMPT,
  buildUserPrompt,
  certificateSections,
  clientSections,
  parseInsight,
  type ClientFact,
  type InsightMeasure,
} from "./scorecard-insight.ts";

const measure: InsightMeasure = {
  name: "Clients using the portal",
  description: "Share of Live Client RTOs where at least one person used the portal.",
  category: "CST",
  unit: "%",
  direction: "higher_is_better",
  target: 50,
  value: 34.5,
  source: "automatic",
  ownerName: "Angela Connell-Richards",
};

const client = (name: string, over: Partial<ClientFact> = {}): ClientFact => ({
  name, csc: "Sam", clientUsers: 4, activeUsers: 0, neverSignedIn: 0, certificates: 0, lastActiveDays: 40, ...over,
});

describe("buildUserPrompt", () => {
  it("states the measure, the aim in plain words, the week and recent history", () => {
    const text = buildUserPrompt({
      measure,
      weekLabel: "9 to 15 November 2026",
      history: [{ label: "1 Nov", value: 40 }, { label: "8 Nov", value: null }],
      sections: [{ title: "Totals", lines: ["a", "b"] }],
    });
    assert.match(text, /Measure: Clients using the portal/);
    assert.match(text, /Aim: 50% or more\./);
    assert.match(text, /This week's number: 34\.5\./);
    assert.match(text, /1 Nov: 40; 8 Nov: none/);
    assert.match(text, /## Totals\na\nb/);
  });

  it("says when there is no number, rather than inventing one", () => {
    const text = buildUserPrompt({ measure: { ...measure, value: null }, weekLabel: "w", history: [], sections: [] });
    assert.match(text, /none recorded/);
    assert.match(text, /Recent weeks, oldest first: none\./);
  });

  it("caps a long section so the prompt stays small", () => {
    const lines = Array.from({ length: 200 }, (_, i) => `line ${i}`);
    const text = buildUserPrompt({ measure, weekLabel: "w", history: [], sections: [{ title: "Big", lines }] });
    assert.ok(!text.includes("line 40"));
    assert.ok(text.includes("line 39"));
  });
});

describe("clientSections", () => {
  const rows = [
    client("Alpha Training", { clientUsers: 9 }),
    client("Beta College", { clientUsers: 3, lastActiveDays: null }),
    client("Gamma Institute", { clientUsers: 5, activeUsers: 2, neverSignedIn: 1, csc: "Dave" }),
    client("No Users", { clientUsers: 0 }),
  ];

  it("totals clients and users the same way the scorecard does", () => {
    const [totals] = clientSections(rows, null);
    assert.match(totals.lines[0], /with at least one portal user: 3\. With someone active: 1\. With nobody active: 2\./);
    assert.match(totals.lines[1], /Client users: 17\. Active in the last 28 days: 2\. Invited but never signed in: 1\./);
  });

  it("lists quiet clients biggest first, with when they were last active", () => {
    const quiet = clientSections(rows, null)[1];
    assert.deepEqual(quiet.lines, [
      "Alpha Training (CSC Sam): 9 users, none active, last active 40 days ago",
      "Beta College (CSC Sam): 3 users, none active, never active",
    ]);
  });

  it("includes changes since last week only when there is a previous week", () => {
    assert.ok(!clientSections(rows, null).some((s) => s.title === "Changes since last week"));
    const previous = [
      { name: "Alpha Training", clientUsers: 9, activeUsers: 3 },
      { name: "Gamma Institute", clientUsers: 5, activeUsers: 0 },
    ];
    const changes = clientSections(rows, previous).find((s) => s.title === "Changes since last week")!;
    assert.equal(changes.lines[0], "Went quiet (1): Alpha Training");
    assert.equal(changes.lines[1], "Came back (1): Gamma Institute");
  });
});

describe("certificateSections", () => {
  it("counts by course and by client, and never includes learner names", () => {
    const sections = certificateSections([
      { course: "Credential policy", client: "Alpha" },
      { course: "Credential policy", client: "Beta" },
      { course: "Governance basics", client: "Alpha" },
    ]);
    assert.deepEqual(sections[0].lines, ["Credential policy: 2", "Governance basics: 1"]);
    assert.deepEqual(sections[1].lines, ["Alpha: 2", "Beta: 1"]);
  });

  it("says none when nothing was issued", () => {
    assert.deepEqual(certificateSections([])[0].lines, ["None."]);
  });
});

describe("parseInsight", () => {
  const good = {
    headline: "  Fewer clients used the portal this week. ",
    why: ["Alpha Training has nine users and none were active.", ""],
    actions: [{ action: "Call Alpha Training", detail: "Ask what stopped them.", who: "Sam", clients: ["Alpha Training"] }],
    watch: "Beta College",
  };

  it("accepts a well-formed result and trims it", () => {
    const parsed = parseInsight(good);
    assert.equal(parsed?.headline, "Fewer clients used the portal this week.");
    assert.deepEqual(parsed?.why, ["Alpha Training has nine users and none were active."]);
    assert.equal(parsed?.actions[0].who, "Sam");
    assert.equal(parsed?.watch, "Beta College");
  });

  it("rejects anything without a headline or without a reason or action", () => {
    assert.equal(parseInsight(null), null);
    assert.equal(parseInsight("text"), null);
    assert.equal(parseInsight({ ...good, headline: " " }), null);
    assert.equal(parseInsight({ headline: "x", why: [], actions: [] }), null);
  });

  it("caps the number and length of everything, and defaults who", () => {
    const parsed = parseInsight({
      headline: "h".repeat(1000),
      why: ["1", "2", "3", "4", "5", "6"],
      actions: Array.from({ length: 9 }, (_, i) => ({ action: `a${i}`, who: "", clients: ["1", "2", "3", "4", "5", "6", "7"] })),
    });
    assert.equal(parsed?.headline.length, 240);
    assert.equal(parsed?.why.length, 4);
    assert.equal(parsed?.actions.length, 4);
    assert.equal(parsed?.actions[0].who, "the owner");
    assert.equal(parsed?.actions[0].clients.length, 5);
  });

  it("drops actions that have no action text", () => {
    const parsed = parseInsight({ headline: "x", why: ["y"], actions: [{ action: "", who: "Sam" }, { detail: "only detail" }] });
    assert.deepEqual(parsed?.actions, []);
  });
});

describe("the prompt and tool", () => {
  it("forces plain, grounded output", () => {
    assert.match(SYSTEM_PROMPT, /Use only the facts you are given/);
    assert.match(SYSTEM_PROMPT, /possibly/);
    assert.match(SYSTEM_PROMPT, /Australian English/);
    assert.equal(INSIGHT_TOOL.name, "record_insight");
    assert.deepEqual(INSIGHT_TOOL.input_schema.required, ["headline", "why", "actions"]);
  });
});
