CREATE TABLE public.user_daily_notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  note_date date NOT NULL,
  content text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_user_daily_notes_user_date ON public.user_daily_notes(user_id, note_date);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_daily_notes TO authenticated;
GRANT ALL ON public.user_daily_notes TO service_role;

ALTER TABLE public.user_daily_notes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users select own daily notes" ON public.user_daily_notes
  FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users insert own daily notes" ON public.user_daily_notes
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users update own daily notes" ON public.user_daily_notes
  FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users delete own daily notes" ON public.user_daily_notes
  FOR DELETE TO authenticated USING (auth.uid() = user_id);

CREATE TRIGGER trg_user_daily_notes_updated_at
  BEFORE UPDATE ON public.user_daily_notes
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();