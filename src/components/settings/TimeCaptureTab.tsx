import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { CalendarClock } from 'lucide-react';
import { useTimeCaptureSettings } from '@/hooks/useTimeCaptureSettings';

export function TimeCaptureTab() {
  const { settings, loading, saving, updateSettings } = useTimeCaptureSettings();

  if (loading) {
    return (
      <Card className="border-0 shadow-lg overflow-hidden">
        <div className="bg-muted/30 px-6 h-14 border-b border-border/50 flex items-center gap-2">
          <CalendarClock className="h-5 w-5 text-muted-foreground" />
          <h2 className="font-semibold">Time Capture Settings</h2>
        </div>
        <CardContent className="p-6">
          <div className="animate-pulse space-y-4">
            <div className="h-4 bg-muted rounded w-1/2"></div>
            <div className="h-10 bg-muted rounded"></div>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <Card className="border-0 shadow-lg overflow-hidden">
        <div className="bg-muted/30 px-6 h-14 border-b border-border/50 flex items-center gap-2">
          <CalendarClock className="h-5 w-5 text-muted-foreground" />
          <h2 className="font-semibold">Time Capture Settings</h2>
        </div>
        <CardContent className="p-6 space-y-6">
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label htmlFor="auto-create-drafts" className="text-base font-medium">
                Auto-create drafts from ended meetings
              </Label>
              <p className="text-sm text-muted-foreground">
                Automatically create time entry drafts when your calendar meetings end
              </p>
            </div>
            <Switch
              id="auto-create-drafts"
              checked={settings?.auto_create_meeting_drafts ?? true}
              onCheckedChange={(checked) => updateSettings({ auto_create_meeting_drafts: checked })}
              disabled={saving}
            />
          </div>

          {settings?.auto_create_meeting_drafts && (
            <>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="min-minutes">Minimum duration (minutes)</Label>
                  <Input
                    id="min-minutes"
                    type="number"
                    min={1}
                    max={settings?.max_minutes || 240}
                    value={settings?.min_minutes || 10}
                    onChange={(e) => updateSettings({ min_minutes: parseInt(e.target.value) || 10 })}
                    disabled={saving}
                  />
                  <p className="text-xs text-muted-foreground">Skip meetings shorter than this</p>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="max-minutes">Maximum duration (minutes)</Label>
                  <Input
                    id="max-minutes"
                    type="number"
                    min={settings?.min_minutes || 10}
                    max={480}
                    value={settings?.max_minutes || 240}
                    onChange={(e) => updateSettings({ max_minutes: parseInt(e.target.value) || 240 })}
                    disabled={saving}
                  />
                  <p className="text-xs text-muted-foreground">Skip meetings longer than this</p>
                </div>
              </div>

              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label htmlFor="organizer-only" className="text-base font-medium">
                    Only for meetings I organized
                  </Label>
                  <p className="text-sm text-muted-foreground">
                    Only create drafts for meetings where you are the organizer
                  </p>
                </div>
                <Switch
                  id="organizer-only"
                  checked={settings?.include_organizer_only ?? false}
                  onCheckedChange={(checked) => updateSettings({ include_organizer_only: checked })}
                  disabled={saving}
                />
              </div>
            </>
          )}
        </CardContent>
      </Card>

      <Card className="border-0 shadow-lg">
        <CardContent className="p-6">
          <p className="text-sm text-muted-foreground">
            Time capture settings control how calendar meetings are automatically converted to time entry drafts.
            Configure your calendar connection in the <strong>Calendar</strong> tab to enable automatic time capture.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
