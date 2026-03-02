import { useState, useEffect } from 'react';
import { useStageEmails } from '@/hooks/useStageEmails';
import { TaskDescriptionButton } from './TaskDescriptionDialog';
import { ComposeEmailDialog } from './ComposeEmailDialog';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Mail, Send, Clock, Pencil } from 'lucide-react';
import { cn } from '@/lib/utils';
import { format } from 'date-fns';
import { supabase } from '@/integrations/supabase/client';

interface StageEmailsSectionProps {
  stageInstanceId: number;
  tenantId?: number;
  packageId?: number;
}

export function StageEmailsSection({ stageInstanceId, tenantId, packageId }: StageEmailsSectionProps) {
  const { emails, loading, totalCount, refetch } = useStageEmails({ stageInstanceId });
  const [composeEmail, setComposeEmail] = useState<typeof emails[0] | null>(null);
  const [primaryContactEmail, setPrimaryContactEmail] = useState('');

  // Fetch primary contact email for this tenant
  useEffect(() => {
    if (!tenantId) return;
    (async () => {
      const { data: tu } = await supabase
        .from('tenant_users')
        .select('user_id')
        .eq('tenant_id', tenantId)
        .eq('primary_contact', true)
        .order('created_at', { ascending: true })
        .limit(1)
        .maybeSingle();
      if (tu?.user_id) {
        const { data: u } = await supabase
          .from('users')
          .select('email')
          .eq('user_uuid', tu.user_id)
          .single();
        if (u?.email) setPrimaryContactEmail(u.email);
      }
    })();
  }, [tenantId]);

  if (loading) {
    return (
      <div className="space-y-2 px-4 py-3 border-t bg-muted/20">
        <Skeleton className="h-4 w-24" />
        {[1, 2].map(i => <Skeleton key={i} className="h-8 w-full" />)}
      </div>
    );
  }

  if (totalCount === 0) {
    return (
      <div className="px-4 py-3 border-t bg-muted/20 text-center text-muted-foreground text-sm">
        No emails linked to this stage.
      </div>
    );
  }

  const resolveDefaultTo = (email: typeof emails[0]) => {
    if (email.to === 'client' || email.to === 'tenant') return primaryContactEmail;
    if (email.to === 'internal') return '';
    return email.to || primaryContactEmail;
  };

  return (
    <>
      <div className="border-t bg-muted/20">
        <div className="px-4 py-2 border-b bg-muted/30 flex items-center justify-between">
          <span className="text-sm font-medium flex items-center gap-1.5">
            <Mail className="h-3.5 w-3.5" />
            Emails
          </span>
          <Badge variant="outline" className="text-xs">{totalCount} total</Badge>
        </div>
        <div className="divide-y">
          {emails.map((email) => (
            <div key={email.id} className="flex items-center gap-3 px-4 py-2">
              {email.is_sent ? (
                <Send className="h-4 w-4 shrink-0 text-green-600" />
              ) : (
                <Clock className="h-4 w-4 shrink-0 text-muted-foreground" />
              )}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1">
                  <p className="text-sm truncate">{email.subject}</p>
                  <TaskDescriptionButton taskName={email.subject} description={email.description} />
                </div>
                <p className="text-xs text-muted-foreground truncate">
                  To: {email.to || 'Not set'}
                </p>
              </div>
              {email.sent_date && (
                <span className="text-xs text-muted-foreground shrink-0">
                  {format(new Date(email.sent_date), 'dd MMM yyyy')}
                </span>
              )}
              <Badge variant={email.is_sent ? 'default' : 'secondary'} className="text-xs">
                {email.is_sent ? 'Sent' : 'Draft'}
              </Badge>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 shrink-0"
                onClick={() => setComposeEmail(email)}
                title={email.is_sent ? 'Resend / Edit' : 'Compose & Send'}
              >
                {email.is_sent ? <Pencil className="h-3.5 w-3.5" /> : <Send className="h-3.5 w-3.5" />}
              </Button>
            </div>
          ))}
        </div>
        {totalCount > 10 && (
          <div className="px-4 py-2 border-t text-center">
            <button className="text-xs text-primary hover:underline">
              View all {totalCount} emails
            </button>
          </div>
        )}
      </div>

      {composeEmail && tenantId && (
        <ComposeEmailDialog
          open={!!composeEmail}
          onOpenChange={(open) => !open && setComposeEmail(null)}
          tenantId={tenantId}
          packageId={packageId}
          stageInstanceId={stageInstanceId}
          emailInstanceId={composeEmail.id}
          defaultTo={resolveDefaultTo(composeEmail)}
          defaultSubject={composeEmail.subject}
          defaultBody={composeEmail.content || ''}
          emailName={composeEmail.subject}
          onSent={refetch}
        />
      )}
    </>
  );
}
