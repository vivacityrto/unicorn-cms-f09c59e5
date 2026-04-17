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
import { useTimezones, groupTimezones } from '@/hooks/useTimezones';

interface ProfileFormProps {
  user: {
    user_uuid: string;
    first_name: string;
    last_name: string;
    full_name?: string | null;
    email: string;
    mobile_phone: string | null;
    job_title: string | null;
    timezone: string | null;
    bio: string | null;
    personal_email?: string | null;
    personal_phone?: string | null;
  };
  canEdit: boolean;
  canEditWorkEmail?: boolean;
  onSave: () => void;
}

export function ProfileForm({ user, canEdit, canEditWorkEmail = false, onSave }: ProfileFormProps) {
  const { toast } = useToast();
  const [saving, setSaving] = useState(false);
  const { data: timezones = [], isLoading: loadingTimezones } = useTimezones();
  const groupedTimezones = groupTimezones(timezones);

  const [formData, setFormData] = useState({
    first_name: user.first_name || '',
    last_name: user.last_name || '',
    full_name: user.full_name || '',
    email: user.email || '',
    mobile_phone: user.mobile_phone || '',
    personal_email: user.personal_email || '',
    personal_phone: user.personal_phone || '',
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
    formData.full_name !== (user.full_name || '') ||
    formData.email !== (user.email || '') ||
    formData.mobile_phone !== (user.mobile_phone || '') ||
    formData.personal_email !== (user.personal_email || '') ||
    formData.personal_phone !== (user.personal_phone || '') ||
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

          <div className="space-y-2 md:col-span-2">
            <Label htmlFor="full_name">Full Legal Name</Label>
            <Input
              id="full_name"
              value={formData.full_name}
              onChange={(e) => setFormData({ ...formData, full_name: e.target.value })}
              disabled={!canEdit}
              placeholder="Full name as it appears on legal documents (supports multiple given names)"
            />
            <p className="text-xs text-muted-foreground">
              Use this for users with more than two names (e.g. multiple given names).
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="email">
              <Mail className="inline h-4 w-4 mr-2" />
              Vivacity Email
            </Label>
            <Input
              id="email"
              type="email"
              value={formData.email}
              onChange={(e) => setFormData({ ...formData, email: e.target.value })}
              disabled={!canEdit || !canEditWorkEmail}
              className={!canEditWorkEmail ? 'bg-muted' : undefined}
              placeholder="firstname.lastname@vivacity.com.au"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="personal_email">
              <Mail className="inline h-4 w-4 mr-2" />
              Personal Email
            </Label>
            <Input
              id="personal_email"
              type="email"
              value={formData.personal_email}
              onChange={(e) => setFormData({ ...formData, personal_email: e.target.value })}
              disabled={!canEdit}
              placeholder="e.g., name@gmail.com"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="phone">
              <Phone className="inline h-4 w-4 mr-2" />
              Work Phone
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
            <Label htmlFor="personal_phone">
              <Phone className="inline h-4 w-4 mr-2" />
              Personal Phone
            </Label>
            <Input
              id="personal_phone"
              value={formData.personal_phone}
              onChange={(e) => setFormData({ ...formData, personal_phone: e.target.value })}
              disabled={!canEdit}
              placeholder="e.g., +63 991 234 5678"
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
              disabled={!canEdit || loadingTimezones}
            >
              <SelectTrigger id="timezone">
                <SelectValue placeholder="Select timezone" />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(groupedTimezones).map(([group, tzList]) => (
                  <div key={group}>
                    <div className="px-2 py-1.5 text-xs font-semibold text-muted-foreground">{group}</div>
                    {tzList.map((tz) => (
                      <SelectItem key={tz.tz} value={tz.tz}>
                        {tz.label}
                      </SelectItem>
                    ))}
                  </div>
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
