import { useState } from 'react';
import { toast } from 'sonner';
import { ComposePane, type DockThreadApi } from '@/components/messenger';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useClientTenant } from '@/contexts/ClientTenantContext';
import { useClientCommunications } from '@/hooks/useClientCommunications';
import { attachmentProblem, attachToFirstMessage } from '@/lib/messageAttachmentsFirst';

const CATEGORIES = [
  { value: 'general', label: 'General' },
  { value: 'package', label: 'Package' },
  { value: 'task', label: 'Task' },
  { value: 'rock', label: 'Rock' },
];

/** A new message to Vivacity, written inside the bubble. Sending creates the conversation, then the bubble moves onto it. */
export function NewMessagePane({ api }: { api: Pick<DockThreadApi, 'onBack' | 'select' | 'headerActions'> }) {
  const { createConversation } = useClientCommunications();
  const { activeTenantId } = useClientTenant();
  const [subject, setSubject] = useState('');
  const [category, setCategory] = useState('general');

  return (
    <ComposePane
      subtitle="To the Vivacity team"
      onBack={api.onBack}
      headerActions={api.headerActions}
      ready
      draftScope="client-new"
      validateFile={attachmentProblem}
      accept=".jpg,.jpeg,.png,.gif,.webp,.pdf,.doc,.docx,.xls,.xlsx"
      onSend={async ({ body, files }) => {
        const id = await createConversation.mutateAsync({ subject: subject.trim() || undefined, type: category, firstMessage: body });
        // The message is sent. Files are best effort and must not hide that.
        if (activeTenantId != null) {
          const failed = await attachToFirstMessage(id, activeTenantId, files);
          for (const name of failed) toast.warning(`Your message was sent, but ${name} could not be attached.`);
        }
        api.select(id);
      }}
    >
      <div className="space-y-1.5">
        <label htmlFor="new-message-subject" className="text-xs font-medium text-foreground">
          Subject <span className="font-normal text-muted-foreground">(optional)</span>
        </label>
        <Input id="new-message-subject" value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="What is this about?" className="h-9" />
      </div>
      <div className="space-y-1.5">
        <label htmlFor="new-message-category" className="text-xs font-medium text-foreground">Category</label>
        <Select value={category} onValueChange={setCategory}>
          <SelectTrigger id="new-message-category" className="h-9"><SelectValue /></SelectTrigger>
          <SelectContent>
            {CATEGORIES.map((c) => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>
      <p className="text-xs text-muted-foreground">Your consultant and the team will reply here.</p>
    </ComposePane>
  );
}
