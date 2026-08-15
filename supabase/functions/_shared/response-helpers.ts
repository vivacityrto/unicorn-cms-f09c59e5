/**
 * Response Helpers for Edge Functions
 *
 * Provides standardised response formatting with allowlisted CORS support.
 *
 * Usage:
 * ```typescript
 * import { jsonOk, jsonError, handleCors } from "../_shared/response-helpers.ts";
 *
 * if (req.method === "OPTIONS") return handleCors(req);
 * return jsonOk(req, { user: userData });
 * return jsonError(req, 401, "UNAUTHORIZED", "Invalid token");
 * ```
 */

import { corsHeaders, handleCors } from "./cors.ts";

export { corsHeaders, handleCors };

/**
 * Standard success response structure.
 */
interface SuccessResponse<T = unknown> {
  ok: true;
  data: T;
}

/**
 * Standard error response structure.
 */
interface ErrorResponse {
  ok: false;
  code: string;
  detail?: string;
}

/**
 * Create a successful JSON response.
 */
export function jsonOk<T>(req: Request, data: T, status = 200): Response {
  const body: SuccessResponse<T> = {
    ok: true,
    data,
  };

  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
      ...corsHeaders(req),
    },
  });
}

/**
 * Create an error JSON response.
 */
export function jsonError(
  req: Request,
  status: number,
  code: string,
  detail?: string,
): Response {
  const body: ErrorResponse = {
    ok: false,
    code,
    detail,
  };

  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
      ...corsHeaders(req),
    },
  });
}

/**
 * Create a raw JSON response without the ok/data wrapper.
 */
export function jsonRaw<T>(req: Request, data: T, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
      ...corsHeaders(req),
    },
  });
}

/**
 * Common error responses for reuse.
 */
export const CommonErrors = {
  unauthorized: (req: Request) =>
    jsonError(req, 401, "UNAUTHORIZED", "Authentication required"),
  forbidden: (req: Request) => jsonError(req, 403, "FORBIDDEN", "Access denied"),
  notFound: (req: Request, entity = "Resource") =>
    jsonError(req, 404, "NOT_FOUND", `${entity} not found`),
  badRequest: (req: Request, detail: string) =>
    jsonError(req, 400, "BAD_REQUEST", detail),
  methodNotAllowed: (req: Request) =>
    jsonError(req, 405, "METHOD_NOT_ALLOWED", "Method not allowed"),
  internalError: (req: Request, detail = "An unexpected error occurred") =>
    jsonError(req, 500, "INTERNAL_ERROR", detail),
};
