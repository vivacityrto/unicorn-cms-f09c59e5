import { useState, useEffect } from 'react';
import { MoreHorizontal, Mail } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
  DropdownMenuLabel,
} from '@/components/ui/dropdown-menu';
import { toast } from '@/hooks/use-toast';
import { parseTaskType, getActionsForType, getTaskTypeBadgeLabel } from '@/utils/staffTaskType';
import { ComposeEmailDialog } from './ComposeEmailDialog';
import { cn } from '@/lib/utils';
import { supabase } from '@/integrations/supabase/client';
import type { StageEmail } from '@/hooks/useStageEmails';

interface StaffTaskActionMenuProps {
  taskName: string;
  taskId: number;
  tenantId: number;
  packageId?: number;
  stageInstanceId?: number;
  statusId?: number;
  stageEmails?: StageEmail[];
  onMarkComplete?: () => void;
}

export function StaffTaskActionMenu({
  taskName,
  taskId,
  tenantId,
  packageId,
  stageInstanceId,
  statusId,
  stageEmails = [],
  onMarkComplete,
}: StaffTaskActionMenuProps) {
  const { type, cleanName } = parseTaskType(taskName);
  const actions = getActionsForType(type);
  const typeLabel = getTaskTypeBadgeLabel(type);

  const [composeOpen, setComposeOpen] = useState(false);
  const [composeDefaults, setComposeDefaults] = useState<{
    to: string;
    subject: string;
    body: string;
    emailInstanceId?: number;
    emailName?: string;
  } | null>(null);

  // Cache CSC and primary contact info for this tenant
  const [cscEmail, setCscEmail] = useState<string>('');
  const [cscFirstName, setCscFirstName] = useState<string>('');
  const [primaryEmail, setPrimaryEmail] = useState<string>('');
  const [primaryFirstName, setPrimaryFirstName] = useState<string>('');
  const [stageName, setStageName] = useState<string>('');
  const [clientName, setClientName] = useState<string>('');
  const [packageName, setPackageName] = useState<string>('');
  const [packageFullText, setPackageFullText] = useState<string>('');
  useEffect(() => {
    if (type !== 'email' || !tenantId) return;

    const fetchContacts = async () => {
      // CSC: from tenant_csc_assignments → users
      const { data: cscAssign } = await supabase
        .from('tenant_csc_assignments')
        .select('csc_user_id')
        .eq('tenant_id', tenantId)
        .eq('is_primary', true)
        .maybeSingle();

      if (cscAssign?.csc_user_id) {
        const { data: cscUser } = await supabase
          .from('users')
          .select('email, first_name')
          .eq('user_uuid', cscAssign.csc_user_id)
          .maybeSingle();
        if (cscUser) {
          setCscEmail(cscUser.email || '');
          setCscFirstName(cscUser.first_name || '');
        }
      }

      // Primary contact: from tenant_users where primary_contact = true → users
      const { data: primaryUser } = await supabase
        .from('tenant_users')
        .select('user_id')
        .eq('tenant_id', tenantId)
        .eq('primary_contact', true)
        .maybeSingle();

      if (primaryUser?.user_id) {
        const { data: pUser } = await supabase
          .from('users')
          .select('email, first_name')
          .eq('user_uuid', primaryUser.user_id)
          .maybeSingle();
        if (pUser) {
          setPrimaryEmail(pUser.email || '');
          setPrimaryFirstName(pUser.first_name || '');
        }
      }

      // Client name
      const { data: tenant } = await supabase
        .from('tenants')
        .select('name')
        .eq('id', tenantId)
        .maybeSingle();
      if (tenant) setClientName(tenant.name || '');

      // Stage name via stage_instances → documents_stages
      if (stageInstanceId) {
        const { data: si } = await (supabase
          .from('stage_instances' as any)
          .select('stage_id')
          .eq('id', stageInstanceId)
          .maybeSingle()) as { data: { stage_id: number } | null; error: any };
        if (si?.stage_id) {
          const { data: stage } = await supabase
            .from('documents_stages')
            .select('title')
            .eq('id', si.stage_id)
            .maybeSingle();
          if (stage) setStageName(stage.title || '');
        }
      }

      // Package name via client_packages → packages
      if (packageId) {
        const { data: cp } = await (supabase
          .from('client_packages' as any)
          .select('package_id')
          .eq('id', packageId)
          .maybeSingle()) as { data: { package_id: number } | null; error: any };
        if (cp?.package_id) {
          const { data: pkg } = await supabase
            .from('packages')
            .select('name, full_text')
            .eq('id', cp.package_id)
            .maybeSingle();
          if (pkg) {
            setPackageName(pkg.name || '');
            setPackageFullText(pkg.full_text || '');
          }
        }
      }
    };

    fetchContacts();
  }, [tenantId, type, stageInstanceId, packageId]);

  // Try to auto-match a stage email by comparing the clean task name to email subjects
  const matchedEmail = type === 'email' && cleanName
    ? stageEmails.find(e => e.subject.toLowerCase().includes(cleanName.toLowerCase()) || cleanName.toLowerCase().includes(e.subject.toLowerCase()))
    : null;

  // If status is N/A (code 3), don't render the action menu
  if (statusId === 3) {
    return (
      <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0" disabled>
        <MoreHorizontal className="h-4 w-4" />
        <span className="sr-only">Task actions</span>
      </Button>
    );
  }

  const handleAction = (actionKey: string) => {
    if (actionKey === 'send_internal_csc') {
      const email = matchedEmail;
      const greeting = cscFirstName ? `<p>Hi ${cscFirstName},</p>` : '';
      const clientLine = `<p style="padding-left:2em;"><strong>Client:</strong> ${clientName || 'N/A'}</p>`;
      const packageLine = packageName ? `<p style="padding-left:2em;"><strong>Package:</strong> ${packageName}${packageFullText ? ` — ${packageFullText}` : ''}</p>` : '';
      const emailContent = email?.content ? `<br/>${email.content}` : '';
      const bodyParts = [greeting, '<br/>', clientLine, packageLine, emailContent].filter(Boolean).join('');
      setComposeDefaults({
        to: cscEmail,
        subject: stageName || email?.subject || cleanName,
        body: bodyParts,
        emailInstanceId: email?.id,
        emailName: email?.subject,
      });
      setComposeOpen(true);
      return;
    }

    if (actionKey === 'send_external_primary') {
      const email = matchedEmail;
      const greeting = primaryFirstName ? `<p>Hi ${primaryFirstName},</p><br/>` : '';
      setComposeDefaults({
        to: primaryEmail,
        subject: email?.subject || cleanName,
        body: greeting + (email?.content || ''),
        emailInstanceId: email?.id,
        emailName: email?.subject,
      });
      setComposeOpen(true);
      return;
    }

    if (actionKey === 'mark_complete') {
      onMarkComplete?.();
      return;
    }

    toast({
      title: `Action: ${actionKey}`,
      description: `"${actionKey}" triggered for task #${taskId}. This will be wired up in a future update.`,
    });
  };

  const handleOpenStageEmail = (email: StageEmail) => {
    setComposeDefaults({
      to: email.to,
      subject: email.subject,
      body: email.content || '',
      emailInstanceId: email.id,
      emailName: email.subject,
    });
    setComposeOpen(true);
  };

  const handleEmailSent = () => {
    setComposeOpen(false);
    setComposeDefaults(null);
    toast({
      title: 'Email sent successfully',
      description: 'Mark this task as completed?',
      action: (
        <Button
          size="sm"
          variant="default"
          onClick={() => onMarkComplete?.()}
        >
          Yes
        </Button>
      ),
    });
  };

  const emailsForMenu = type === 'email' ? stageEmails.filter(e => !e.is_sent) : [];

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0">
            <MoreHorizontal className="h-4 w-4" />
            <span className="sr-only">Task actions</span>
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-64">
          {typeLabel && (
            <>
              <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">
                {typeLabel} Actions
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
            </>
          )}
          {actions.map((action) => {
            const Icon = action.icon;
            return (
              <DropdownMenuItem
                key={action.key}
                onClick={() => handleAction(action.key)}
                className="gap-2 cursor-pointer"
              >
                <Icon className="h-4 w-4 text-muted-foreground" />
                <span>{action.label}</span>
              </DropdownMenuItem>
            );
          })}

          {/* Stage emails sub-section for EMAIL tasks */}
          {emailsForMenu.length > 0 && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">
                Stage Emails
              </DropdownMenuLabel>
              {emailsForMenu.map((email) => (
                <DropdownMenuItem
                  key={email.id}
                  onClick={() => handleOpenStageEmail(email)}
                  className="gap-2 cursor-pointer"
                >
                  <Mail className="h-4 w-4 text-muted-foreground" />
                  <span className="truncate">{email.subject}</span>
                </DropdownMenuItem>
              ))}
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      {composeOpen && composeDefaults && (
        <ComposeEmailDialog
          open={composeOpen}
          onOpenChange={(open) => {
            if (!open) {
              setComposeOpen(false);
              setComposeDefaults(null);
            }
          }}
          tenantId={tenantId}
          packageId={packageId}
          stageInstanceId={stageInstanceId}
          emailInstanceId={composeDefaults.emailInstanceId}
          defaultTo={composeDefaults.to}
          defaultSubject={composeDefaults.subject}
          defaultBody={composeDefaults.body}
          emailName={composeDefaults.emailName}
          onSent={handleEmailSent}
        />
      )}
    </>
  );
}
