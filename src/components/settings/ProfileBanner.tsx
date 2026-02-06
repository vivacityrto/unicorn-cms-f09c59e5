import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card } from '@/components/ui/card';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/useAuth';
import { Upload, Calendar } from 'lucide-react';

interface ProfileBannerProps {
  formData: {
    first_name: string;
    last_name: string;
    email: string;
    timezone: string;
  };
  avatarUrl: string | null;
  setAvatarUrl: (url: string | null) => void;
  timezoneOptions: { value: string; label: string }[];
  liveTime: string;
}

export function ProfileBanner({
  formData,
  avatarUrl,
  setAvatarUrl,
  timezoneOptions,
  liveTime,
}: ProfileBannerProps) {
  const { toast } = useToast();
  const { user, refreshProfile } = useAuth();
  const [uploading, setUploading] = useState(false);

  const initials = `${formData.first_name?.[0] || ''}${formData.last_name?.[0] || ''}`.toUpperCase() || 'U';

  const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user) return;

    if (!file.type.startsWith('image/')) {
      toast({
        title: 'Invalid file',
        description: 'Please upload an image file',
        variant: 'destructive',
      });
      return;
    }

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

      await supabase.storage.from('avatars').remove([filePath]);

      const { error: uploadError } = await supabase.storage
        .from('avatars')
        .upload(filePath, file);

      if (uploadError) {
        const errorMsg = uploadError.message.includes('row-level security') 
          ? 'Permission denied: Unable to upload avatar. Please contact support.'
          : uploadError.message || 'Failed to upload avatar';
        throw new Error(errorMsg);
      }

      const { data: { publicUrl } } = supabase.storage
        .from('avatars')
        .getPublicUrl(filePath);

      const cacheBustedUrl = `${publicUrl}?t=${Date.now()}`;

      await supabase
        .from('users')
        .update({ avatar_url: cacheBustedUrl })
        .eq('user_uuid', user.id);

      setAvatarUrl(cacheBustedUrl);
      toast({
        title: 'Success',
        description: 'Profile photo updated successfully',
      });

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

  return (
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
          </div>
          <div className="text-right">
            <div className="flex items-center justify-end gap-2 text-sm text-white/80">
              <Calendar className="h-4 w-4 -mt-[3px]" />
              <span className="font-mono">{liveTime}</span>
            </div>
            <p className="text-xs text-white/50 mt-0.5">
              {timezoneOptions.find(tz => tz.value === formData.timezone)?.label || formData.timezone}
            </p>
          </div>
        </div>
      </div>
    </Card>
  );
}
