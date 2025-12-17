import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent } from '@/components/ui/card';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/useAuth';
import { Upload, Save, Lock, Mail, User, Phone, Briefcase, Clock, Globe, MapPin, Check } from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue, SelectSeparator } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';

export default function Settings() {
  const { toast } = useToast();
  const { user, profile, refreshProfile } = useAuth();
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [tenantInfo, setTenantInfo] = useState<any>(null);
  const [liveTimes, setLiveTimes] = useState({ sydney: '', manila: '' });
  const [timezoneOptions, setTimezoneOptions] = useState<{ value: string; label: string }[]>([]);
  const [formData, setFormData] = useState({
    first_name: '',
    last_name: '',
    email: '',
    phone: '',
    job_title: '',
    timezone: 'Australia/Sydney',
    bio: '',
    currentPassword: '',
    newPassword: '',
    confirmPassword: '',
  });

  // Fetch timezone options from database
  useEffect(() => {
    const fetchTimezones = async () => {
      const { data, error } = await supabase
        .from('timezone_options')
        .select('timezone_value, timezone_label')
        .eq('is_active', true)
        .order('id');
      
      if (!error && data) {
        setTimezoneOptions(data.map(tz => ({
          value: tz.timezone_value,
          label: tz.timezone_label
        })));
      }
    };
    fetchTimezones();
  }, []);

  // Live time update effect
  useEffect(() => {
    const updateTimes = () => {
      const now = new Date();
      const sydneyTime = now.toLocaleString('en-AU', {
        timeZone: 'Australia/Sydney',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: true,
        day: '2-digit',
        month: 'short',
      });
      const manilaTime = now.toLocaleString('en-PH', {
        timeZone: 'Asia/Manila',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: true,
        day: '2-digit',
        month: 'short',
      });
      setLiveTimes({ sydney: sydneyTime, manila: manilaTime });
    };
    
    updateTimes();
    const interval = setInterval(updateTimes, 1000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (user && profile) {
      fetchUserData();
    }
  }, [user, profile]);

  const fetchUserData = async () => {
    try {
      const { data: userData, error } = await supabase
        .from('users')
        .select('*')
        .eq('user_uuid', user?.id)
        .single();

      if (error) throw error;

      setFormData({
        first_name: userData.first_name || '',
        last_name: userData.last_name || '',
        email: userData.email || '',
        phone: userData.mobile_phone || '',
        job_title: userData.job_title || '',
        timezone: userData.timezone || 'Australia/Sydney',
        bio: userData.bio || '',
        currentPassword: '',
        newPassword: '',
        confirmPassword: '',
      });
      setAvatarUrl(userData.avatar_url);

      // Fetch tenant information
      if (userData.tenant_id) {
        const { data: tenantData } = await supabase
          .from('tenants')
          .select('*, tenant_profiles(*)')
          .eq('id', userData.tenant_id)
          .single();
        
        if (tenantData) {
          setTenantInfo(tenantData);
        }
      }
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message,
        variant: 'destructive',
      });
    }
  };

  const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user) return;

    // Validate file type
    if (!file.type.startsWith('image/')) {
      toast({
        title: 'Invalid file',
        description: 'Please upload an image file',
        variant: 'destructive',
      });
      return;
    }

    // Validate file size (5MB limit)
    if (file.size > 5 * 1024 * 1024) {
      toast({
        title: 'File too large',
        description: 'Please upload an image smaller than 5MB',
        variant: 'destructive',
      });
      return;
    }

    try {
      setUploading(true);

      const fileExt = file.name.split('.').pop();
      const fileName = `profile.${fileExt}`;
      const filePath = `${user.id}/${fileName}`;

      const { error: uploadError } = await supabase.storage
        .from('avatars')
        .upload(filePath, file, { upsert: true });

      if (uploadError) {
        // Provide clear error messages for common issues
        const errorMsg = uploadError.message.includes('new row violates row-level security') 
          ? 'Permission denied: Unable to upload avatar. Please contact support.'
          : uploadError.message || 'Failed to upload avatar';
        throw new Error(errorMsg);
      }

      // Database trigger automatically updates profile and audit log
      const { data: { publicUrl } } = supabase.storage
        .from('avatars')
        .getPublicUrl(filePath);

      setAvatarUrl(publicUrl);
      toast({
        title: 'Success',
        description: 'Profile photo updated successfully',
      });

      // Refresh auth profile to update avatar across the app
      await refreshProfile();
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message || 'Failed to upload avatar',
        variant: 'destructive',
      });
    } finally {
      setUploading(false);
    }
  };

  const handleSaveProfile = async () => {
    if (!user) return;

    try {
      setLoading(true);

      const { error } = await supabase
        .from('users')
        .update({
          first_name: formData.first_name,
          last_name: formData.last_name,
          mobile_phone: formData.phone,
          job_title: formData.job_title,
          timezone: formData.timezone,
          bio: formData.bio,
        })
        .eq('user_uuid', user.id);

      if (error) throw error;

      toast({
        title: 'Success',
        description: 'Profile updated successfully',
      });
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message,
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

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
      setLoading(true);

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
        currentPassword: '',
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
      setLoading(false);
    }
  };

  const initials = `${formData.first_name?.[0] || ''}${formData.last_name?.[0] || ''}`.toUpperCase() || 'U';

  return (
    <div className="min-h-screen bg-background animate-fade-in">
      {/* Header Card */}
      <div className="px-6 pt-6">
        <Card className="border-0 shadow-lg overflow-hidden">
          <div className="px-6 py-4 border-b border-white/20" style={{
            backgroundImage: 'linear-gradient(135deg, rgb(98 33 145) 0%, rgb(213 28 73 / 72%) 100%)'
          }}>
            <div className="flex items-center gap-4">
              <div className="relative">
                <Avatar className="h-16 w-16 border-2 border-white/30">
                  <AvatarImage src={avatarUrl || undefined} />
                  <AvatarFallback className="bg-white/20 text-white text-xl font-semibold">{initials}</AvatarFallback>
                </Avatar>
                <label htmlFor="avatar-upload" className="absolute bottom-0 right-0 cursor-pointer">
                  <div className="bg-white text-primary rounded-full p-1.5 shadow-lg hover:bg-white/90 transition-colors">
                    <Upload className="h-3 w-3" />
                  </div>
                  <input
                    id="avatar-upload"
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={handleAvatarUpload}
                    disabled={uploading}
                  />
                </label>
              </div>
              <div className="space-y-1 flex-1">
                <h1 className="text-xl font-semibold text-white">
                  {formData.first_name} {formData.last_name}
                </h1>
                <p className="text-sm text-white/70">{formData.email}</p>
                <p className="text-xs text-white/50">
                  Manage your account settings and preferences
                </p>
              </div>
              <div className="text-right space-y-1">
                <div className="flex items-center justify-end gap-2 text-[0.65rem] text-white/70">
                  <span className="text-white/50">AU</span>
                  <span className="font-mono">{liveTimes.sydney}</span>
                </div>
                <div className="flex items-center justify-end gap-2 text-[0.65rem] text-white/70">
                  <span className="text-white/50">PH</span>
                  <span className="font-mono">{liveTimes.manila}</span>
                </div>
              </div>
            </div>
          </div>
        </Card>
      </div>

      <div className="px-6 py-6 space-y-6">
        {/* Profile and Password Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Profile Settings */}
          <Card className="border-0 shadow-lg overflow-hidden animate-scale-in lg:col-span-2">
            <div className="bg-muted/30 px-6 h-14 border-b border-border/50 flex items-center">
              <h2 className="font-semibold">Profile Information</h2>
            </div>
            <CardContent className="p-6 space-y-6">
              {/* Form Fields */}
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
              <Button onClick={handleSaveProfile} disabled={loading} className="bg-[hsl(188_74%_51%)] hover:bg-[hsl(188_74%_51%)]/90">
                <Save className="mr-2 h-4 w-4" />
                {loading ? 'Saving...' : 'Save Changes'}
              </Button>
            </div>
            </CardContent>
          </Card>

          {/* Password Settings */}
          <Card className="border-0 shadow-lg overflow-hidden animate-scale-in h-fit" style={{ animationDelay: '100ms' }}>
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
                <Button onClick={handleChangePassword} disabled={loading} className="bg-[hsl(188_74%_51%)] hover:bg-[hsl(188_74%_51%)]/90">
                  <Lock className="mr-2 h-4 w-4" />
                  {loading ? 'Changing...' : 'Change Password'}
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Tenant Information */}
        {tenantInfo && (
          <Card className="border-0 shadow-lg overflow-hidden animate-scale-in" style={{ animationDelay: '200ms' }}>
            <div className="bg-muted/30 px-6 h-14 border-b border-border/50 flex items-center">
              <h2 className="font-semibold">Tenant Information</h2>
            </div>
            <CardContent className="p-6 space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Tenant Name</Label>
                  <Input value={tenantInfo.name || 'N/A'} disabled className="bg-muted" />
                </div>

                <div className="space-y-2">
                  <Label>Tenant ID</Label>
                  <Input value={tenantInfo.id || 'N/A'} disabled className="bg-muted" />
                </div>

                <div className="space-y-2">
                  <Label>Status</Label>
                  <Input value={tenantInfo.status || 'N/A'} disabled className="bg-muted" />
                </div>

                <div className="space-y-2">
                  <Label>Risk Level</Label>
                  <Input value={tenantInfo.risk_level || 'N/A'} disabled className="bg-muted" />
                </div>

                {tenantInfo.tenant_profiles?.[0] && (
                  <>
                    {tenantInfo.tenant_profiles[0].legal_name && (
                      <div className="space-y-2">
                        <Label>Legal Name</Label>
                        <Input value={tenantInfo.tenant_profiles[0].legal_name} disabled className="bg-muted" />
                      </div>
                    )}

                    {tenantInfo.tenant_profiles[0].abn && (
                      <div className="space-y-2">
                        <Label>ABN</Label>
                        <Input value={tenantInfo.tenant_profiles[0].abn} disabled className="bg-muted" />
                      </div>
                    )}

                    {tenantInfo.tenant_profiles[0].street_address && (
                      <div className="space-y-2 md:col-span-2">
                        <Label>Address</Label>
                        <Input value={tenantInfo.tenant_profiles[0].street_address} disabled className="bg-muted" />
                      </div>
                    )}

                    {tenantInfo.tenant_profiles[0].state && (
                      <div className="space-y-2">
                        <Label>State</Label>
                        <Input value={tenantInfo.tenant_profiles[0].state} disabled className="bg-muted" />
                      </div>
                    )}

                    {tenantInfo.tenant_profiles[0].website && (
                      <div className="space-y-2">
                        <Label>Website</Label>
                        <Input value={tenantInfo.tenant_profiles[0].website} disabled className="bg-muted" />
                      </div>
                    )}
                  </>
                )}
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
