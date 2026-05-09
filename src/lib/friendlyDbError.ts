/**
 * Map any backend / Postgres error to a single user-facing message and log
 * the technical detail to the console for debugging. Mutation `onError`
 * handlers should pass the raw error here instead of surfacing `e.message`.
 */
export const FRIENDLY_DB_ERROR_MESSAGE =
  "This action couldn't be completed. Please contact support if this continues.";

export function friendlyDbError(err: unknown, context: string): string {
  // Preserve the technical detail for engineers / future error tracker.
  // eslint-disable-next-line no-console
  console.error(`[${context}]`, err);
  return FRIENDLY_DB_ERROR_MESSAGE;
}
