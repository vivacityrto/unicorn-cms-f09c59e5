/**
 * Response Helpers for Edge Functions
 * 
 * Provides standardised response formatting with CORS support.
 * 
 * Usage:
 * ```typescript
 * import { jsonOk, jsonError, handleCors, corsHeaders } from "../_shared/response-helpers.ts";
 * 
 * // Handle CORS preflight
 * if (req.method === "OPTIONS") return handleCors();
 * 
 * // Success response
 * return jsonOk({ user: userData });
 * 
 * // Error response
 * return jsonError(401, "UNAUTHORIZED", "Invalid token");
 * ```
 */

/**
 * Standard CORS headers for all edge functions.
 * Includes support for modern Supabase client headers.
 */
export const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": 
    "authorization, x-client-info, apikey, content-type, " +
    "x-supabase-client-platform, x-supabase-client-platform-version, " +
    "x-supabase-client-runtime, x-supabase-client-runtime-version",
  "Access-Control-Allow-Methods": "GET, POST, PUT, PATCH, DELETE, OPTIONS",
};

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
 * Handle CORS preflight requests.
 * 
 * @returns Response with CORS headers and 200 status
 */
export function handleCors(): Response {
  return new Response("ok", { headers: corsHeaders });
}

/**
 * Create a successful JSON response.
 * 
 * @param data - The data to include in the response
 * @param status - HTTP status code (default: 200)
 * @returns Response with JSON body and CORS headers
 */
export function jsonOk<T>(data: T, status = 200): Response {
  const body: SuccessResponse<T> = {
    ok: true,
    data,
  };

  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
      ...corsHeaders,
    },
  });
}

/**
 * Create an error JSON response.
 * 
 * @param status - HTTP status code
 * @param code - Error code (e.g., "UNAUTHORIZED", "NOT_FOUND")
 * @param detail - Optional human-readable error message
 * @returns Response with JSON body and CORS headers
 */
export function jsonError(status: number, code: string, detail?: string): Response {
  const body: ErrorResponse = {
    ok: false,
    code,
    detail,
  };

  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
      ...corsHeaders,
    },
  });
}

/**
 * Create a raw JSON response without the ok/data wrapper.
 * Useful for compatibility with existing API contracts.
 * 
 * @param data - The data to serialize
 * @param status - HTTP status code (default: 200)
 * @returns Response with JSON body and CORS headers
 */
export function jsonRaw<T>(data: T, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json",
      ...corsHeaders,
    },
  });
}

/**
 * Common error responses for reuse.
 */
export const CommonErrors = {
  unauthorized: () => jsonError(401, "UNAUTHORIZED", "Authentication required"),
  forbidden: () => jsonError(403, "FORBIDDEN", "Access denied"),
  notFound: (entity = "Resource") => jsonError(404, "NOT_FOUND", `${entity} not found`),
  badRequest: (detail: string) => jsonError(400, "BAD_REQUEST", detail),
  methodNotAllowed: () => jsonError(405, "METHOD_NOT_ALLOWED", "Method not allowed"),
  internalError: (detail = "An unexpected error occurred") => 
    jsonError(500, "INTERNAL_ERROR", detail),
};
