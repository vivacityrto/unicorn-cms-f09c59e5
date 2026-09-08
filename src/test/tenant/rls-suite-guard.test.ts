import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import {
  acquireRlsSuiteLock,
  getRlsSuiteConfigurationError,
  QA_PROJECT_REF,
  QA_PROJECT_URL,
  readRlsSuiteEnvironment,
} from "./rls-suite-guard";

describe("P1-C QA target guard", () => {
  it("fails closed when a service-role key targets production", () => {
    const config = readRlsSuiteEnvironment({
      SUPABASE_URL: "https://yxkgdalkbrriasiyyrwk.supabase.co",
      SUPABASE_SERVICE_ROLE_KEY: "redacted-test-value",
    });
    expect(getRlsSuiteConfigurationError(config)).toMatch(/must be https:\/\/qfpx/);
  });

  it("accepts only the allowlisted QA project", () => {
    const config = readRlsSuiteEnvironment({
      VITE_SUPABASE_URL: QA_PROJECT_URL,
      VITE_SUPABASE_PUBLISHABLE_KEY: "publishable-test-value",
      SUPABASE_SERVICE_ROLE_KEY: "redacted-test-value",
      QA_SUPABASE_PROJECT_REF: QA_PROJECT_REF,
    });
    expect(getRlsSuiteConfigurationError(config)).toBeNull();
  });

  it("serializes same-host runs with an atomic lock", async () => {
    const root = await mkdtemp(join(tmpdir(), "unicorn-p1c-lock-test-"));
    const lockPath = join(root, "lock");
    const release = await acquireRlsSuiteLock(lockPath);
    await expect(acquireRlsSuiteLock(lockPath, 10, 1)).rejects.toThrow(/Timed out/);
    await release();
    await expect(mkdir(lockPath)).resolves.toBeUndefined();
    await rm(root, { recursive: true, force: true });
  });
});
