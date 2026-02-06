import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Loader2, Settings2 } from 'lucide-react';
import { 
  useNotificationRules, 
  useUpdateNotificationRule,
  EVENT_TYPE_LABELS,
  NotificationEventType,
} from '@/hooks/useTeamsNotifications';

const ALL_EVENT_TYPES: NotificationEventType[] = [
  'task_assigned',
  'task_overdue',
  'risk_flagged',
  'package_threshold_80',
  'package_threshold_95',
  'package_threshold_100',
  'meeting_action_created',
];

export function NotificationRulesCard() {
  const { data: rules, isLoading } = useNotificationRules();
  const updateRule = useUpdateNotificationRule();

  const getRuleEnabled = (eventType: NotificationEventType): boolean => {
    const rule = rules?.find(r => r.event_type === eventType);
    return rule?.is_enabled ?? true; // Default to enabled
  };

  const handleToggle = async (eventType: NotificationEventType, enabled: boolean) => {
    await updateRule.mutateAsync({
      eventType,
      isEnabled: enabled,
    });
  };

  if (isLoading) {
    return (
      <Card>
        <CardContent className="py-8 flex items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-3">
          <div className="p-2 bg-primary/10 rounded-lg">
            <Settings2 className="h-5 w-5 text-primary" />
          </div>
          <div>
            <CardTitle className="text-lg">Notification Events</CardTitle>
            <CardDescription>
              Choose which events trigger notifications
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {ALL_EVENT_TYPES.map((eventType) => {
            const { label, description } = EVENT_TYPE_LABELS[eventType];
            const isEnabled = getRuleEnabled(eventType);
            
            return (
              <div 
                key={eventType}
                className="flex items-center justify-between py-2 border-b last:border-0"
              >
                <div className="space-y-0.5">
                  <div className="flex items-center gap-2">
                    <Label htmlFor={`toggle-${eventType}`} className="text-sm font-medium">
                      {label}
                    </Label>
                    {eventType.includes('threshold') && (
                      <Badge variant="outline" className="text-xs">
                        Package
                      </Badge>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {description}
                  </p>
                </div>
                <Switch
                  id={`toggle-${eventType}`}
                  checked={isEnabled}
                  onCheckedChange={(checked) => handleToggle(eventType, checked)}
                  disabled={updateRule.isPending}
                />
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
