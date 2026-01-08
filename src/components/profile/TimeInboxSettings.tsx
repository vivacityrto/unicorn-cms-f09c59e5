import { useState, useEffect } from 'react';
import { Clock, Settings, Save } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { useTimeCaptureSettings } from '@/hooks/useTimeCaptureSettings';

export function TimeInboxSettings() {
  const { settings, loading, saving, updateSettings } = useTimeCaptureSettings();
  const [localSettings, setLocalSettings] = useState({
    auto_create_meeting_drafts: true,
    min_minutes: 10,
    max_minutes: 240,
    include_organizer_only: false
  });
  const [hasChanges, setHasChanges] = useState(false);

  useEffect(() => {
    if (settings) {
      setLocalSettings({
        auto_create_meeting_drafts: settings.auto_create_meeting_drafts,
        min_minutes: settings.min_minutes,
        max_minutes: settings.max_minutes,
        include_organizer_only: settings.include_organizer_only
      });
    }
  }, [settings]);

  const handleChange = (key: string, value: unknown) => {
    setLocalSettings(prev => ({ ...prev, [key]: value }));
    setHasChanges(true);
  };

  const handleSave = async () => {
    const success = await updateSettings(localSettings);
    if (success) {
      setHasChanges(false);
    }
  };

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <Skeleton className="h-6 w-48" />
        </CardHeader>
        <CardContent className="space-y-4">
          <Skeleton className="h-8 w-full" />
          <Skeleton className="h-8 w-full" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-lg flex items-center gap-2">
          <Clock className="h-5 w-5" />
          Time Inbox Settings
        </CardTitle>
        <CardDescription>
          Configure how calendar meetings are converted to time drafts
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Auto-create drafts */}
        <div className="flex items-center justify-between">
          <div className="space-y-0.5">
            <Label htmlFor="auto-create">Auto-create time drafts</Label>
            <p className="text-xs text-muted-foreground">
              Automatically create drafts from calendar meetings
            </p>
          </div>
          <Switch
            id="auto-create"
            checked={localSettings.auto_create_meeting_drafts}
            onCheckedChange={(v) => handleChange('auto_create_meeting_drafts', v)}
          />
        </div>

        {/* Organizer only */}
        <div className="flex items-center justify-between">
          <div className="space-y-0.5">
            <Label htmlFor="organizer-only">Organizer only</Label>
            <p className="text-xs text-muted-foreground">
              Only create drafts for meetings you organized
            </p>
          </div>
          <Switch
            id="organizer-only"
            checked={localSettings.include_organizer_only}
            onCheckedChange={(v) => handleChange('include_organizer_only', v)}
          />
        </div>

        {/* Duration range */}
        <div className="space-y-3">
          <Label>Duration range (minutes)</Label>
          <div className="flex items-center gap-3">
            <div className="flex-1">
              <Label htmlFor="min-minutes" className="text-xs text-muted-foreground">Min</Label>
              <Input
                id="min-minutes"
                type="number"
                min={5}
                max={60}
                value={localSettings.min_minutes}
                onChange={(e) => handleChange('min_minutes', parseInt(e.target.value) || 10)}
              />
            </div>
            <span className="text-muted-foreground pt-5">to</span>
            <div className="flex-1">
              <Label htmlFor="max-minutes" className="text-xs text-muted-foreground">Max</Label>
              <Input
                id="max-minutes"
                type="number"
                min={60}
                max={480}
                value={localSettings.max_minutes}
                onChange={(e) => handleChange('max_minutes', parseInt(e.target.value) || 240)}
              />
            </div>
          </div>
          <p className="text-xs text-muted-foreground">
            Meetings outside this range will be skipped
          </p>
        </div>

        {hasChanges && (
          <Button onClick={handleSave} disabled={saving} className="w-full">
            <Save className="h-4 w-4 mr-2" />
            {saving ? 'Saving...' : 'Save Settings'}
          </Button>
        )}
      </CardContent>
    </Card>
  );
}