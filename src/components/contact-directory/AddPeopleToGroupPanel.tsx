import { useMemo, useState } from 'react';
import { Loader2, Plus, Search, UserPlus } from 'lucide-react';
import { toast } from 'sonner';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  emptyNewContactForm,
  findPeopleByEmail,
  searchDirectory,
  searchTenants,
  validateNewContact,
  type NewContactForm,
} from '@/lib/contactGroups/addPeople';
import type { DirectoryPerson } from '@/lib/contactGroups/resolveGroupMembers';
import { positionTypeLabel, type PositionTypeOption } from '@/lib/roles/positionType';
import { addPeopleToGroup, createTenantContact, parseRowKey } from '@/services/contactGroupsService';

export interface ClientOption {
  id: number;
  name: string;
}

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
          group={group}
          directory={directory}
          clients={clients}
          positionTypeOptions={positionTypeOptions}
          onCreated={() => {
            setShowForm(false);
            onChanged();
          }}
        />
      )}
    </div>
  );
}

function NewContactForm({
  group,
  directory,
  clients,
  positionTypeOptions,
  onCreated,
}: {
  group: { id: number; name: string };
  directory: DirectoryPerson[];
  clients: ClientOption[];
  positionTypeOptions: PositionTypeOption[];
  onCreated: () => void;
}) {
  const [form, setForm] = useState<NewContactForm>(emptyNewContactForm);
  const [clientQuery, setClientQuery] = useState('');
  const [chosenClient, setChosenClient] = useState<ClientOption | null>(null);
  const [errors, setErrors] = useState<ReturnType<typeof validateNewContact>>({});
  const [saving, setSaving] = useState(false);

  const clientResults = useMemo(() => (chosenClient ? [] : searchTenants(clients, clientQuery)), [chosenClient, clients, clientQuery]);
  const sameEmail = useMemo(() => findPeopleByEmail(directory, form.email), [directory, form.email]);
  const sameEmailInClient = form.tenantId ? sameEmail.filter((p) => p.tenant_id === form.tenantId) : [];

  const set = <K extends keyof NewContactForm>(key: K, value: NewContactForm[K]) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  const save = async () => {
    const found = validateNewContact(form);
    setErrors(found);
    if (Object.keys(found).length > 0) return;
    if (sameEmailInClient.length > 0) return;

    setSaving(true);
    const created = await createTenantContact({
      tenantId: form.tenantId as number,
      firstName: form.firstName,
      lastName: form.lastName,
      email: form.email,
      positionType: form.positionType || null,
    });
    if (created.ok === false) {
      setSaving(false);
      toast.error(created.message);
      return;
    }
    const added = await addPeopleToGroup(group.id, [{ source: 'contact', id: created.id, tenantId: form.tenantId as number }]);
    setSaving(false);
    if (!added.ok) {
      toast.error('The contact was created, but adding them to the group failed. Add them from the search above.');
      onCreated();
      return;
    }
    toast.success(`Created ${form.firstName.trim()} ${form.lastName.trim()} and added them to ${group.name}`);
    onCreated();
  };

  return (
    <div className="space-y-3 rounded-md border bg-muted/30 p-3">
      <div className="space-y-1">
        <Label htmlFor="new-contact-client">Client</Label>
        {chosenClient ? (
          <div className="flex items-center justify-between rounded-md border bg-background px-3 py-2 text-sm">
            <span>{chosenClient.name}</span>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setChosenClient(null);
                set('tenantId', null);
              }}
            >
              Change
            </Button>
          </div>
        ) : (
          <>
            <Input
              id="new-contact-client"
              value={clientQuery}
              onChange={(e) => setClientQuery(e.target.value)}
              placeholder="Search for the client this contact belongs to…"
            />
            {clientResults.length > 0 && (
              <ul className="max-h-40 overflow-auto rounded-md border bg-background text-sm">
                {clientResults.map((c) => (
                  <li key={c.id}>
                    <button
                      type="button"
                      className="w-full px-3 py-1.5 text-left hover:bg-muted"
                      onClick={() => {
                        setChosenClient(c);
                        set('tenantId', c.id);
                        setClientQuery('');
                      }}
                    >
                      {c.name}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
        {errors.tenant && <p className="text-xs text-destructive">{errors.tenant}</p>}
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1">
          <Label htmlFor="new-contact-first">First name</Label>
          <Input id="new-contact-first" value={form.firstName} onChange={(e) => set('firstName', e.target.value)} />
          {errors.firstName && <p className="text-xs text-destructive">{errors.firstName}</p>}
        </div>
        <div className="space-y-1">
          <Label htmlFor="new-contact-last">Last name</Label>
          <Input id="new-contact-last" value={form.lastName} onChange={(e) => set('lastName', e.target.value)} />
          {errors.lastName && <p className="text-xs text-destructive">{errors.lastName}</p>}
        </div>
        <div className="space-y-1">
          <Label htmlFor="new-contact-email">Email</Label>
          <Input id="new-contact-email" type="email" value={form.email} onChange={(e) => set('email', e.target.value)} />
          {errors.email && <p className="text-xs text-destructive">{errors.email}</p>}
        </div>
        <div className="space-y-1">
          <Label htmlFor="new-contact-position">Position type (optional)</Label>
          <Select value={form.positionType || '__none__'} onValueChange={(v) => set('positionType', v === '__none__' ? '' : v)}>
            <SelectTrigger id="new-contact-position">
              <SelectValue placeholder="Position type" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__none__">None</SelectItem>
              {positionTypeOptions.map((o) => (
                <SelectItem key={o.value} value={o.value}>
                  {o.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {sameEmailInClient.length > 0 && (
        <Alert variant="destructive">
          <AlertDescription>
            {sameEmailInClient[0].first_name} {sameEmailInClient[0].last_name ?? ''} at this client already has this
            email. Search for them above and add them instead.
          </AlertDescription>
        </Alert>
      )}
      {sameEmailInClient.length === 0 && sameEmail.length > 0 && (
        <Alert variant="warning">
          <AlertDescription>
            This email already exists in the directory ({sameEmail[0].first_name} {sameEmail[0].last_name ?? ''} at{' '}
            {sameEmail[0].tenant_name}). If that is the same person, add them from the search instead. If not, carry on.
          </AlertDescription>
        </Alert>
      )}

      <div className="flex justify-end">
        <Button onClick={save} disabled={saving || sameEmailInClient.length > 0}>
          {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          Create and add to {group.name}
        </Button>
      </div>
    </div>
  );
}
