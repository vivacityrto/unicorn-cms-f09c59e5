import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  FORBIDDEN_BODY_FIELDS,
  SUMMARY_TOOL,
  SYSTEM_PROMPT,
  academySection,
  buildUserPrompt,
  factsText,
  feedSection,
  isGrounded,
  isSurface,
  numbersIn,
  packageSection,
  parseSummary,
  statusReason,
  type PackageRow,
} from "./client-insights.ts";

const today = new Date("2026-11-19T00:00:00Z");
const pkg = (over: Partial<PackageRow> = {}): PackageRow => ({
  package_name: "Ruby RTO Membership",
  is_complete: false,
  hours_total: 28,
  hours_used: 2.5,
  stages_total: 8,
  stages_complete: 0,
  current_stage_shortname: "Setup",
  open_tasks: 4,
  overdue_tasks: 3,
  last_activity_at: "2026-10-12T00:00:00Z",
  status_pill: "stuck",
  ...over,
});

describe("client-insights shared", () => {
  it("only accepts the three surfaces", () => {
    assert.equal(isSurface("home"), true);
    assert.equal(isSurface("packages"), true);
    assert.equal(isSurface("academy"), true);
    assert.equal(isSurface("staff"), false);
    assert.equal(isSurface(undefined), false);
  });

  it("explains a stuck package with the same rules as the status pill", () => {
    assert.equal(statusReason(pkg(), today), "no activity for 38 days and 3 overdue tasks");
    assert.equal(statusReason(pkg({ status_pill: "on_track" }), today), null);
    assert.equal(statusReason(pkg({ status_pill: "stuck", hours_used: 27, last_activity_at: "2026-11-18T00:00:00Z", overdue_tasks: 0 }), today), "96% of hours used");
  });

  it("builds package facts with counts, hours and the reason, and leaves finished packages out", () => {
    const s = packageSection([pkg(), pkg({ package_name: "Old", is_complete: true })], today);
    const text = s.lines.join("\n");
    assert.match(text, /Active packages: 1\./);
    assert.match(text, /0 of 8 stages complete/);
    assert.match(text, /Hours: 2\.5 used of 28, 25\.5 left\./);
    assert.match(text, /Open tasks: 4, overdue: 3\./);
    assert.match(text, /Why it is flagged: no activity for 38 days and 3 overdue tasks\./);
    assert.doesNotMatch(text, /Old/);
    assert.deepEqual(packageSection([], today).lines, ["No active packages."]);
  });

  it("builds academy facts without any person's name and says when nobody has started", () => {
    const totals = { learners: 14, chosen: 103, finished: 57, lessons_completed: 478, minutes: 6000, active_30d: 4, not_counted: { enrolments: 304, finished: 3 } };
    const text = academySection({ totals, stalledCount: 20 }).lines.join("\n");
    assert.match(text, /14 team members chose 103 courses and finished 57\./);
    assert.match(text, /100 hours of learning/);
    assert.match(text, /304 other courses were added by Vivacity and are not counted\./);
    assert.deepEqual(academySection({ totals: { ...totals, chosen: 0 }, stalledCount: 0 }).lines, ["Nobody on the team has chosen an Academy course yet."]);
  });

  it("finds numbers and checks every number in the summary against the facts", () => {
    assert.deepEqual(numbersIn("3 of 8 stages, 25.5 hours left"), ["3", "8", "25.5"]);
    const facts = factsText("packages", [packageSection([pkg()], today), feedSection({ needsAttention: 3, comingUp: 5 })]);
    const ok = { headline: "0 of 8 stages are complete.", points: ["You have 25.5 hours left.", "3 tasks are overdue."], next_step: "Book a call." };
    assert.equal(isGrounded(ok, facts), true);
    assert.equal(isGrounded({ ...ok, points: ["You have 40 hours left."] }, facts), false);
    assert.equal(isGrounded({ ...ok, next_step: "Finish within 7 days." }, facts), false);
  });

  it("validates and trims the tool output, and rejects an empty one", () => {
    assert.equal(parseSummary(null), null);
    assert.equal(parseSummary({ headline: "", points: ["x"], next_step: "y" }), null);
    assert.equal(parseSummary({ headline: "Hi", points: [], next_step: "y" }), null);
    const parsed = parseSummary({ headline: "  Where things stand ", points: ["a", "b", "c", "d"], next_step: "Do this" });
    assert.deepEqual(parsed, { headline: "Where things stand", points: ["a", "b", "c"], next_step: "Do this" });
  });

  it("tells the model to stay inside the facts and out of compliance judgements", () => {
    assert.match(SYSTEM_PROMPT, /Use only the facts you are given/);
    assert.match(SYSTEM_PROMPT, /Do not interpret the Standards for RTOs/);
    assert.match(SYSTEM_PROMPT, /Reply only by calling the record_summary tool/);
    assert.equal(SUMMARY_TOOL.name, "record_summary");
    assert.match(buildUserPrompt("home", [packageSection([], today)]), /home page/);
  });

  it("lists the scope fields a client may never send", () => {
    for (const f of ["tenant_id", "client_id", "package_id", "user_id"]) assert.ok((FORBIDDEN_BODY_FIELDS as readonly string[]).includes(f));
  });
});
