/** Return true only for PostgREST/Postgres errors proving the new table is not deployed yet. */
export function isRockMilestoneSchemaUnavailable(error: unknown): boolean {
  if (!error || typeof error !== 'object' || !('code' in error)) return false;
  const code = (error as { code?: unknown }).code;
  return code === 'PGRST205' || code === '42P01';
}
