import { mkdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

/**
 * Shared "must target the QA project, never production" safety check for
 * P2-QA suites. Deliberately a small, independent module rather than a
 * shared import from src/test/tenant/rls-suite-guard.ts -- that module is
 * the already-proven P1-C harness, and this suite's own lock/config concerns
 * (its own concurrency group, its own env var names) aren't RLS-specific.
 * A few dozen duplicated lines here is cheaper than any risk to P1-C.
 */
export const QA_PROJECT_REF = "qfpxvumcrnzrjyvqkicq";
export const QA_PROJECT_URL = `https://${QA_PROJECT_REF}.supabase.co`;

export interface QaSuiteEnvironment {
  supabaseUrl: string;
  serviceRole: string;
  projectRef: string;
  lockPath: string;
}

export function readQaSuiteEnvironment(
  env: NodeJS.ProcessEnv = process.env,
): QaSuiteEnvironment {
  return {
    supabaseUrl: env.VITE_SUPABASE_URL ?? env.SUPABASE_URL ?? "",
    serviceRole: env.SUPABASE_SERVICE_ROLE_KEY ?? "",
    projectRef: env.QA_SUPABASE_PROJECT_REF ?? QA_PROJECT_REF,
    lockPath: env.QA_SUITE_LOCK_PATH ?? join(tmpdir(), "unicorn-qa-p2-contract.lock"),
  };
}

export function getQaSuiteConfigurationError(config: QaSuiteEnvironment): string | null {
  if (!config.serviceRole) return null;
  if (config.projectRef !== QA_PROJECT_REF) {
    return `QA_SUPABASE_PROJECT_REF must be ${QA_PROJECT_REF}`;
  }
  if (config.supabaseUrl.replace(/\/$/, "") !== QA_PROJECT_URL) {
    return `P2-QA service-role target must be ${QA_PROJECT_URL}`;
  }
  return null;
}

/**
 * Same-machine lock for local/manual runs. The protected GitHub workflow's
 * `concurrency` group covers cross-run locking; this covers two local
 * Vitest processes racing on one host.
 */
export async function acquireQaSuiteLock(
  lockPath: string,
  timeoutMs = 120_000,
  pollMs = 250,
): Promise<() => Promise<void>> {
  const startedAt = Date.now();
  while (true) {
    try {
      await mkdir(lockPath);
      return async () => {
        await rm(lockPath, { recursive: true, force: true });
      };
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (code !== "EEXIST") throw error;
      if (Date.now() - startedAt >= timeoutMs) {
        throw new Error(
          `Timed out waiting for the P2-QA local lock at ${lockPath}; ` +
            "a concurrent or abandoned qa:contract run may still be active",
        );
      }
      await new Promise((resolve) => setTimeout(resolve, pollMs));
    }
  }
}
