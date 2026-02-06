-- Create table to track profile setup prompt preferences
CREATE TABLE public.user_profile_setup_prompts (
  user_uuid uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  last_shown_at timestamptz NULL,
  snoozed_until timestamptz NULL,
  dismissed_until timestamptz NULL,
  created_at timestamptz DEFAULT now() NOT NULL,
  updated_at timestamptz DEFAULT now() NOT NULL
);

-- Enable RLS
ALTER TABLE public.user_profile_setup_prompts ENABLE ROW LEVEL SECURITY;

-- Users can only read their own row
CREATE POLICY "Users can read own prompt prefs"
ON public.user_profile_setup_prompts
FOR SELECT
USING (auth.uid() = user_uuid);

-- Users can insert their own row
CREATE POLICY "Users can insert own prompt prefs"
ON public.user_profile_setup_prompts
FOR INSERT
WITH CHECK (auth.uid() = user_uuid);

-- Users can update their own row
CREATE POLICY "Users can update own prompt prefs"
ON public.user_profile_setup_prompts
FOR UPDATE
USING (auth.uid() = user_uuid);

-- Create trigger for updated_at
CREATE TRIGGER update_user_profile_setup_prompts_updated_at
BEFORE UPDATE ON public.user_profile_setup_prompts
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Add comment
COMMENT ON TABLE public.user_profile_setup_prompts IS 'Tracks when profile setup reminder modal was shown, snoozed, or dismissed for each user';