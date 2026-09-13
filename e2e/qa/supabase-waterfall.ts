import type { Page, Request, Response } from "@playwright/test";

type SupabaseRequestRecord = {
  method: string;
  path: string;
  status: number | null;
  durationMs: number | null;
  requestBytes: number;
  responseBytes: number | null;
  failed: boolean;
};

type PendingRequest = {
  startedAt: number;
  record: SupabaseRequestRecord;
};

const SUPABASE_HOST = /(^|\.)supabase\.co$/i;
const UUID_SEGMENT = /[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/gi;

function isSupabaseRequest(request: Request): boolean {
  return SUPABASE_HOST.test(new URL(request.url()).hostname);
}

function redactedPath(request: Request): string {
  return new URL(request.url()).pathname.replace(UUID_SEGMENT, "<uuid>");
}

function byteLength(value: string | null): number {
  return value === null ? 0 : new TextEncoder().encode(value).byteLength;
}

export function startSupabaseWaterfall(page: Page, label: string) {
  const pending = new Map<Request, PendingRequest>();
  const completed: SupabaseRequestRecord[] = [];

  const onRequest = (request: Request) => {
    if (!isSupabaseRequest(request)) return;

    pending.set(request, {
      startedAt: performance.now(),
      record: {
        method: request.method(),
        path: redactedPath(request),
        status: null,
        durationMs: null,
        requestBytes: byteLength(request.postData()),
        responseBytes: null,
        failed: false,
      },
    });
  };

  const complete = (request: Request, response: Response | null, failed: boolean) => {
    const entry = pending.get(request);
    if (!entry) return;

    entry.record.status = response?.status() ?? null;
    entry.record.durationMs = Math.round(performance.now() - entry.startedAt);
    entry.record.responseBytes = response
      ? Number.parseInt(response.headers()["content-length"] ?? "", 10) || null
      : null;
    entry.record.failed = failed;
    completed.push(entry.record);
    pending.delete(request);
  };

  const onResponse = (response: Response) => {
    complete(response.request(), response, false);
  };

  const onRequestFailed = (request: Request) => {
    complete(request, null, true);
  };

  page.on("request", onRequest);
  page.on("response", onResponse);
  page.on("requestfailed", onRequestFailed);

  return () => {
    page.off("request", onRequest);
    page.off("response", onResponse);
    page.off("requestfailed", onRequestFailed);

    const unfinished = [...pending.values()].map(({ record, startedAt }) => ({
      ...record,
      durationMs: Math.round(performance.now() - startedAt),
    }));

    console.log(
      `[tom-p0-waterfall] ${label} ${JSON.stringify({
        requestCount: completed.length + unfinished.length,
        completed,
        unfinished,
      })}`,
    );
  };
}
