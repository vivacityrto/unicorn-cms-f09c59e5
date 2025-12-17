-- Drop existing table and recreate with int8 id
DROP TABLE IF EXISTS public.user_timezone;

-- Create user_timezone table with int8 id
CREATE TABLE public.user_timezone (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  timezone TEXT NOT NULL DEFAULT 'Australia/Sydney',
  timezone_label TEXT,
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

-- Create a reference table for available timezones
CREATE TABLE public.timezone_options (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  timezone_value TEXT NOT NULL UNIQUE,
  timezone_label TEXT NOT NULL,
  country_code TEXT NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS on timezone_options (public read)
ALTER TABLE public.timezone_options ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view timezone options"
ON public.timezone_options
FOR SELECT
USING (true);

-- Insert timezone data
INSERT INTO public.timezone_options (timezone_value, timezone_label, country_code) VALUES
  ('Australia/Sydney', 'Sydney (AEDT/AEST)', 'AU'),
  ('Australia/Melbourne', 'Melbourne (AEDT/AEST)', 'AU'),
  ('Australia/Brisbane', 'Brisbane (AEST)', 'AU'),
  ('Australia/Perth', 'Perth (AWST)', 'AU'),
  ('Australia/Adelaide', 'Adelaide (ACDT/ACST)', 'AU'),
  ('Australia/Darwin', 'Darwin (ACST)', 'AU'),
  ('Asia/Manila', 'Philippines (PHT)', 'PH');