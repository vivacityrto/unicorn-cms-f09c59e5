import { useMemo, useState } from 'react';
import { Loader2, Plus, Search, UserPlus } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { searchDirectory } from '@/lib/contactGroups/addPeople';
import type { DirectoryPerson } from '@/lib/contactGroups/resolveGroupMembers';
import { positionTypeLabel, type PositionTypeOption } from '@/lib/roles/positionType';
import { addPeopleToGroup, parseRowKey } from '@/services/contactGroupsService';
import { NewContactForm, type ClientOption } from './NewContactForm';

export type { ClientOption } from './NewContactForm';

interface Props {
  group: { id: number; name: string };
  directory: DirectoryPerson[];
  /** Directory row keys already in the group, so they are not offered again. */
  memberKeys: Set<string>;
  clients: ClientOption[];
  positionTypeOptions: PositionTypeOption[];
  /** Called after anyone is added or created, so the caller can refresh its lists. */
  onChanged: () => void;
}

/**
 * Add people to ONE group without leaving the registration modal: search the
 * directory, or create a new contact attached to a client (the same fields and
 * flow as a client's own contact list) and add them straight away.
 */
export function AddPeopleToGroupPanel({ group, directory, memberKeys, clients, positionTypeOptions, onChanged }: Props) {
  const [query, setQuery] = useState('');
  const [addingKey, setAddingKey] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);

  const results = useMemo(() => searchDirectory(directory, query, memberKeys), [directory, query, memberKeys]);

  const addExisting = async (person: DirectoryPerson) => {
    const parsed = parseRowKey(person.row_key);
    if (!parsed) return;
    setAddingKey(person.row_key);
    const result = await addPeopleToGroup(group.id, [{ source: parsed.source, id: parsed.id, tenantId: person.tenant_id }]);
    setAddingKey(null);
    if (result.ok === false) {
      toast.error(result.message);
      return;
    }
    toast.success(`Added ${person.first_name} ${person.last_name ?? ''}`.trim() + ` to ${group.name}`);
    onChanged();
  };

  return (
    <div className="space-y-3 rounded-md border p-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-medium">Add people to {group.name}</p>
        <Button variant="outline" size="sm" onClick={() => setShowForm((v) => !v)}>
          <UserPlus className="mr-2 h-4 w-4" />
          {showForm ? 'Close new contact' : 'New contact'}
        </Button>
      </div>

      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search the directory by name, email or client…"
          aria-label="Search the directory to add people"
          className="pl-9"
        />
      </div>

      {query.trim().length >= 2 && results.length === 0 && (
        <p className="text-sm text-muted-foreground">
          Nobody active matches, or they are already in the group. Use "New contact" to create them.
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
                onClick={() => addExisting(p)}
                disabled={addingKey === p.row_key}
                aria-label={`Add ${p.first_name} ${p.last_name ?? ''} to ${group.name}`.replace(/\s+/g, ' ')}
              >
                {addingKey === p.row_key ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                <span className="ml-1">Add</span>
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
          addToGroup={group}
          submitLabel={`Create and add to ${group.name}`}
          onCreated={(created) => {
            if (created.addedToGroup) toast.success(`Created ${created.name} and added them to ${group.name}`);
            setShowForm(false);
            onChanged();
          }}
        />
      )}
    </div>
  );
}
