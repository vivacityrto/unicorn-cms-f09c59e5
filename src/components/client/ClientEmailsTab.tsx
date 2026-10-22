import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { LinkedEmailsList } from '@/components/email/LinkedEmailsList';
import { OutlookInboxBrowser } from '@/components/email/OutlookInboxBrowser';
import { useLinkedEmails } from '@/hooks/useLinkedEmails';
import { Mail, Plus, RefreshCw, Inbox } from 'lucide-react';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

interface ClientEmailsTabProps {
  tenantId: number;
  clientName: string;
}

export function ClientEmailsTab({ tenantId, clientName }: ClientEmailsTabProps) {
  const [showInboxBrowser, setShowInboxBrowser] = useState(false);
  const [domainFilterEnabled, setDomainFilterEnabled] = useState(true);

  const { refetch } = useLinkedEmails({ clientId: tenantId });

  // Extract the client's domain from their tenant users' email addresses
  const { data: clientDomain } = useQuery({
    queryKey: ['client-email-domain', tenantId],
    queryFn: async () => {
      const [{ data }, { data: tenant }] = await Promise.all([
        supabase
          .from('tenant_users')
          .select('primary_contact, users!inner(email, is_vivacity_internal, is_team, is_system_account, disabled)')
          .eq('tenant_id', tenantId),
        supabase.from('tenants').select('website').eq('id', tenantId).maybeSingle(),
      ]);

      // Free providers and our own domains never identify the client's organisation
      const ignoredDomains = [
        'gmail.com', 'googlemail.com', 'yahoo.com', 'yahoo.com.au', 'hotmail.com', 'hotmail.com.au',
        'outlook.com', 'outlook.com.au', 'live.com', 'live.com.au', 'icloud.com', 'me.com', 'aol.com',
        'bigpond.com', 'bigpond.net.au', 'optusnet.com.au', 'vivacity.com.au', 'complyhub.ai',
      ];
      const isUsable = (domain: string | undefined): domain is string =>
        !!domain && !ignoredDomains.includes(domain);

      type Row = {
        primary_contact: boolean | null;
        users: {
          email: string | null;
          is_vivacity_internal: boolean | null;
          is_team: boolean | null;
          is_system_account: boolean | null;
          disabled: boolean | null;
        } | null;
      };

      // Count domains from the client's own users only. Vivacity staff are attached to
      // tenants too, and would otherwise outvote the client's real domain. A primary
      // contact counts extra so a stray colleague with another address can't win.
      const freq: Record<string, number> = {};
      for (const row of (data ?? []) as unknown as Row[]) {
        const u = row.users;
        if (!u?.email || u.is_vivacity_internal || u.is_team || u.is_system_account || u.disabled) continue;
        const domain = u.email.split('@')[1]?.trim().toLowerCase();
        if (!isUsable(domain)) continue;
        freq[domain] = (freq[domain] || 0) + (row.primary_contact ? 2 : 1);
      }
      const top = Object.entries(freq).sort((a, b) => b[1] - a[1])[0]?.[0];
      if (top) return top;

      // No usable user email — fall back to the client's website domain
      const websiteDomain = tenant?.website
        ?.trim()
        .toLowerCase()
        .replace(/^[a-z]+:\/\//, '')
        .replace(/^www\./, '')
        .split(/[/?#:]/)[0];
      return isUsable(websiteDomain) ? websiteDomain : undefined;
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
          {clientDomain && (
            <div className="flex items-center gap-3 px-1">
              <Switch
                id="domain-filter"
                checked={domainFilterEnabled}
                onCheckedChange={setDomainFilterEnabled}
              />
              <Label htmlFor="domain-filter" className="text-sm text-muted-foreground cursor-pointer">
                {domainFilterEnabled
                  ? <>Filter by domain: <span className="font-medium text-foreground">@{clientDomain}</span></>
                  : 'Showing all emails (domain filter off)'}
              </Label>
            </div>
          )}
          <OutlookInboxBrowser
            tenantId={String(tenantId)}
            defaultClientId={tenantId}
            onEmailLinked={handleEmailLinked}
            filterEmail={domainFilterEnabled ? clientDomain : undefined}
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
