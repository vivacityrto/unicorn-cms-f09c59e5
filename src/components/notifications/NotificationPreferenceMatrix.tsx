import { Checkbox } from '@/components/ui/checkbox';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useAuth } from '@/hooks/useAuth';
import {
  CHANNEL_LABELS,
  NOTIFICATION_CHANNELS,
  SCOPE_LABELS,
  isOwnerCategory,
  useNotificationMatrix,
  type NotificationScope,
} from '@/hooks/useNotificationMatrix';

interface Props {
  /** Tighter layout for the bell popover. */
  compact?: boolean;
}

const SCOPES: NotificationScope[] = ['my_and_delegated', 'my_clients', 'all_clients', 'off'];

/**
 * One row per notification category, one checkbox per channel, and for client
 * categories a "whose clients" choice. Changes save as you click.
 */
export function NotificationPreferenceMatrix({ compact = false }: Props) {
  const { profile } = useAuth();
  const { categories, effective, isLoading, isSaving, setChannel, setScope } = useNotificationMatrix();
  const isSuperAdmin = profile?.unicorn_role === 'Super Admin';
  // The label column may shrink (minmax(0, 1fr)) so the three channel columns never run past the card.
  const GRID = compact ? 'grid-cols-[minmax(0,1fr)_repeat(3,3.25rem)]' : 'grid-cols-[minmax(0,1fr)_repeat(3,3.75rem)]';

  if (isLoading) {
    return (
      <div className="space-y-3" aria-busy="true">
        {[1, 2, 3, 4].map((i) => (
          <Skeleton key={i} className="h-10 w-full" />
        ))}
      </div>
    );
  }

  // Platform alerts only reach Super Admins, so other people do not need the row.
  const rows = categories.filter((c) => c.key !== 'platform_alert' || isSuperAdmin);

  return (
    <div className="space-y-3">
      <div className={`grid items-center gap-x-3 text-xs font-medium text-muted-foreground ${GRID}`}>
        <span>Notify me about</span>
        {NOTIFICATION_CHANNELS.map((ch) => (
          <span key={ch} className="text-center">
            {CHANNEL_LABELS[ch]}
          </span>
        ))}
      </div>

      <div className="divide-y rounded-md border">
        {rows.map((category) => {
          const scope = effective(category.key, 'in_app').scope;
          return (
            <div key={category.key} className="space-y-2 p-3">
              <div className={`grid items-center gap-x-3 ${GRID}`}>
                <span className="text-sm font-medium">{category.label}</span>
                {NOTIFICATION_CHANNELS.map((channel) => {
                  const cell = effective(category.key, channel);
                  const id = `pref-${category.key}-${channel}`;
                  return (
                    <div key={channel} className="flex justify-center">
                      <Checkbox
                        id={id}
                        aria-label={`${category.label} by ${CHANNEL_LABELS[channel]}`}
                        checked={cell.enabled && scope !== 'off'}
                        disabled={isSaving || scope === 'off'}
                        onCheckedChange={(checked) => setChannel(category.key, channel, checked === true)}
                      />
                    </div>
                  );
                })}
              </div>

              {isOwnerCategory(category.key) && (
                <div className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground">For</span>
                  <Select
                    value={scope}
                    onValueChange={(value) => setScope(category.key, value as NotificationScope)}
                    disabled={isSaving}
                  >
                    <SelectTrigger
                      className="h-8 w-auto min-w-[14rem] text-xs"
                      aria-label={`Whose clients: ${category.label}`}
                    >
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {SCOPES.map((s) => (
                        <SelectItem key={s} value={s} className="text-xs">
                          {SCOPE_LABELS[s]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
            </div>
          );
        })}
      </div>

      <p className="text-xs text-muted-foreground">
        By default you hear about your own clients and the clients of people you assist. Choose
        &ldquo;All clients&rdquo; to hear about every client, or &ldquo;Off&rdquo; to mute a category. In-app
        alerts are live; Teams and email choices are saved and apply as those channels are connected.
      </p>
    </div>
  );
}
