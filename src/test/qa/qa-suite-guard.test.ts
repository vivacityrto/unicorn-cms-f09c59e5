import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import {
  acquireQaSuiteLock,
  getQaSuiteConfigurationError,
  QA_PROJECT_REF,
  QA_PROJECT_URL,
  readQaSuiteEnvironment,
} from "./qa-suite-guard";

describe("P2-QA target guard", () => {
  it("fails closed when a service-role key targets production", () => {
    const config = readQaSuiteEnvironment({
      SUPABASE_URL: "https://yxkgdalkbrriasiyyrwk.supabase.co",
      SUPABASE_SERVICE_ROLE_KEY: "redacted-test-value",
    });
    expect(getQaSuiteConfigurationError(config)).toMatch(/must be https:\/\/qfpx/);
  });

  it("accepts only the allowlisted QA project", () => {
    const config = readQaSuiteEnvironment({
      VITE_SUPABASE_URL: QA_PROJECT_URL,
      SUPABASE_SERVICE_ROLE_KEY: "redacted-test-value",
      QA_SUPABASE_PROJECT_REF: QA_PROJECT_REF,
    });
    expect(getQaSuiteConfigurationError(config)).toBeNull();
  });

  it("is a no-op when no service-role key is configured (local dev without QA secrets)", () => {
    const config = readQaSuiteEnvironment({});
    expect(getQaSuiteConfigurationError(config)).toBeNull();
  });

  it("serializes same-host runs with an atomic lock", async () => {
    const root = await mkdtemp(join(tmpdir(), "unicorn-p2-contract-lock-test-"));
    const lockPath = join(root, "lock");
    const release = await acquireQaSuiteLock(lockPath);
    await expect(acquireQaSuiteLock(lockPath, 10, 1)).rejects.toThrow(/Timed out/);
    await release();
    await expect(mkdir(lockPath)).resolves.toBeUndefined();
    await rm(root, { recursive: true, force: true });
  });
});
