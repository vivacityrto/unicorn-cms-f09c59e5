import { useMemo, useState } from 'react';
import { Archive, RotateCcw, Search, Trash2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { useArchivedRocks } from '@/hooks/useRockLifecycle';
import { formatDate } from '@/utils/rockPanelFormat';
import { LEVEL_LABEL } from '@/utils/rockEditor/rules';
import type { RockLevel } from '@/types/eos';

interface ArchivedRocksPanelProps {
  onRestore: (rockId: string) => void;
  onDelete: (rockId: string) => void;
  getUserName?: (userId: string) => string | null;
}

/** Archived Rocks, newest first, with who archived each and a way back. */
export function ArchivedRocksPanel({ onRestore, onDelete, getUserName }: ArchivedRocksPanelProps) {
  const { data, isLoading, isError, error } = useArchivedRocks();
  const [query, setQuery] = useState('');

  const rocks = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return (data ?? []).filter(r => !needle || r.title.toLowerCase().includes(needle));
  }, [data, query]);

  if (isLoading) return <p className="py-8 text-center text-sm text-muted-foreground" role="status">Loading archived Rocks…</p>;
  if (isError) return <p className="py-8 text-center text-sm text-destructive" role="alert">Could not load archived Rocks: {(error as Error).message}</p>;

  if ((data ?? []).length === 0) {
    return (
      <Card className="p-8 text-center">
        <Archive className="mx-auto mb-4 h-12 w-12 text-muted-foreground" aria-hidden="true" />
        <h3 className="mb-2 text-lg font-semibold">Nothing archived</h3>
        <p className="text-muted-foreground">Archived Rocks are kept here and can be restored at any time.</p>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <div className="relative max-w-sm">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
        <Input value={query} onChange={e => setQuery(e.target.value)} placeholder="Search archived Rocks" aria-label="Search archived Rocks" className="pl-9" />
      </div>
      {rocks.length === 0 ? (
        <p className="py-6 text-center text-sm text-muted-foreground">No archived Rock matches “{query}”.</p>
      ) : (
        <ul className="space-y-2">
          {rocks.map(rock => {
            const by = rock.archivedBy ? getUserName?.(rock.archivedBy) : null;
            return (
              <li key={rock.id}>
                <Card className="flex flex-wrap items-center gap-3 p-3 sm:p-4">
                  <div className="min-w-0 flex-1">
                    <p className="break-words font-medium">{rock.title}</p>
                    <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
                      <Badge variant="secondary" className="text-xs">{LEVEL_LABEL[rock.level as RockLevel] ?? rock.level}</Badge>
                      {rock.quarterNumber && rock.quarterYear ? <span>Q{rock.quarterNumber} {rock.quarterYear}</span> : null}
                      <span>Archived {formatDate(rock.archivedAt)}{by ? ` by ${by}` : ''}</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button type="button" variant="outline" size="sm" onClick={() => onRestore(rock.id)}>
                      <RotateCcw className="mr-1.5 h-4 w-4" aria-hidden="true" />
                      Restore
                    </Button>
                    <Button
                      type="button" variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-destructive"
                      onClick={() => onDelete(rock.id)} aria-label={`Delete ${rock.title}`}
                    >
                      <Trash2 className="h-4 w-4" aria-hidden="true" />
                    </Button>
                  </div>
                </Card>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
