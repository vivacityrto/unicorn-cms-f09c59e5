/**
 * Resolve a tenant ID from the current route, if the route embeds one.
 * Every `/tenant/:id...` variant, `/tenant-detail/:id`, `/client-portal/:id/documents`,
 * and `/admin/package/:id/tenant/:id...` share a `/<prefix>/<tenantId>` shape
 * once the fixed prefix is stripped, so a small ordered list of prefix
 * regexes covers every current route.
 */
export function resolveTenantIdFromPath(pathname: string): number | null {
  const patterns = [
    /^\/tenant\/(\d+)/,
    /^\/tenant-detail\/(\d+)/,
    /^\/client-portal\/(\d+)\/documents/,
    /^\/admin\/package\/\d+\/tenant\/(\d+)/,
  ];
  for (const pattern of patterns) {
    const match = pathname.match(pattern);
    if (match) {
      return parseInt(match[1], 10);
    }
  }
  return null;
}
