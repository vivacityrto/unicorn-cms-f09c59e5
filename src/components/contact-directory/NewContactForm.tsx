import { useMemo, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  emptyNewContactForm,
  findPeopleByEmail,
  searchTenants,
  validateNewContact,
  type NewContactForm as NewContactFormState,
} from '@/lib/contactGroups/addPeople';
import type { DirectoryPerson } from '@/lib/contactGroups/resolveGroupMembers';
import type { PositionTypeOption } from '@/lib/roles/positionType';
import { addPeopleToGroup, createTenantContact } from '@/services/contactGroupsService';

export interface ClientOption {
  id: number;
  name: string;
}

export interface CreatedContact {
  /** Directory key, e.g. `contact:42`. */
  key: string;
  id: number;
  tenantId: number;
  name: string;
  email: string;
  clientName: string;
  /** True when they were also added to a group. */
  addedToGroup: boolean;
}

interface Props {
  directory: DirectoryPerson[];
  clients: ClientOption[];
  positionTypeOptions: PositionTypeOption[];
  /** When given, the new contact is also added to this group. Otherwise they are only created. */
  addToGroup?: { id: number; name: string };
  submitLabel: string;
  onCreated: (created: CreatedContact) => void;
}

/**
 * Creates a brand-new contact attached to a client: same fields and insert as a
 * client's own contact list. The client is required. Last name is required here
 * because Teams registration needs both names.
 */
export function NewContactForm({ directory, clients, positionTypeOptions, addToGroup, submitLabel, onCreated }: Props) {
  const [form, setForm] = useState<NewContactFormState>(emptyNewContactForm);
  const [clientQuery, setClientQuery] = useState('');
  const [chosenClient, setChosenClient] = useState<ClientOption | null>(null);
  const [errors, setErrors] = useState<ReturnType<typeof validateNewContact>>({});
  const [saving, setSaving] = useState(false);

  const clientResults = useMemo(() => (chosenClient ? [] : searchTenants(clients, clientQuery)), [chosenClient, clients, clientQuery]);
  const sameEmail = useMemo(() => findPeopleByEmail(directory, form.email), [directory, form.email]);
  const sameEmailInClient = form.tenantId ? sameEmail.filter((p) => p.tenant_id === form.tenantId) : [];

  const set = <K extends keyof NewContactFormState>(key: K, value: NewContactFormState[K]) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  const save = async () => {
    const found = validateNewContact(form);
    setErrors(found);
    if (Object.keys(found).length > 0 || sameEmailInClient.length > 0 || !chosenClient) return;

    setSaving(true);
    const created = await createTenantContact({
      tenantId: chosenClient.id,
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

    let addedToGroup = false;
    if (addToGroup) {
      const added = await addPeopleToGroup(addToGroup.id, [{ source: 'contact', id: created.id, tenantId: chosenClient.id }]);
      addedToGroup = added.ok;
      if (!added.ok) {
        toast.error('The contact was created, but adding them to the group failed. Add them from the search above.');
      }
    }
    setSaving(false);
    onCreated({
      key: `contact:${created.id}`,
      id: created.id,
      tenantId: chosenClient.id,
      name: `${form.firstName.trim()} ${form.lastName.trim()}`.trim(),
      email: form.email.toLowerCase().trim(),
      clientName: chosenClient.name,
      addedToGroup,
    });
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
            email. Search for them and add them instead.
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
          {submitLabel}
        </Button>
      </div>
    </div>
  );
}
