import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Loader2, Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { supabase } from '@/integrations/supabase/client';
import { searchDirectory } from '@/lib/contactGroups/addPeople';
import type { DirectoryPerson } from '@/lib/contactGroups/resolveGroupMembers';

interface Props {
  /** Emails (lower-case) already listed for this event, so nobody is offered twice. */
  listedEmails: Set<string>;
  busyKey: string | null;
  onAdd: (person: DirectoryPerson) => void;
}

/**
 * Find someone in the Contact Directory who attended without being registered
 * through Unicorn, and record them as a walk-in.
 */
export function WalkInPanel({ listedEmails, busyKey, onAdd }: Props) {
  const [query, setQuery] = useState('');

  const directoryQuery = useQuery({
    queryKey: ['contact-directory', 'walk-in-lookup'],
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_admin_contact_directory');
      if (error) throw error;
      return (data ?? []) as DirectoryPerson[];
    },
  });

  const results = useMemo(
    () =>
      searchDirectory(directoryQuery.data ?? [], query, new Set(), 30)
        .filter((p) => !listedEmails.has(p.email.trim().toLowerCase()))
        .slice(0, 8),
    [directoryQuery.data, query, listedEmails],
  );

  return (
    <div className="space-y-3 rounded-md border p-3">
      <p className="text-sm font-medium">Add a walk-in</p>
      <p className="text-sm text-muted-foreground">
        For someone who attended but was not registered through Unicorn. Search the directory by name, email or client.
      </p>
      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search the directory…"
          aria-label="Search the directory for a walk-in"
          className="pl-9"
        />
      </div>

      {directoryQuery.isLoading && <p className="text-sm text-muted-foreground">Loading the directory…</p>}
      {directoryQuery.isError && <p className="text-sm text-destructive">Could not load the directory.</p>}
      {query.trim().length >= 2 && !directoryQuery.isLoading && results.length === 0 && (
        <p className="text-sm text-muted-foreground">Nobody active matches, or they are already listed for this event.</p>
      )}
      {results.length > 0 && (
        <ul className="max-h-56 space-y-1 overflow-auto text-sm">
          {results.map((p) => (
            <li key={p.row_key} className="flex items-center justify-between gap-3 rounded-md border px-3 py-1.5">
              <span className="min-w-0">
                <span className="font-medium">{[p.first_name, p.last_name].filter(Boolean).join(' ')}</span>
                <span className="block truncate text-xs text-muted-foreground">
                  {p.email} · {p.tenant_name}
                </span>
              </span>
              <Button size="sm" variant="outline" disabled={busyKey === p.row_key} onClick={() => onAdd(p)}>
                {busyKey === p.row_key && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Mark attended
              </Button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
