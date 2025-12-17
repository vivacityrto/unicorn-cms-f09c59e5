-- Create user_timezone table to store user timezone preferences
CREATE TABLE public.user_timezone (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  timezone TEXT NOT NULL DEFAULT 'Australia/Sydney',
  realtime_display JSONB NOT NULL DEFAULT '{"show_au": true, "show_ph": true}'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.user_timezone ENABLE ROW LEVEL SECURITY;

-- Create policies
CREATE POLICY "Users can view their own timezone settings"
ON public.user_timezone
FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own timezone settings"
ON public.user_timezone
FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own timezone settings"
ON public.user_timezone
FOR UPDATE
USING (auth.uid() = user_id);

CREATE POLICY "Super admins can view all timezone settings"
ON public.user_timezone
FOR SELECT
USING (is_super_admin());

-- Create trigger for updated_at
CREATE TRIGGER update_user_timezone_updated_at
BEFORE UPDATE ON public.user_timezone
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Add comment
COMMENT ON TABLE public.user_timezone IS 'Stores user timezone preferences for settings and realtime display';