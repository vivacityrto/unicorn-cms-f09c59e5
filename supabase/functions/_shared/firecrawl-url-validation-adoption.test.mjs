/**
 * F-031: every function that forwards a caller- or tenant-configured URL to
 * Firecrawl must validate it with validateExternalScrapeUrl first, and must
 * use the validated/normalized URL (not the raw input) in the actual fetch.
 *
 * Run: node --test supabase/functions/_shared/firecrawl-url-validation-adoption.test.mjs
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const functionsRoot = join(dirname(fileURLToPath(import.meta.url)), "..");

function readFn(name) {
  return readFileSync(join(functionsRoot, name, "index.ts"), "utf8");
}

const MUST_VALIDATE = [
  "research-scrape",
  "research-public-snapshot",
  "research-tas-context",
  "research-enrich-tenant",
];

describe("Firecrawl-forwarded URLs are SSRF-validated", () => {
  for (const name of MUST_VALIDATE) {
    it(`${name} imports and calls validateExternalScrapeUrl`, () => {
      const src = readFn(name);
      assert.match(src, /import\s*{\s*validateExternalScrapeUrl\s*}\s*from\s*"\.\.\/_shared\/safe-fetch-url\.ts"/);
      assert.match(src, /validateExternalScrapeUrl\(/);
    });
  }

  it("research-tas-context enforces training.gov.au on training_gov_url specifically", () => {
    const src = readFn("research-tas-context");
    assert.match(src, /requireHostSuffix:\s*"training\.gov\.au"/);
  });

  it("no function still does raw string-prefix URL formatting before a Firecrawl fetch", () => {
    for (const name of MUST_VALIDATE) {
      const src = readFn(name);
      assert.doesNotMatch(
        src,
        /startsWith\("http"\)\)\s*base\s*=\s*`https:\/\/\$\{base\}`/,
        `${name} still manually prefixes a URL instead of using validateExternalScrapeUrl`,
      );
    }
  });
});
