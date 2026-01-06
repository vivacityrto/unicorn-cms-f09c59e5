import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { 
  Save, 
  Calendar, 
  Clock, 
  Linkedin, 
  Link as LinkIcon,
  MapPin,
  Globe
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';

interface CSCProfileFieldsProps {
  user: {
    user_uuid: string;
    linkedin_url?: string | null;
    booking_url?: string | null;
    working_days?: string[] | null;
    working_hours?: { start: string; end: string } | null;
    availability_note?: string | null;
    public_holiday_region?: string | null;
    is_csc?: boolean;
  };
  canEdit: boolean;
  onSave: () => void;
}

const DAYS = [
  { value: 'mon', label: 'Mon' },
  { value: 'tue', label: 'Tue' },
  { value: 'wed', label: 'Wed' },
  { value: 'thu', label: 'Thu' },
  { value: 'fri', label: 'Fri' },
  { value: 'sat', label: 'Sat' },
  { value: 'sun', label: 'Sun' },
];

const HOLIDAY_REGIONS = [
  { value: 'AU-NSW', label: 'Australia - NSW' },
  { value: 'AU-VIC', label: 'Australia - VIC' },
  { value: 'AU-QLD', label: 'Australia - QLD' },
  { value: 'AU-SA', label: 'Australia - SA' },
  { value: 'AU-WA', label: 'Australia - WA' },
  { value: 'AU-TAS', label: 'Australia - TAS' },
  { value: 'AU-NT', label: 'Australia - NT' },
  { value: 'AU-ACT', label: 'Australia - ACT' },
  { value: 'PH', label: 'Philippines' },
  { value: 'NZ', label: 'New Zealand' },
  { value: 'SG', label: 'Singapore' },
  { value: 'MY', label: 'Malaysia' },
  { value: 'GB', label: 'United Kingdom' },
  { value: 'US', label: 'United States' },
];

export function CSCProfileFields({ user, canEdit, onSave }: CSCProfileFieldsProps) {
  const { toast } = useToast();
  const [saving, setSaving] = useState(false);
  
  const [formData, setFormData] = useState({
    linkedin_url: user.linkedin_url || '',
    booking_url: user.booking_url || '',
    working_days: user.working_days || ['mon', 'tue', 'wed', 'thu', 'fri'],
    working_hours_start: user.working_hours?.start || '09:00',
    working_hours_end: user.working_hours?.end || '17:00',
    availability_note: user.availability_note || '',
    public_holiday_region: user.public_holiday_region || '',
  });

  // Only show this component for CSC users
  if (!user.is_csc) {
    return null;
  }

  const handleDayToggle = (day: string) => {
    setFormData(prev => ({
      ...prev,
      working_days: prev.working_days.includes(day)
        ? prev.working_days.filter(d => d !== day)
        : [...prev.working_days, day]
    }));
  };

  const handleSave = async () => {
    try {
      setSaving(true);

      // Validate URLs
      if (formData.linkedin_url && !formData.linkedin_url.match(/^https?:\/\//)) {
        toast({
          title: 'Invalid URL',
          description: 'LinkedIn URL must start with http:// or https://',
          variant: 'destructive',
        });
        return;
      }

      if (formData.booking_url && !formData.booking_url.match(/^https?:\/\//)) {
        toast({
          title: 'Invalid URL',
          description: 'Booking URL must start with http:// or https://',
          variant: 'destructive',
        });
        return;
      }

      const { data, error } = await supabase.rpc('update_my_csc_profile', {
        p_linkedin_url: formData.linkedin_url || null,
        p_booking_url: formData.booking_url || null,
        p_working_days: formData.working_days,
        p_working_hours: { 
          start: formData.working_hours_start, 
          end: formData.working_hours_end 
        },
        p_availability_note: formData.availability_note || null,
        p_public_holiday_region: formData.public_holiday_region || null,
      });

      if (error) throw error;

      const result = data as { success: boolean; error?: string };
      if (!result.success) {
        throw new Error(result.error || 'Failed to update CSC profile');
      }

      toast({
        title: 'Success',
        description: 'CSC profile updated successfully',
      });

      onSave();
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message,
        variant: 'destructive',
      });
    } finally {
      setSaving(false);
    }
  };

  const hasChanges = 
    formData.linkedin_url !== (user.linkedin_url || '') ||
    formData.booking_url !== (user.booking_url || '') ||
    JSON.stringify(formData.working_days.sort()) !== JSON.stringify((user.working_days || []).sort()) ||
    formData.working_hours_start !== (user.working_hours?.start || '09:00') ||
    formData.working_hours_end !== (user.working_hours?.end || '17:00') ||
    formData.availability_note !== (user.availability_note || '') ||
    formData.public_holiday_region !== (user.public_holiday_region || '');

  return (
    <Card className="border-emerald-200 bg-emerald-50/30 dark:border-emerald-900/50 dark:bg-emerald-950/20">
      <CardHeader>
        <div className="flex items-center gap-2">
          <Badge variant="default" className="bg-emerald-600">CSC</Badge>
          <CardTitle>Client Success Champion Profile</CardTitle>
        </div>
        <CardDescription>
          This information is visible to tenants assigned to you
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Links section */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="linkedin_url" className="flex items-center gap-2">
              <Linkedin className="h-4 w-4" />
              LinkedIn Profile URL
            </Label>
            <Input
              id="linkedin_url"
              value={formData.linkedin_url}
              onChange={(e) => setFormData({ ...formData, linkedin_url: e.target.value })}
              disabled={!canEdit}
              placeholder="https://linkedin.com/in/yourprofile"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="booking_url" className="flex items-center gap-2">
              <Calendar className="h-4 w-4" />
              Meeting Booking URL
            </Label>
            <Input
              id="booking_url"
              value={formData.booking_url}
              onChange={(e) => setFormData({ ...formData, booking_url: e.target.value })}
              disabled={!canEdit}
              placeholder="https://outlook.office365.com/book/..."
            />
            <p className="text-xs text-muted-foreground">
              Microsoft Bookings or Calendly link for tenants to schedule meetings
            </p>
          </div>
        </div>

        {/* Working schedule */}
        <div className="space-y-4">
          <Label className="flex items-center gap-2">
            <Clock className="h-4 w-4" />
            Working Schedule
          </Label>
          
          <div className="space-y-3">
            <div className="flex flex-wrap gap-2">
              {DAYS.map((day) => (
                <button
                  key={day.value}
                  type="button"
                  onClick={() => canEdit && handleDayToggle(day.value)}
                  disabled={!canEdit}
                  className={`px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${
                    formData.working_days.includes(day.value)
                      ? 'bg-primary text-primary-foreground'
                      : 'bg-muted text-muted-foreground hover:bg-muted/80'
                  } ${!canEdit ? 'cursor-not-allowed opacity-60' : 'cursor-pointer'}`}
                >
                  {day.label}
                </button>
              ))}
            </div>

            <div className="flex items-center gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="working_hours_start" className="text-xs">Start</Label>
                <Input
                  id="working_hours_start"
                  type="time"
                  value={formData.working_hours_start}
                  onChange={(e) => setFormData({ ...formData, working_hours_start: e.target.value })}
                  disabled={!canEdit}
                  className="w-28"
                />
              </div>
              <span className="text-muted-foreground mt-6">to</span>
              <div className="space-y-1.5">
                <Label htmlFor="working_hours_end" className="text-xs">End</Label>
                <Input
                  id="working_hours_end"
                  type="time"
                  value={formData.working_hours_end}
                  onChange={(e) => setFormData({ ...formData, working_hours_end: e.target.value })}
                  disabled={!canEdit}
                  className="w-28"
                />
              </div>
            </div>
          </div>
        </div>

        {/* Holiday region */}
        <div className="space-y-2">
          <Label htmlFor="public_holiday_region" className="flex items-center gap-2">
            <MapPin className="h-4 w-4" />
            Public Holiday Region
          </Label>
          <select
            id="public_holiday_region"
            value={formData.public_holiday_region}
            onChange={(e) => setFormData({ ...formData, public_holiday_region: e.target.value })}
            disabled={!canEdit}
            className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <option value="">Select region...</option>
            {HOLIDAY_REGIONS.map((region) => (
              <option key={region.value} value={region.value}>
                {region.label}
              </option>
            ))}
          </select>
        </div>

        {/* Availability note */}
        <div className="space-y-2">
          <Label htmlFor="availability_note" className="flex items-center gap-2">
            <Globe className="h-4 w-4" />
            Availability Note
          </Label>
          <Textarea
            id="availability_note"
            value={formData.availability_note}
            onChange={(e) => setFormData({ ...formData, availability_note: e.target.value })}
            disabled={!canEdit}
            placeholder="e.g., 'Available for calls 9am-3pm. Best contacted via email for non-urgent matters.'"
            rows={2}
          />
          <p className="text-xs text-muted-foreground">
            Optional note displayed to tenants about your availability
          </p>
        </div>

        {/* Save button */}
        {canEdit && hasChanges && (
          <div className="flex justify-end pt-4 border-t">
            <Button onClick={handleSave} disabled={saving}>
              <Save className="mr-2 h-4 w-4" />
              {saving ? 'Saving...' : 'Save CSC Profile'}
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
