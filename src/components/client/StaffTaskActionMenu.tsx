import { useState } from 'react';
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
import type { StageEmail } from '@/hooks/useStageEmails';

interface StaffTaskActionMenuProps {
  taskName: string;
  taskId: number;
  tenantId: number;
  packageId?: number;
  stageInstanceId?: number;
  stageEmails?: StageEmail[];
  onMarkComplete?: () => void;
}

export function StaffTaskActionMenu({
  taskName,
  taskId,
  tenantId,
  packageId,
  stageInstanceId,
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

  // Try to auto-match a stage email by comparing the clean task name to email subjects
  const matchedEmail = type === 'email' && cleanName
    ? stageEmails.find(e => e.subject.toLowerCase().includes(cleanName.toLowerCase()) || cleanName.toLowerCase().includes(e.subject.toLowerCase()))
    : null;

  const handleAction = (actionKey: string) => {
    if (actionKey === 'send_internal_csc' || actionKey === 'send_external_primary') {
      // For now, open compose with the matched email or a blank compose
      const email = matchedEmail;
      setComposeDefaults({
        to: email?.to || '',
        subject: email?.subject || cleanName,
        body: email?.content || '',
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
