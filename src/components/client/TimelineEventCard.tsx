import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { TimelineEvent } from '@/hooks/useClientManagementData';
import { type TimelineEventType } from '@/types/timeline';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Activity, Calendar, Mail, FileText, FileEdit, FileCheck,
  Link2, Share2, CheckSquare, Paperclip, Users, AlertTriangle,
  Plug, PlugZap, FolderCog, FolderX,
  Clock, ExternalLink, RotateCcw, MoreHorizontal, Copy, Shield,
  ChevronDown, ChevronUp, Pin, PinOff, Package,
} from 'lucide-react';
import { formatDistanceToNow, format } from 'date-fns';
import type { LucideIcon } from 'lucide-react';

// =============================================
// Icon & colour mapping
// =============================================

/**
 * Exhaustive icon map – a missing key causes a compile error.
 */
const EVENT_ICON_MAP: Record<TimelineEventType, LucideIcon> = {
  microsoft_connected: Plug,
  microsoft_disconnected: PlugZap,
  microsoft_sync_failed: AlertTriangle,
  sharepoint_root_configured: FolderCog,
  sharepoint_root_invalid: FolderX,
  sharepoint_doc_linked: Link2,
  document_shared_to_client: Share2,
  document_uploaded: FileText,
  document_downloaded: FileText,
  meeting_synced: Calendar,
  meeting_attendance_imported: Users,
  meeting_artifacts_captured: Paperclip,
  minutes_draft_created: FileEdit,
  minutes_draft_updated: FileEdit,
  minutes_published_pdf: FileCheck,
  tasks_created_from_minutes: CheckSquare,
  task_completed_team: CheckSquare,
  task_completed_client: CheckSquare,
  action_item_created: CheckSquare,
  action_item_updated: CheckSquare,
  action_item_completed: CheckSquare,
  email_linked: Mail,
  email_attachment_saved: Paperclip,
  email_sent: Mail,
  email_failed: Mail,
  note_added: FileText,
  note_created: FileText,
  note_pinned: Pin,
  note_unpinned: PinOff,
  time_posted: Clock,
  time_ignored: Clock,
};

/**
 * Exhaustive colour map – a missing key causes a compile error.
 */
const EVENT_COLOR_MAP: Record<TimelineEventType, string> = {
  microsoft_connected: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
  microsoft_disconnected: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
  microsoft_sync_failed: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
  sharepoint_root_configured: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
  sharepoint_root_invalid: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
  sharepoint_doc_linked: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
  document_shared_to_client: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
  document_uploaded: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',
  document_downloaded: 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400',
  meeting_synced: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
  meeting_attendance_imported: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
  meeting_artifacts_captured: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
  minutes_draft_created: 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-400',
  minutes_draft_updated: 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-400',
  minutes_published_pdf: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
  tasks_created_from_minutes: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400',
  task_completed_team: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400',
  task_completed_client: 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-400',
  action_item_created: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400',
  action_item_updated: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400',
  action_item_completed: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
  email_linked: 'bg-cyan-100 text-cyan-700 dark:bg-cyan-900/30 dark:text-cyan-400',
  email_attachment_saved: 'bg-cyan-100 text-cyan-700 dark:bg-cyan-900/30 dark:text-cyan-400',
  email_sent: 'bg-cyan-100 text-cyan-700 dark:bg-cyan-900/30 dark:text-cyan-400',
  email_failed: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
  note_added: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400',
  note_created: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400',
  note_pinned: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',
  note_unpinned: 'bg-muted text-muted-foreground',
  time_posted: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
  time_ignored: 'bg-muted text-muted-foreground',
};

// =============================================
// Module chip
// =============================================

function getModuleChip(eventType: string): string | null {
  if (eventType.startsWith('meeting') || eventType.startsWith('minutes')) return 'Meetings';
  if (eventType.startsWith('email')) return 'Emails';
  if (eventType.startsWith('sharepoint') || eventType.startsWith('document')) return 'Documents';
  if (eventType.startsWith('task')) return 'Tasks';
  if (eventType.startsWith('note')) return 'Notes';
  return null;
}

// =============================================
// Deep-link resolver
// =============================================

interface DeepLinkAction {
  label: string;
  path: string;
}

function getPrimaryAction(event: TimelineEvent): DeepLinkAction | null {
  const meta = event.metadata as Record<string, unknown>;
  switch (event.event_type) {
    case 'meeting_synced':
    case 'meeting_attendance_imported':
    case 'meeting_artifacts_captured':
    case 'minutes_draft_created':
    case 'minutes_draft_updated':
    case 'minutes_published_pdf':
    case 'tasks_created_from_minutes':
      if (event.entity_id) return { label: 'View meeting', path: `/meetings/${event.entity_id}` };
      if (meta?.meeting_id) return { label: 'View meeting', path: `/meetings/${meta.meeting_id}` };
      return null;
    case 'email_linked':
    case 'email_attachment_saved':
      if (event.entity_id) return { label: 'View email', path: `/emails/${event.entity_id}` };
      return null;
    case 'sharepoint_doc_linked':
    case 'sharepoint_root_configured':
    case 'sharepoint_root_invalid':
      if (meta?.tenant_id) return { label: 'View docs', path: `/clients/${meta.tenant_id}?tab=documents` };
      return null;
    case 'document_uploaded':
    case 'document_downloaded':
    case 'document_shared_to_client':
      if (event.entity_id) return { label: 'View document', path: `/documents/${event.entity_id}` };
      return null;
    case 'microsoft_sync_failed':
      return { label: 'Fix connection', path: '/settings?tab=calendar' };
    default:
      return null;
  }
}

const RETRY_EVENT_TYPES = new Set([
  'microsoft_sync_failed',
  'sharepoint_root_invalid',
]);

// =============================================
// Component props
// =============================================

interface TimelineEventCardProps {
  event: TimelineEvent;
  isVivacityTeam: boolean;
  /** Note pin helpers */
  noteId?: string | null;
  isPinned?: boolean;
  onTogglePin?: (noteId: string, pin: boolean) => void;
}

export function TimelineEventCard({
  event,
  isVivacityTeam,
  noteId,
  isPinned = false,
  onTogglePin,
}: TimelineEventCardProps) {
  const navigate = useNavigate();
  const [expanded, setExpanded] = useState(false);

  const eventKey = event.event_type as TimelineEventType;
  const Icon = EVENT_ICON_MAP[eventKey] ?? Activity;
  const colorClass = EVENT_COLOR_MAP[eventKey] ?? 'bg-muted text-muted-foreground';
  const occurredAt = event.occurred_at || event.created_at;
  const meta = event.metadata as Record<string, unknown>;
  const hasDetails = event.body || Object.keys(meta || {}).length > 0;

  const primaryAction = getPrimaryAction(event);
  const moduleChip = getModuleChip(event.event_type);
  const isNoteEvent = event.entity_type === 'note' || ['note_added', 'note_created'].includes(event.event_type);
  const showRetry = RETRY_EVENT_TYPES.has(event.event_type);

  // Package name from metadata
  const packageName = (meta?.package_name as string) || null;

  return (
    <div className="flex gap-4 relative group">
      {/* ===== Icon ===== */}
      <div className={`relative z-10 flex items-center justify-center h-10 w-10 rounded-full border-2 border-background shrink-0 ${colorClass}`}>
        <Icon className="h-4 w-4" />
      </div>

      {/* ===== Card body ===== */}
      <div className="flex-1 min-w-0 pb-4">
        {/* --- Header row --- */}
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <p className="font-medium text-sm leading-tight">{event.title}</p>
            {/* Summary (clamped) */}
            {event.body && !expanded && (
              <p className="text-sm text-muted-foreground mt-0.5 line-clamp-2">{event.body}</p>
            )}
          </div>

          {/* Right side: timestamp + visibility chip + expand toggle */}
          <div className="flex items-center gap-1.5 shrink-0">
            <span
              className="text-[10px] text-muted-foreground whitespace-nowrap"
              title={format(new Date(occurredAt), 'PPpp')}
            >
              {formatDistanceToNow(new Date(occurredAt), { addSuffix: true })}
            </span>

            {isVivacityTeam && event.visibility === 'internal' && (
              <Badge variant="secondary" className="text-[10px] h-4 px-1.5">Internal</Badge>
            )}

            {event.source === 'microsoft' && (
              <Badge variant="outline" className="text-[10px] h-4 px-1.5">Microsoft</Badge>
            )}

            {hasDetails && (
              <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => setExpanded(!expanded)}>
                {expanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
              </Button>
            )}
          </div>
        </div>

        {/* --- Context chips --- */}
        <div className="flex flex-wrap items-center gap-1.5 mt-1.5">
          {moduleChip && (
            <Badge variant="outline" className="text-[10px] h-5 px-1.5 font-normal">{moduleChip}</Badge>
          )}
          {packageName && (
            <Badge variant="outline" className="text-[10px] h-5 px-1.5 font-normal gap-0.5">
              <Package className="h-2.5 w-2.5" />{packageName}
            </Badge>
          )}
        </div>

        {/* --- Expanded details --- */}
        {expanded && (
          <div className="mt-2 p-3 rounded-md bg-muted/50 space-y-2">
            {event.body && <p className="text-sm whitespace-pre-wrap">{event.body}</p>}
            {meta && Object.keys(meta).length > 0 && (
              <div className="text-xs space-y-1">
                {Object.entries(meta).map(([key, value]) => {
                  if (value === null || value === undefined) return null;
                  return (
                    <div key={key} className="flex gap-2">
                      <span className="text-muted-foreground capitalize">{key.replace(/_/g, ' ')}:</span>
                      <span className="font-medium">
                        {typeof value === 'object' ? JSON.stringify(value) : String(value)}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* --- Footer: actor + actions --- */}
        <div className="flex items-center justify-between mt-2">
          {/* Actor */}
          <div className="flex items-center gap-2">
            {event.creator && (
              <span className="flex items-center gap-1 text-xs text-muted-foreground">
                <Avatar className="h-5 w-5">
                  <AvatarImage src={event.creator.avatar_url || undefined} />
                  <AvatarFallback className="text-[8px]">
                    {event.creator.first_name?.[0]}{event.creator.last_name?.[0]}
                  </AvatarFallback>
                </Avatar>
                <span>{event.creator.first_name} {event.creator.last_name}</span>
              </span>
            )}
          </div>

          {/* Actions (max 2 visible + overflow) */}
          <div className="flex items-center gap-1">
            {/* Pin for notes */}
            {isNoteEvent && noteId && onTogglePin && (
              <Button
                variant="ghost"
                size="icon"
                className={`h-6 w-6 ${isPinned ? 'text-amber-600' : 'text-muted-foreground'}`}
                onClick={() => onTogglePin(noteId, !isPinned)}
                title={isPinned ? 'Unpin note' : 'Pin note'}
              >
                {isPinned ? <PinOff className="h-3 w-3" /> : <Pin className="h-3 w-3" />}
              </Button>
            )}

            {/* Primary deep-link */}
            {primaryAction && (
              <Button
                variant="ghost"
                size="sm"
                className="h-6 px-2 text-xs gap-1"
                onClick={() => navigate(primaryAction.path)}
              >
                <ExternalLink className="h-3 w-3" />
                {primaryAction.label}
              </Button>
            )}

            {/* Retry sync */}
            {showRetry && (
              <Button
                variant="ghost"
                size="sm"
                className="h-6 px-2 text-xs gap-1 text-destructive"
                onClick={() => navigate('/settings?tab=calendar')}
              >
                <RotateCcw className="h-3 w-3" />
                Retry
              </Button>
            )}

            {/* Overflow menu */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity"
                >
                  <MoreHorizontal className="h-3 w-3" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-44">
                <DropdownMenuItem
                  onClick={() => {
                    navigator.clipboard.writeText(window.location.origin + (primaryAction?.path || ''));
                  }}
                >
                  <Copy className="h-3 w-3 mr-2" />
                  Copy link
                </DropdownMenuItem>
                {isVivacityTeam && (
                  <DropdownMenuItem onClick={() => navigate(`/admin/audit?entity_id=${event.id}`)}>
                    <Shield className="h-3 w-3 mr-2" />
                    View audit record
                  </DropdownMenuItem>
                )}
                {event.package_id && (
                  <DropdownMenuItem onClick={() => navigate(`/packages/${event.package_id}`)}>
                    <Package className="h-3 w-3 mr-2" />
                    Open package
                  </DropdownMenuItem>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </div>
    </div>
  );
}

// =============================================
// Skeleton loader
// =============================================

export function TimelineEventCardSkeleton() {
  return (
    <div className="flex gap-4">
      <div className="h-10 w-10 rounded-full bg-muted animate-pulse shrink-0" />
      <div className="flex-1 space-y-2 pb-4">
        <div className="h-4 w-3/4 bg-muted animate-pulse rounded" />
        <div className="h-3 w-1/2 bg-muted animate-pulse rounded" />
        <div className="flex gap-2 mt-2">
          <div className="h-5 w-16 bg-muted animate-pulse rounded-full" />
          <div className="h-5 w-20 bg-muted animate-pulse rounded-full" />
        </div>
        <div className="flex items-center gap-2 mt-2">
          <div className="h-5 w-5 rounded-full bg-muted animate-pulse" />
          <div className="h-3 w-24 bg-muted animate-pulse rounded" />
        </div>
      </div>
    </div>
  );
}
