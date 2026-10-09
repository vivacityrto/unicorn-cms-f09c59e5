import { useMemo, useState } from 'react';
import { Search, Trash2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { positionTypeLabel, type PositionTypeOption } from '@/lib/roles/positionType';
import { nextSort, sortGroupMembers, type DirectorySort, type DirectorySortKey } from '@/lib/contactDirectory/sortRows';
import { SortableHead } from './SortableHead';
import {
  filterGroupMembers,
  resolveGroupMembers,
  type DirectoryPerson,
  type GroupMemberRef,
  type ResolvedGroupMember,
} from '@/lib/contactGroups/resolveGroupMembers';

/** Show the search box once a list is long enough to need one. */
const SEARCH_THRESHOLD = 10;

interface Props {
  groupName: string;
  members: GroupMemberRef[];
  directory: DirectoryPerson[];
  positionTypeOptions: PositionTypeOption[];
  /** When given, each row gets a "remove from group" button. */
  onRemove?: (member: ResolvedGroupMember) => void;
}

function statusVariant(status: string): 'secondary' | 'outline' | 'destructive' {
  if (status === 'active') return 'secondary';
  if (status === 'missing') return 'destructive';
  return 'outline';
}

/** Read-only list of the people currently in one Contact Directory Group. */
export function GroupMembersPanel({ groupName, members, directory, positionTypeOptions, onRemove }: Props) {
  const [query, setQuery] = useState('');
  const resolved = useMemo(() => resolveGroupMembers(members, directory), [members, directory]);
  const [sort, setSort] = useState<DirectorySort | null>(null);
  const visible = useMemo(() => {
    const sorted = sortGroupMembers(filterGroupMembers(resolved, query), sort, (value) =>
      positionTypeLabel(value, positionTypeOptions),
    );
    // Records that have gone missing stay at the bottom whatever the sort.
    return [...sorted.filter((m) => !m.missing), ...sorted.filter((m) => m.missing)];
  }, [resolved, query, sort, positionTypeOptions]);

  const handleSort = (key: DirectorySortKey) => setSort((current) => nextSort(current, key));

  if (resolved.length === 0) {
    return <p className="px-4 py-3 text-sm text-muted-foreground">This group has no members yet.</p>;
  }

  return (
    <div className="space-y-2 px-4 pb-4">
      {resolved.length > SEARCH_THRESHOLD && (
        <div className="relative max-w-sm">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search this group…"
            aria-label={`Search members of ${groupName}`}
            className="pl-9"
          />
        </div>
      )}

      <div className="max-h-96 overflow-auto rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <SortableHead label="Name" sortKey="name" sort={sort} onSort={handleSort} />
              <SortableHead label="Email" sortKey="email" sort={sort} onSort={handleSort} />
              <SortableHead label="Client" sortKey="client" sort={sort} onSort={handleSort} />
              <SortableHead label="Type" sortKey="source" sort={sort} onSort={handleSort} />
              <SortableHead label="Position" sortKey="position" sort={sort} onSort={handleSort} />
              <SortableHead label="Status" sortKey="status" sort={sort} onSort={handleSort} />
              {onRemove && <TableHead className="w-10" aria-label="Remove" />}
            </TableRow>
          </TableHeader>
          <TableBody>
            {visible.length === 0 ? (
              <TableRow>
                <TableCell colSpan={onRemove ? 7 : 6} className="text-center text-sm text-muted-foreground">
                  No members match "{query}".
                </TableCell>
              </TableRow>
            ) : (
              visible.map((m) => (
                <TableRow key={m.key}>
                  <TableCell className="font-medium">{m.name}</TableCell>
                  <TableCell className="break-all">{m.email || '—'}</TableCell>
                  <TableCell>{m.tenantName || '—'}</TableCell>
                  <TableCell>{m.source === 'user' ? 'User' : 'Contact'}</TableCell>
                  <TableCell>{m.positionType ? positionTypeLabel(m.positionType, positionTypeOptions) : '—'}</TableCell>
                  <TableCell>
                    <Badge variant={statusVariant(m.status)}>{m.status}</Badge>
                  </TableCell>
                  {onRemove && (
                    <TableCell>
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label={`Remove ${m.name} from ${groupName}`}
                        onClick={() => onRemove(m)}
                      >
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </TableCell>
                  )}
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
      <p className="text-xs text-muted-foreground">
        {query ? `${visible.length} of ${resolved.length}` : `${resolved.length}`} member{resolved.length === 1 ? '' : 's'}
      </p>
    </div>
  );
}
