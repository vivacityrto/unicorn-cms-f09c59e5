/**
 * CelebrationSettings – Unicorn 2.0
 *
 * Toggles for celebration preferences in user profile.
 * Persisted to user_ui_prefs table.
 */

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Sparkles, Volume2, Eye } from 'lucide-react';
import { useUIPrefs } from '@/hooks/use-ui-prefs';

export function CelebrationSettings() {
  const { prefs, loading, updatePref, osReducedMotion } = useUIPrefs();

  if (loading) return null;

  return (
    <Card>
      <CardHeader className="pb-4">
        <CardTitle className="text-lg flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-primary" />
          Celebration & Motion
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Celebrations enabled */}
        <div className="flex items-center justify-between gap-4">
          <div className="space-y-0.5">
            <Label htmlFor="celebrations-enabled" className="font-medium">
              Celebrations enabled
            </Label>
            <p className="text-xs text-muted-foreground">
              Show milestone celebrations when goals are achieved
            </p>
          </div>
          <Switch
            id="celebrations-enabled"
            checked={prefs.celebrations_enabled}
            onCheckedChange={(v) => updatePref('celebrations_enabled', v)}
          />
        </div>

        {/* Reduce motion */}
        <div className="flex items-center justify-between gap-4">
          <div className="space-y-0.5">
            <Label htmlFor="reduce-motion" className="font-medium flex items-center gap-2">
              <Eye className="h-3.5 w-3.5" />
              Reduce motion effects
            </Label>
            <p className="text-xs text-muted-foreground">
              {osReducedMotion
                ? 'Your OS prefers reduced motion. This is enabled by default.'
                : 'Disable fireworks animations. Banners will still appear.'}
            </p>
          </div>
          <Switch
            id="reduce-motion"
            checked={prefs.reduce_motion}
            onCheckedChange={(v) => updatePref('reduce_motion', v)}
          />
        </div>

        {/* Sound enabled */}
        <div className="flex items-center justify-between gap-4">
          <div className="space-y-0.5">
            <Label htmlFor="sound-enabled" className="font-medium flex items-center gap-2">
              <Volume2 className="h-3.5 w-3.5" />
              Sound enabled
            </Label>
            <p className="text-xs text-muted-foreground">
              Play a subtle sound for major milestones (Tier 3 only)
            </p>
          </div>
          <Switch
            id="sound-enabled"
            checked={prefs.sound_enabled}
            onCheckedChange={(v) => updatePref('sound_enabled', v)}
          />
        </div>
      </CardContent>
    </Card>
  );
}
