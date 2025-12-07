import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Save, Mail, Phone, Briefcase, Clock, Globe } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';

interface ProfileFormProps {
  user: {
    user_uuid: string;
    first_name: string;
    last_name: string;
    email: string;
    mobile_phone: string | null;
    job_title: string | null;
    timezone: string | null;
    bio: string | null;
  };
  canEdit: boolean;
  onSave: () => void;
}

const TIMEZONES = [
  { value: 'Australia/Sydney', label: 'Sydney (AEDT/AEST)' },
  { value: 'Australia/Melbourne', label: 'Melbourne (AEDT/AEST)' },
  { value: 'Australia/Brisbane', label: 'Brisbane (AEST)' },
  { value: 'Australia/Perth', label: 'Perth (AWST)' },
  { value: 'Australia/Adelaide', label: 'Adelaide (ACDT/ACST)' },
  { value: 'Australia/Darwin', label: 'Darwin (ACST)' },
];

export function ProfileForm({ user, canEdit, onSave }: ProfileFormProps) {
  const { toast } = useToast();
  const [saving, setSaving] = useState(false);
  const [formData, setFormData] = useState({
    first_name: user.first_name || '',
    last_name: user.last_name || '',
    mobile_phone: user.mobile_phone || '',
    job_title: user.job_title || '',
    timezone: user.timezone || 'Australia/Sydney',
    bio: user.bio || '',
  });

  const handleSave = async () => {
    try {
      setSaving(true);

      const { data, error } = await supabase.functions.invoke('update-user-profile', {
        body: {
          user_uuid: user.user_uuid,
          ...formData,
        },
      });

      if (error) throw error;

      if (!data?.ok) {
        throw new Error(data?.detail || data?.code || 'Failed to update profile');
      }

      toast({
        title: 'Success',
        description: 'Profile updated successfully',
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
    formData.first_name !== (user.first_name || '') ||
    formData.last_name !== (user.last_name || '') ||
    formData.mobile_phone !== (user.mobile_phone || '') ||
    formData.job_title !== (user.job_title || '') ||
    formData.timezone !== (user.timezone || 'Australia/Sydney') ||
    formData.bio !== (user.bio || '');

  return (
    <Card>
      <CardHeader>
        <CardTitle>Personal Information</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="first_name">First Name *</Label>
            <Input
              id="first_name"
              value={formData.first_name}
              onChange={(e) => setFormData({ ...formData, first_name: e.target.value })}
              disabled={!canEdit}
              placeholder="First name"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="last_name">Last Name *</Label>
            <Input
              id="last_name"
              value={formData.last_name}
              onChange={(e) => setFormData({ ...formData, last_name: e.target.value })}
              disabled={!canEdit}
              placeholder="Last name"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="email">
              <Mail className="inline h-4 w-4 mr-2" />
              Email
            </Label>
            <Input
              id="email"
              type="email"
              value={user.email}
              disabled
              className="bg-muted"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="phone">
              <Phone className="inline h-4 w-4 mr-2" />
              Phone Number
            </Label>
            <Input
              id="phone"
              value={formData.mobile_phone}
              onChange={(e) => setFormData({ ...formData, mobile_phone: e.target.value })}
              disabled={!canEdit}
              placeholder="e.g., 0412 345 678"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="job_title">
              <Briefcase className="inline h-4 w-4 mr-2" />
              Job Title
            </Label>
            <Input
              id="job_title"
              value={formData.job_title}
              onChange={(e) => setFormData({ ...formData, job_title: e.target.value })}
              disabled={!canEdit}
              placeholder="e.g., Compliance Manager"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="timezone">
              <Clock className="inline h-4 w-4 mr-2" />
              Timezone
            </Label>
            <Select
              value={formData.timezone}
              onValueChange={(value) => setFormData({ ...formData, timezone: value })}
              disabled={!canEdit}
            >
              <SelectTrigger id="timezone">
                <SelectValue placeholder="Select timezone" />
              </SelectTrigger>
              <SelectContent>
                {TIMEZONES.map((tz) => (
                  <SelectItem key={tz.value} value={tz.value}>
                    {tz.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="bio">
            <Globe className="inline h-4 w-4 mr-2" />
            Bio
          </Label>
          <Textarea
            id="bio"
            value={formData.bio}
            onChange={(e) => setFormData({ ...formData, bio: e.target.value })}
            disabled={!canEdit}
            placeholder="Tell us about yourself..."
            rows={4}
          />
        </div>

        {canEdit && hasChanges && (
          <div className="flex justify-end pt-4 border-t">
            <Button onClick={handleSave} disabled={saving}>
              <Save className="mr-2 h-4 w-4" />
              {saving ? 'Saving...' : 'Save Changes'}
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
