import { useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { ComposePane, type DockThreadApi } from '@/components/messenger';
import { SearchableFilter, type FilterOption } from '@/components/staff/SearchableFilter';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { uploadMessageAttachment } from '@/lib/messageAttachments';
import { attachmentProblem } from '@/lib/messageAttachmentsFirst';
import { createStaffConversation } from './createStaffConversation';

const CATEGORIES = [
  { value: 'general', label: 'General' },
  { value: 'package', label: 'Package' },
  { value: 'task', label: 'Task' },
  { value: 'rock', label: 'Rock' },
];

interface Props {
  api: Pick<DockThreadApi, 'onBack' | 'select' | 'headerActions'>;
  /** A client to start with (when opened from a client's own page). */
  initialTenantId?: number | null;
}

/**
 * A new message to a client, written inside the staff bubble: choose the client, then everyone at that client or one person,
 * then write it. The same box and look as an open conversation. Sending creates the conversation and the bubble moves onto it.
 */
export function StaffNewMessagePane({ api, initialTenantId = null }: Props) {
  const { profile } = useAuth();
  const qc = useQueryClient();
  const [tenantId, setTenantId] = useState<string>(initialTenantId != null ? String(initialTenantId) : 'all');
  const [recipientId, setRecipientId] = useState('all');
  const [subject, setSubject] = useState('');
  const [category, setCategory] = useState('general');

  const { data: tenants = [] } = useQuery({
    queryKey: ['team-tenants-list'],
    queryFn: async () => {
      const { data } = await supabase.from('tenants').select('id, name').order('name');
      return data ?? [];
    },
  });

  const chosenTenant = tenantId !== 'all' ? Number(tenantId) : null;
  const { data: people = [] } = useQuery({
    queryKey: ['staff-new-message', 'recipients', chosenTenant],
    enabled: chosenTenant != null,
    queryFn: async (): Promise<FilterOption[]> => {
      const { data, error } = await supabase
        .from('tenant_users')
        .select('user_id, relationship_role, users!tenant_users_user_id_fkey (first_name, last_name, email)')
        .eq('tenant_id', chosenTenant!);
      if (error) throw error;
      return (data ?? [])
        .map((r) => {
          const u = Array.isArray(r.users) ? r.users[0] : r.users;
          const name = [u?.first_name, u?.last_name].filter(Boolean).join(' ') || u?.email || 'Unnamed user';
          return { value: r.user_id as string, label: r.relationship_role ? `${name} (${r.relationship_role})` : name };
        })
        .sort((a, b) => a.label.localeCompare(b.label));
    },
  });

  const clientOptions = useMemo<FilterOption[]>(() => tenants.map((t) => ({ value: String(t.id), label: t.name })), [tenants]);
  const everyone = recipientId === 'all';
  const recipientLabel = everyone ? null : people.find((p) => p.value === recipientId)?.label ?? null;
  const tenantName = clientOptions.find((o) => o.value === tenantId)?.label ?? null;
  const ready = chosenTenant != null && !!profile?.user_uuid;

  return (
    <ComposePane
      subtitle={tenantName ? `To ${recipientLabel ?? `everyone at ${tenantName}`}` : 'To a client'}
      onBack={api.onBack}
      headerActions={api.headerActions}
      ready={ready}
      notReadyReason="Choose a client to write to."
      // A draft belongs to who it was written to: a message written to one person comes back only when that same person is
      // chosen again, and can never be sent to everyone by reopening the screen.
      draftScope={`staff-new:${tenantId}:${recipientId}`}
      validateFile={attachmentProblem}
      accept=".jpg,.jpeg,.png,.gif,.webp,.pdf,.doc,.docx,.xls,.xlsx"
      onSend={async ({ body, files }) => {
        if (chosenTenant == null || !profile?.user_uuid) return;
        const created = await createStaffConversation({
          tenantId: chosenTenant,
          recipientId: everyone ? null : recipientId,
          subject,
          category,
          body,
          staffId: profile.user_uuid,
        });
        // The message is sent. Files are best effort and must not hide that.
        for (const f of files) {
          try {
            await uploadMessageAttachment(supabase, f, chosenTenant, created.id, created.messageId);
          } catch {
            toast.warning(`Your message was sent, but ${f.name} could not be attached.`);
          }
        }
        if (created.skippedParticipants > 0) {
          toast.warning(`Message sent, but ${created.skippedParticipants} client user${created.skippedParticipants > 1 ? 's' : ''} could not be added (no sign-in account).`);
        }
        void qc.invalidateQueries({ queryKey: ['staff-messenger', 'threads'] });
        api.select(created.id);
      }}
    >
      <div className="space-y-1.5">
        <span className="text-xs font-medium text-foreground">Client</span>
        <div>
          <SearchableFilter
            label="Client"
            allLabel="Choose a client"
            value={tenantId}
            onChange={(v) => {
              setTenantId(v);
              setRecipientId('all');
            }}
            options={clientOptions}
            className="w-full [&>button]:w-full [&>button]:max-w-none"
          />
        </div>
      </div>
      {chosenTenant != null && (
        <div className="space-y-1.5">
          <span className="text-xs font-medium text-foreground">To</span>
          <div>
            <SearchableFilter
              label="Recipient"
              allLabel="Everyone at this client"
              value={recipientId}
              onChange={setRecipientId}
              options={people}
              className="w-full [&>button]:w-full [&>button]:max-w-none"
            />
          </div>
          <p className="text-[11px] text-muted-foreground">
            {everyone ? 'Every user at the client can read and reply.' : 'Only this person and you can see this conversation.'}
          </p>
        </div>
      )}
      <div className="grid grid-cols-2 gap-2">
        <div className="space-y-1.5">
          <label htmlFor="staff-new-subject" className="text-xs font-medium text-foreground">
            Subject <span className="font-normal text-muted-foreground">(optional)</span>
          </label>
          <Input id="staff-new-subject" value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="What is this about?" className="h-9" />
        </div>
        <div className="space-y-1.5">
          <label htmlFor="staff-new-category" className="text-xs font-medium text-foreground">Category</label>
          <Select value={category} onValueChange={setCategory}>
            <SelectTrigger id="staff-new-category" className="h-9"><SelectValue /></SelectTrigger>
            <SelectContent>
              {CATEGORIES.map((c) => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      </div>
    </ComposePane>
  );
}
