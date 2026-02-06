import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/useAuth';
import { Save, Lock, Mail, User, Phone, Briefcase, Clock, Globe, MapPin } from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue, SelectSeparator } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';

interface ProfileTabProps {
  formData: {
    first_name: string;
    last_name: string;
    email: string;
    phone: string;
    job_title: string;
    timezone: string;
    bio: string;
    newPassword: string;
    confirmPassword: string;
  };
  setFormData: (data: any) => void;
  timezoneOptions: { value: string; label: string }[];
  onSaveProfile: () => Promise<void>;
  loading: boolean;
}

export function ProfileTab({
  formData,
  setFormData,
  timezoneOptions,
  onSaveProfile,
  loading,
}: ProfileTabProps) {
  const { toast } = useToast();
  const [passwordLoading, setPasswordLoading] = useState(false);

  const handleChangePassword = async () => {
    if (!formData.newPassword || !formData.confirmPassword) {
      toast({
        title: 'Error',
        description: 'Please fill in all password fields',
        variant: 'destructive',
      });
      return;
    }

    if (formData.newPassword !== formData.confirmPassword) {
      toast({
        title: 'Error',
        description: 'Passwords do not match',
        variant: 'destructive',
      });
      return;
    }

    if (formData.newPassword.length < 6) {
      toast({
        title: 'Error',
        description: 'Password must be at least 6 characters',
        variant: 'destructive',
      });
      return;
    }

    try {
      setPasswordLoading(true);

      const { error } = await supabase.auth.updateUser({
        password: formData.newPassword,
      });

      if (error) throw error;

      toast({
        title: 'Success',
        description: 'Password changed successfully',
      });

      setFormData({
        ...formData,
        newPassword: '',
        confirmPassword: '',
      });
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message,
        variant: 'destructive',
      });
    } finally {
      setPasswordLoading(false);
    }
  };

  return (
    <div className="space-y-6">

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Profile Settings */}
        <Card className="border-0 shadow-lg overflow-hidden lg:col-span-2">
          <div className="bg-muted/30 px-6 h-14 border-b border-border/50 flex items-center">
            <h2 className="font-semibold">Personal Information</h2>
          </div>
          <CardContent className="p-6 space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-2">
                <Label htmlFor="first_name">
                  <User className="inline h-4 w-4 mr-2" />
                  First Name
                </Label>
                <Input
                  id="first_name"
                  value={formData.first_name}
                  onChange={(e) => setFormData({ ...formData, first_name: e.target.value })}
                  placeholder="First name"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="last_name">
                  <User className="inline h-4 w-4 mr-2" />
                  Last Name
                </Label>
                <Input
                  id="last_name"
                  value={formData.last_name}
                  onChange={(e) => setFormData({ ...formData, last_name: e.target.value })}
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
                  value={formData.email}
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
                  value={formData.phone}
                  onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
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
                >
                  <SelectTrigger id="timezone" className="w-full h-11 rounded-lg border-0 bg-muted/50 ring-1 ring-border/50 hover:ring-border focus:ring-2 focus:ring-primary/30">
                    <SelectValue placeholder="Select timezone">
                      {formData.timezone && (
                        <div className="flex items-center gap-2">
                          <MapPin className="h-4 w-4" />
                          <span>{timezoneOptions.find(tz => tz.value === formData.timezone)?.label || formData.timezone}</span>
                        </div>
                      )}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent className="bg-background w-[var(--radix-select-trigger-width)]">
                    {timezoneOptions.map((tz, index) => (
                      <div key={tz.value}>
                        <SelectItem 
                          value={tz.value} 
                          className="cursor-pointer data-[state=checked]:bg-transparent focus:bg-transparent data-[state=checked]:text-foreground"
                        >
                          <div className="flex items-center gap-2">
                            <MapPin className={`h-4 w-4 ${formData.timezone === tz.value ? 'text-green-500' : 'text-foreground'}`} />
                            <span className="text-foreground">{tz.label}</span>
                          </div>
                        </SelectItem>
                        {index < timezoneOptions.length - 1 && <SelectSeparator />}
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
                placeholder="Tell us about yourself..."
                rows={4}
                className="bg-[hsl(188deg_74%_51%_/_8%)]"
              />
            </div>

            <div className="flex justify-end">
              <Button onClick={onSaveProfile} disabled={loading} className="bg-[hsl(188_74%_51%)] hover:bg-[hsl(188_74%_51%)]/90">
                <Save className="mr-2 h-4 w-4" />
                {loading ? 'Saving...' : 'Save Changes'}
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Password Settings */}
        <Card className="border-0 shadow-lg overflow-hidden h-fit">
          <div className="bg-muted/30 px-6 h-14 border-b border-border/50 flex items-center">
            <h2 className="font-semibold">Change Password</h2>
          </div>
          <CardContent className="p-6 space-y-4">
            <div className="space-y-2">
              <Label htmlFor="newPassword">
                <Lock className="inline h-4 w-4 mr-2" />
                New Password
              </Label>
              <Input
                id="newPassword"
                type="password"
                value={formData.newPassword}
                onChange={(e) => setFormData({ ...formData, newPassword: e.target.value })}
                placeholder="Enter new password"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="confirmPassword">
                <Lock className="inline h-4 w-4 mr-2" />
                Confirm Password
              </Label>
              <Input
                id="confirmPassword"
                type="password"
                value={formData.confirmPassword}
                onChange={(e) => setFormData({ ...formData, confirmPassword: e.target.value })}
                placeholder="Confirm new password"
              />
            </div>

            <div className="flex justify-end">
              <Button onClick={handleChangePassword} disabled={passwordLoading} className="bg-[hsl(188_74%_51%)] hover:bg-[hsl(188_74%_51%)]/90">
                <Lock className="mr-2 h-4 w-4" />
                {passwordLoading ? 'Changing...' : 'Change Password'}
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
