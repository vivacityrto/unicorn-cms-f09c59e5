-- Create documents_categories table
CREATE TABLE IF NOT EXISTS public.documents_categories (
  id BIGINT PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.documents_categories ENABLE ROW LEVEL SECURITY;

-- Create policies for Super Admins to manage categories
CREATE POLICY "Super Admins can view all categories"
  ON public.documents_categories
  FOR SELECT
  USING (is_super_admin());

CREATE POLICY "Super Admins can insert categories"
  ON public.documents_categories
  FOR INSERT
  WITH CHECK (is_super_admin());

CREATE POLICY "Super Admins can update categories"
  ON public.documents_categories
  FOR UPDATE
  USING (is_super_admin())
  WITH CHECK (is_super_admin());

CREATE POLICY "Super Admins can delete categories"
  ON public.documents_categories
  FOR DELETE
  USING (is_super_admin());

-- Insert default categories
INSERT INTO public.documents_categories (id, name) VALUES
  (1, 'Uncategorised'),
  (2, 'CRICOS - Policies and Procedures'),
  (3, 'CRICOS - Documents'),
  (4, 'RTO Policies & Procedures'),
  (5, 'CP - Credential Policy'),
  (6, 'CR - Compliance Requirements'),
  (7, 'Q1 - Training & Assessment'),
  (8, 'Q2 - Learner Support'),
  (9, 'Q3 - VET Workforce'),
  (10, 'Q4 - Governance'),
  (11, 'CRICOS - Education Agents'),
  (12, 'CRICOS - Deferring, Suspension or Cancellation'),
  (13, 'CRICOS - Written Agreements'),
  (14, 'CRICOS - Academic & Attendance Monitoring'),
  (15, 'GTO - Apprentice/Trainee'),
  (16, 'GTO - VIC'),
  (17, 'GTO - NSW'),
  (18, 'GTO - WA'),
  (19, 'GTO - QLD'),
  (20, 'z2015 Documents');

-- Create trigger to update updated_at
CREATE TRIGGER update_documents_categories_updated_at
  BEFORE UPDATE ON public.documents_categories
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();