/**
 * Unit + source-inspection tests for the outbound-email hardening.
 *
 * Run: node --test supabase/functions/_shared/email-hardening.test.mjs
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const functionsRoot = join(here, "..");

function read(rel) {
  return readFileSync(join(functionsRoot, rel), "utf8");
}

function escapeHtml(value) {
  if (value === null || value === undefined) return "";
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function constantTimeEqual(a, b) {
  const enc = new TextEncoder();
  const ab = enc.encode(a);
  const bb = enc.encode(b);
  const len = Math.max(ab.length, bb.length, 1);
  const pa = new Uint8Array(len);
  const pb = new Uint8Array(len);
  pa.set(ab);
  pb.set(bb);
  let diff = ab.length ^ bb.length;
  for (let i = 0; i < len; i++) diff |= pa[i] ^ pb[i];
  return diff === 0;
}

function isSafeRelativePath(path) {
  if (typeof path !== "string" || path.length === 0 || path.length > 512) return false;
  if (!path.startsWith("/")) return false;
  if (path.startsWith("//")) return false;
  if (path.includes("://")) return false;
  if (path.includes("\\")) return false;
  if (path.includes("\0") || path.includes("\r") || path.includes("\n")) return false;
  return true;
}

function allowedOriginsFromAppBaseUrl(appBaseUrl) {
  const fallback = "https://unicorn-cms.au";
  const raw = (appBaseUrl && appBaseUrl.trim()) || fallback;
  const origins = new Set();
  const addFrom = (value) => {
    try {
      const url = new URL(value);
      if (url.protocol !== "https:" && url.protocol !== "http:") return;
      origins.add(url.origin);
      const host = url.hostname;
      if (host.startsWith("www.")) origins.add(`${url.protocol}//${host.slice(4)}`);
      else if (host.includes(".")) origins.add(`${url.protocol}//www.${host}`);
    } catch {
      /* ignore */
    }
  };
  addFrom(raw);
  if (origins.size === 0) addFrom(fallback);
  return [...origins];
}

describe("escapeHtml", () => {
  it("escapes markup and quotes", () => {
    assert.equal(
      escapeHtml(`<img src=x onerror="alert(1)">`),
      "&lt;img src=x onerror=&quot;alert(1)&quot;&gt;",
    );
    assert.equal(escapeHtml("a & b"), "a &amp; b");
    assert.equal(escapeHtml("it's"), "it&#39;s");
    assert.equal(escapeHtml(null), "");
  });

  it("matches the shared helper source", () => {
    const src = read("_shared/escape-html.ts");
    assert.match(src, /export function escapeHtml/);
    assert.match(src, /&amp;/);
    assert.match(src, /&lt;/);
    assert.match(src, /&#39;/);
  });
});

describe("constantTimeEqual", () => {
  it("accepts equal secrets and rejects mismatches", () => {
    assert.equal(constantTimeEqual("abc", "abc"), true);
    assert.equal(constantTimeEqual("abc", "abd"), false);
    assert.equal(constantTimeEqual("abc", "ab"), false);
    assert.equal(constantTimeEqual("", ""), true);
  });
});

describe("relative path + APP_BASE_URL construction", () => {
  it("rejects protocol-relative, absolute, and backslash paths", () => {
    assert.equal(isSafeRelativePath("/tasks/1"), true);
    assert.equal(isSafeRelativePath("/tenant/12?tab=actions"), true);
    assert.equal(isSafeRelativePath("https://evil.example/phish"), false);
    assert.equal(isSafeRelativePath("//evil.example/phish"), false);
    assert.equal(isSafeRelativePath("/redirect?url=https://evil.example"), false);
    assert.equal(isSafeRelativePath("/\\evil"), false);
    assert.equal(isSafeRelativePath("tasks/1"), false);
    assert.equal(isSafeRelativePath("/tasks\n/1"), false);
  });

  it("email-urls.ts constructs from APP_BASE_URL and never trusts a whole URL", () => {
    const src = read("_shared/email-urls.ts");
    assert.match(src, /export function resolveEmailUrl/);
    assert.match(src, /isSafeRelativePath/);
    assert.match(src, /:\/\//);
    assert.match(src, /task_url/);
    assert.match(src, /meeting_url/);
    assert.match(src, /dashboard_url/);
    assert.match(src, /invite_url/);
    assert.match(src, /action_link/);
    assert.match(src, /redirect_to/);
  });
});

describe("CORS allowlist", () => {
  it("derives apex + www from APP_BASE_URL and nothing else", () => {
    const origins = allowedOriginsFromAppBaseUrl("https://unicorn-cms.au");
    assert.ok(origins.includes("https://unicorn-cms.au"));
    assert.ok(origins.includes("https://www.unicorn-cms.au"));
    assert.ok(!origins.includes("*"));
    assert.ok(!origins.includes("https://evil.example"));
  });

  it("shared cors helper no longer documents * as the email path", () => {
    const src = read("_shared/cors.ts");
    assert.match(src, /allowedOriginsFromAppBaseUrl/);
    assert.match(src, /corsHeadersForOrigin/);
    assert.match(src, /APP_BASE_URL/);
  });
});

const EMAIL_FNS = [
  {
    path: "send-notification-email/index.ts",
    mode: "internal",
  },
  {
    path: "send-automated-email/index.ts",
    mode: "internal",
  },
  {
    path: "send-staff-onboarding-email/index.ts",
    mode: "permission",
    feature: "admin.team_users.manage",
  },
  {
    path: "send-enhanced-email/index.ts",
    mode: "permission",
    feature: "admin.team_users.manage",
  },
  {
    path: "send-mailgun-template/index.ts",
    mode: "permission",
    feature: "admin.team_users.manage",
  },
  {
    path: "send-test-email/index.ts",
    mode: "super_admin",
  },
];

describe("requireCaller gates on every outbound email function", () => {
  for (const fn of EMAIL_FNS) {
    it(`${fn.path} calls requireCaller`, () => {
      const src = read(fn.path);
      assert.match(src, /from ["']\.\.\/_shared\/requireCaller\.ts["']/);
      assert.match(src, /requireCaller\(/);
      assert.doesNotMatch(src, /Access-Control-Allow-Origin["']:\s*["']\*/);
      if (fn.mode === "internal") {
        assert.match(src, /kind:\s*["']internal["']/);
      } else if (fn.mode === "super_admin") {
        assert.match(src, /kind:\s*["']super_admin["']/);
      } else {
        assert.match(src, /kind:\s*["']permission["']/);
        assert.match(src, new RegExp(`featureKey:\\s*["']${fn.feature}["']`));
      }
    });
  }
});

describe("sender identity is env-only", () => {
  it("send-mailgun-template rejects fromOverride", () => {
    const src = read("send-mailgun-template/index.ts");
    assert.match(src, /fromOverride is not accepted/);
    assert.match(src, /envFromAddress\(/);
    assert.doesNotMatch(src, /formData\.append\(\s*["']from["'],\s*fromOverride/);
  });

  it("send-enhanced-email rejects overrides.from", () => {
    const src = read("send-enhanced-email/index.ts");
    assert.match(src, /overrides\.from is not accepted/);
    assert.match(src, /envFromAddress\(/);
    assert.doesNotMatch(src, /input\.overrides\?\.from/);
    assert.doesNotMatch(src, /template\.from_address/);
  });

  it("send-automated-email no longer uses auditor_name as From", () => {
    const src = read("send-automated-email/index.ts");
    assert.match(src, /envFromAddress\(/);
    assert.doesNotMatch(src, /fromName \|\| MAILGUN_FROM_NAME/);
    assert.doesNotMatch(src, /\$\{auditor_name\} — Vivacity/);
  });
});

describe("caller-supplied destination URLs are not rendered", () => {
  it("send-notification-email builds links via resolveEmailUrl", () => {
    const src = read("send-notification-email/index.ts");
    assert.match(src, /resolveEmailUrl\(\s*["']task_url["']/);
    assert.match(src, /resolveEmailUrl\(\s*["']meeting_url["']/);
    assert.match(src, /resolveEmailUrl\(\s*["']dashboard_url["']/);
    assert.doesNotMatch(src, /href="\$\{data\.task_url\}"/);
    assert.doesNotMatch(src, /href="\$\{data\.meeting_url\}"/);
    assert.doesNotMatch(src, /href="\$\{data\.dashboard_url\}"/);
  });

  it("send-automated-email does not interpolate payload meeting_url", () => {
    const src = read("send-automated-email/index.ts");
    assert.doesNotMatch(src, /href="\$\{meeting_url\}"/);
    assert.match(src, /resolveEmailUrl\(\s*["']meeting_url["']/);
  });

  it("send-enhanced-email and send-mailgun-template sanitize merge vars", () => {
    assert.match(read("send-enhanced-email/index.ts"), /sanitizeMergeVars\(/);
    assert.match(read("send-mailgun-template/index.ts"), /sanitizeMergeVars\(/);
  });
});

describe("HTML escaping is applied", () => {
  it("shared escapeHtml is imported by every email body builder", () => {
    for (const fn of [
      "send-notification-email/index.ts",
      "send-automated-email/index.ts",
      "send-staff-onboarding-email/index.ts",
      "send-enhanced-email/index.ts",
      "send-test-email/index.ts",
    ]) {
      const src = read(fn);
      assert.match(src, /escapeHtml/, `${fn} should use escapeHtml`);
    }
    assert.match(read("send-mailgun-template/index.ts"), /sanitizeMergeVars/);
  });
});

describe("retired send-test-email UUID copies", () => {
  it("stub returns FUNCTION_RETIRED 410", () => {
    const src = read("_retired/send-test-email-stub/index.ts");
    assert.match(src, /FUNCTION_RETIRED/);
    assert.match(src, /status:\s*410/);
  });
});
