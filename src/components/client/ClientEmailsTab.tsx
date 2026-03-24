import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { LinkedEmailsList } from '@/components/email/LinkedEmailsList';
import { OutlookInboxBrowser } from '@/components/email/OutlookInboxBrowser';
import { useLinkedEmails } from '@/hooks/useLinkedEmails';
import { Mail, Plus, RefreshCw, Inbox } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

interface ClientEmailsTabProps {
  tenantId: number;
  clientName: string;
}

export function ClientEmailsTab({ tenantId, clientName }: ClientEmailsTabProps) {
  const [showInboxBrowser, setShowInboxBrowser] = useState(false);

  const { refetch } = useLinkedEmails({ clientId: tenantId });

  // Fetch primary contact email for this tenant
  const { data: primaryContactEmail } = useQuery({
    queryKey: ['primary-contact-email', tenantId],
    queryFn: async () => {
      const { data } = await supabase
        .from('tenant_users')
        .select('users!inner(email)')
        .eq('tenant_id', tenantId)
        .eq('primary_contact', true)
        .order('created_at', { ascending: true })
        .limit(1)
        .maybeSingle();
      return (data?.users as any)?.email as string | undefined;
    },
    enabled: showInboxBrowser,
  });

  const handleEmailLinked = () => {
    setShowInboxBrowser(false);
    refetch();
  };

  return (
    <div className="space-y-6">
      {/* Header with actions */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-medium flex items-center gap-2">
            <Mail className="h-5 w-5" />
            Linked Emails
          </h3>
          <p className="text-sm text-muted-foreground">
            Emails linked to {clientName} for audit and reference
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => refetch()}>
            <RefreshCw className="h-4 w-4 mr-2" />
            Refresh
          </Button>
          <Button size="sm" onClick={() => setShowInboxBrowser(!showInboxBrowser)}>
            {showInboxBrowser ? (
              <>Hide Inbox</>
            ) : (
              <>
                <Plus className="h-4 w-4 mr-2" />
                Link Email
              </>
            )}
          </Button>
        </div>
      </div>

      {/* Inbox Browser */}
      {showInboxBrowser && (
        <div className="space-y-2">
          {primaryContactEmail && (
            <p className="text-sm text-muted-foreground px-1">
              Showing emails matching primary contact: <span className="font-medium text-foreground">{primaryContactEmail}</span>
            </p>
          )}
          <OutlookInboxBrowser
            tenantId={String(tenantId)}
            defaultClientId={tenantId}
            onEmailLinked={handleEmailLinked}
            filterEmail={primaryContactEmail}
          />
        </div>
      )}

      {/* Linked Emails List */}
      <LinkedEmailsList
        clientId={tenantId}
        title={`Emails linked to ${clientName}`}
        emptyMessage="No emails linked to this client yet. Click 'Link Email' to add one from Outlook."
      />
    </div>
  );
}
