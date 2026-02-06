import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Moon, Loader2 } from 'lucide-react';
import { useNotificationRules, useUpdateQuietHours } from '@/hooks/useTeamsNotifications';

export function QuietHoursCard() {
  const { data: rules, isLoading } = useNotificationRules();
  const updateQuietHours = useUpdateQuietHours();
  
  const [enabled, setEnabled] = useState(false);
  const [startTime, setStartTime] = useState('22:00');
  const [endTime, setEndTime] = useState('07:00');

  // Initialize from first rule that has quiet hours
  useEffect(() => {
    if (rules && rules.length > 0) {
      const ruleWithQuietHours = rules.find(r => r.quiet_hours_start && r.quiet_hours_end);
      if (ruleWithQuietHours) {
        setEnabled(true);
        setStartTime(ruleWithQuietHours.quiet_hours_start || '22:00');
        setEndTime(ruleWithQuietHours.quiet_hours_end || '07:00');
      }
    }
  }, [rules]);

  const handleSave = async () => {
    await updateQuietHours.mutateAsync({
      quietHoursStart: enabled ? startTime : null,
      quietHoursEnd: enabled ? endTime : null,
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
            <Moon className="h-5 w-5 text-primary" />
          </div>
          <div>
            <CardTitle className="text-lg">Quiet Hours</CardTitle>
            <CardDescription>
              Pause notifications during specific times
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center justify-between">
          <div className="space-y-0.5">
            <Label htmlFor="quiet-hours-enabled" className="text-sm font-medium">
              Enable Quiet Hours
            </Label>
            <p className="text-xs text-muted-foreground">
              Notifications will be queued during quiet hours
            </p>
          </div>
          <Switch
            id="quiet-hours-enabled"
            checked={enabled}
            onCheckedChange={setEnabled}
          />
        </div>

        {enabled && (
          <div className="grid grid-cols-2 gap-4 pt-2">
            <div className="space-y-2">
              <Label htmlFor="quiet-start">Start Time</Label>
              <Input
                id="quiet-start"
                type="time"
                value={startTime}
                onChange={(e) => setStartTime(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="quiet-end">End Time</Label>
              <Input
                id="quiet-end"
                type="time"
                value={endTime}
                onChange={(e) => setEndTime(e.target.value)}
              />
            </div>
          </div>
        )}

        <Button 
          onClick={handleSave}
          disabled={updateQuietHours.isPending}
          className="w-full"
        >
          {updateQuietHours.isPending && (
            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
          )}
          Save Quiet Hours
        </Button>
      </CardContent>
    </Card>
  );
}
