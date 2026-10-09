import { useMemo, useState } from 'react';
import { Plus, Search, UserPlus, X } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { searchDirectory } from '@/lib/contactGroups/addPeople';
import type { DirectoryPerson } from '@/lib/contactGroups/resolveGroupMembers';
import { positionTypeLabel, type PositionTypeOption } from '@/lib/roles/positionType';
import { extraFromDirectory, type ExtraPerson } from '@/lib/teamsEvents/adjustments';
import { NewContactForm, type ClientOption } from './NewContactForm';

interface Props {
  directory: DirectoryPerson[];
  /** Directory keys already in the chosen group (they are included anyway). */
  groupMemberKeys: Set<string>;
  extras: ExtraPerson[];
  clients: ClientOption[];
  positionTypeOptions: PositionTypeOption[];
  onAdd: (extra: ExtraPerson) => void;
  onRemove: (key: string) => void;
  /** Called after a new contact is created, so the directory can refresh. */
  onDirectoryChanged: () => void;
}

/**
 * People to register for THIS event only. They are not added to the group.
 * Search the directory, or create a new contact attached to a client.
 */
export function EventOnlyPeoplePanel({
  directory,
  groupMemberKeys,
  extras,
  clients,
  positionTypeOptions,
  onAdd,
  onRemove,
  onDirectoryChanged,
}: Props) {
  const [query, setQuery] = useState('');
  const [showForm, setShowForm] = useState(false);

  const excluded = useMemo(() => new Set([...groupMemberKeys, ...extras.map((e) => e.key)]), [groupMemberKeys, extras]);
  const results = useMemo(() => searchDirectory(directory, query, excluded), [directory, query, excluded]);

  return (
    <div className="space-y-3 rounded-md border p-3">
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-sm font-medium">Include in this event only</p>
          <p className="text-xs text-muted-foreground">
            These people are registered for this event only. They are not added to the group.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => setShowForm((v) => !v)}>
          <UserPlus className="mr-2 h-4 w-4" />
          {showForm ? 'Close new contact' : 'New contact'}
        </Button>
      </div>

      {extras.length > 0 && (
        <ul className="flex flex-wrap gap-2" aria-label="People included in this event only">
          {extras.map((e) => (
            <li key={e.key} className="flex items-center gap-1 rounded-full border bg-muted px-3 py-1 text-sm">
              <span>
                {e.name} <span className="text-muted-foreground">· {e.clientName}</span>
              </span>
              <button
                type="button"
                className="rounded-full p-0.5 hover:bg-background"
                aria-label={`Remove ${e.name} from this event`}
                onClick={() => onRemove(e.key)}
              >
                <X className="h-3 w-3" />
              </button>
            </li>
          ))}
        </ul>
      )}

      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search the directory by name, email or client…"
          aria-label="Search the directory to include in this event"
          className="pl-9"
        />
      </div>

      {query.trim().length >= 2 && results.length === 0 && (
        <p className="text-sm text-muted-foreground">
          Nobody active matches, or they are already included. Use "New contact" to create them.
        </p>
      )}
      {results.length > 0 && (
        <ul className="max-h-48 space-y-1 overflow-auto text-sm">
          {results.map((p) => (
            <li key={p.row_key} className="flex items-center justify-between gap-3 rounded-md border px-3 py-1.5">
              <span className="min-w-0">
                <span className="font-medium">{`${p.first_name} ${p.last_name ?? ''}`.trim()}</span>{' '}
                <span className="break-all text-muted-foreground">{p.email}</span>
                <span className="block text-xs text-muted-foreground">
                  {p.tenant_name} · {p.source === 'user' ? 'User' : 'Contact'}
                  {p.position_type ? ` · ${positionTypeLabel(p.position_type, positionTypeOptions)}` : ''}
                </span>
              </span>
              <Button
                size="sm"
                variant="secondary"
                onClick={() => {
                  onAdd(extraFromDirectory(p));
                  setQuery('');
                }}
                aria-label={`Include ${p.first_name} ${p.last_name ?? ''} in this event`.replace(/\s+/g, ' ')}
              >
                <Plus className="h-4 w-4" />
                <span className="ml-1">Include</span>
              </Button>
            </li>
          ))}
        </ul>
      )}

      {showForm && (
        <NewContactForm
          directory={directory}
          clients={clients}
          positionTypeOptions={positionTypeOptions}
          submitLabel="Create and include in this event"
          onCreated={(created) => {
            onAdd({ key: created.key, name: created.name, email: created.email, clientName: created.clientName });
            toast.success(`Created ${created.name} and included them in this event`);
            setShowForm(false);
            onDirectoryChanged();
          }}
        />
      )}
    </div>
  );
}
