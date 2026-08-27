/**
 * F-031: SSRF-safe URL validator used by research-scrape,
 * research-public-snapshot, research-tas-context, research-enrich-tenant
 * before any Firecrawl request goes out.
 *
 * Run: node --test supabase/functions/_shared/safe-fetch-url.test.mjs
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { validateExternalScrapeUrl } from "./safe-fetch-url.ts";

describe("validateExternalScrapeUrl", () => {
  it("accepts a plain https URL", () => {
    const result = validateExternalScrapeUrl("https://example.com/courses");
    assert.equal(result.ok, true);
    assert.equal(result.url, "https://example.com/courses");
  });

  it("defaults a bare domain to https", () => {
    const result = validateExternalScrapeUrl("example.com");
    assert.equal(result.ok, true);
    assert.equal(result.url, "https://example.com/");
  });

  it("rejects http:// (non-HTTPS)", () => {
    const result = validateExternalScrapeUrl("http://example.com");
    assert.equal(result.ok, false);
  });

  it("rejects embedded credentials", () => {
    const result = validateExternalScrapeUrl("https://user:pass@example.com");
    assert.equal(result.ok, false);
  });

  it("rejects localhost", () => {
    assert.equal(validateExternalScrapeUrl("https://localhost/").ok, false);
    assert.equal(validateExternalScrapeUrl("https://foo.localhost/").ok, false);
    assert.equal(validateExternalScrapeUrl("https://localhost./").ok, false);
  });

  it("rejects loopback and private IPv4 literals", () => {
    for (const host of ["127.0.0.1", "10.1.2.3", "172.16.0.5", "192.168.1.1", "0.0.0.0"]) {
      const result = validateExternalScrapeUrl(`https://${host}/`);
      assert.equal(result.ok, false, `expected ${host} to be rejected`);
    }
  });

  it("rejects the AWS/GCP metadata address and link-local range", () => {
    assert.equal(validateExternalScrapeUrl("https://169.254.169.254/latest/meta-data").ok, false);
    assert.equal(validateExternalScrapeUrl("https://169.254.1.1/").ok, false);
  });

  it("rejects the cloud metadata hostname", () => {
    assert.equal(validateExternalScrapeUrl("https://metadata.google.internal/").ok, false);
    assert.equal(validateExternalScrapeUrl("https://metadata.google.internal./").ok, false);
  });

  it("rejects IPv6 loopback and link-local/unique-local literals", () => {
    assert.equal(validateExternalScrapeUrl("https://[::1]/").ok, false);
    assert.equal(validateExternalScrapeUrl("https://[fe80::1]/").ok, false);
    assert.equal(validateExternalScrapeUrl("https://[fd00::1]/").ok, false);
  });

  it("rejects IPv4-mapped IPv6 literals", () => {
    for (const host of ["::ffff:127.0.0.1", "::ffff:10.1.2.3", "::ffff:169.254.169.254"]) {
      assert.equal(validateExternalScrapeUrl(`https://[${host}]/`).ok, false, `expected ${host} to be rejected`);
    }
  });

  it("accepts a public IPv4 literal", () => {
    assert.equal(validateExternalScrapeUrl("https://8.8.8.8/").ok, true);
  });

  it("rejects a malformed URL", () => {
    assert.equal(validateExternalScrapeUrl("not a url").ok, false);
    assert.equal(validateExternalScrapeUrl("").ok, false);
  });

  describe("requireHostSuffix (training.gov.au enforcement)", () => {
    it("accepts the exact host and subdomains", () => {
      assert.equal(
        validateExternalScrapeUrl("https://training.gov.au/Search", { requireHostSuffix: "training.gov.au" }).ok,
        true,
      );
      assert.equal(
        validateExternalScrapeUrl("https://ws.training.gov.au/x", { requireHostSuffix: "training.gov.au" }).ok,
        true,
      );
    });

    it("rejects a look-alike host", () => {
      const result = validateExternalScrapeUrl("https://training.gov.au.evil.example/", {
        requireHostSuffix: "training.gov.au",
      });
      assert.equal(result.ok, false);
    });

    it("rejects an unrelated host", () => {
      const result = validateExternalScrapeUrl("https://example.com/", { requireHostSuffix: "training.gov.au" });
      assert.equal(result.ok, false);
    });
  });
});
