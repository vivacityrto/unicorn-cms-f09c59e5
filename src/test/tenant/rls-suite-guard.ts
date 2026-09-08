import { mkdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

/** The only hosted target permitted to receive P1-C fixture writes. */
export const QA_PROJECT_REF = "qfpxvumcrnzrjyvqkicq";
export const QA_PROJECT_URL = `https://${QA_PROJECT_REF}.supabase.co`;

export interface RlsSuiteEnvironment {
  supabaseUrl: string;
  supabaseAnon: string;
  serviceRole: string;
  projectRef: string;
  lockPath: string;
}

export function readRlsSuiteEnvironment(
  env: NodeJS.ProcessEnv = process.env,
): RlsSuiteEnvironment {
  return {
    supabaseUrl:
      env.VITE_SUPABASE_URL ?? env.SUPABASE_URL ?? "",
    supabaseAnon:
      env.VITE_SUPABASE_ANON_KEY ??
      env.VITE_SUPABASE_PUBLISHABLE_KEY ??
      env.SUPABASE_PUBLISHABLE_KEY ??
      "",
    serviceRole: env.SUPABASE_SERVICE_ROLE_KEY ?? "",
    projectRef: env.QA_SUPABASE_PROJECT_REF ?? QA_PROJECT_REF,
    lockPath:
      env.RLS_SUITE_LOCK_PATH ?? join(tmpdir(), "unicorn-qa-p1c.lock"),
  };
}

export function getRlsSuiteConfigurationError(
  config: RlsSuiteEnvironment,
): string | null {
  if (!config.serviceRole) return null;
  if (config.projectRef !== QA_PROJECT_REF) {
    return `QA_SUPABASE_PROJECT_REF must be ${QA_PROJECT_REF}`;
  }
  if (config.supabaseUrl.replace(/\/$/, "") !== QA_PROJECT_URL) {
    return `P1-C service-role target must be ${QA_PROJECT_URL}`;
  }
  return null;
}

/**
 * Acquire a same-machine lock. The protected GitHub workflow supplies the
 * cross-run project lock through `concurrency`; this lock covers local/manual
 * runs and protects against two Vitest processes on one host.
 */
export async function acquireRlsSuiteLock(
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
          `Timed out waiting for the P1-C local lock at ${lockPath}; ` +
            "a concurrent or abandoned isolation run may still be active",
        );
      }
      await new Promise((resolve) => setTimeout(resolve, pollMs));
    }
  }
}
