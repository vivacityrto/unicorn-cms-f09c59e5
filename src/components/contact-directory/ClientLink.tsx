import { ACTIVE_CLIENT_STATUS, clientStatusLabel, type ClientStatusLabelSource } from '@/lib/contactDirectory/clientStatus';

interface Props {
  tenantId: number | null;
  name: string;
  /** The client's status, when known. Anything other than active is shown beside the name. */
  status?: string | null;
  statusOptions?: ClientStatusLabelSource[];
}

/**
 * A client's name that opens the client's page in a new tab, so the team can
 * review (and change) the client's status without losing their place in the
 * directory. Non-active clients are flagged next to the name. A plain anchor
 * (not a router Link) because it always opens a fresh tab.
 */
export function ClientLink({ tenantId, name, status, statusOptions }: Props) {
  const flag =
    status && status !== ACTIVE_CLIENT_STATUS ? (
      <span className="ml-1 text-xs text-muted-foreground">({clientStatusLabel(status, statusOptions).toLowerCase()})</span>
    ) : null;

  if (tenantId == null || !name) return <>{name || '—'}{flag}</>;

  return (
    <>
      <a
        href={`/tenant/${tenantId}`}
        target="_blank"
        rel="noopener noreferrer"
        className="text-primary underline-offset-2 hover:underline"
        aria-label={`Open client ${name} in a new tab`}
        onClick={(e) => e.stopPropagation()}
      >
        {name}
      </a>
      {flag}
    </>
  );
}
