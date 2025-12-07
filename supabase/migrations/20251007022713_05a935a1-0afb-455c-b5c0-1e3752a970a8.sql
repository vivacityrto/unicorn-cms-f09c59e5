-- Create documents_fields table
CREATE TABLE public.documents_fields (
  id bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  label text NOT NULL,
  type text NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Enable RLS on documents_fields
ALTER TABLE public.documents_fields ENABLE ROW LEVEL SECURITY;

-- RLS policies for documents_fields
CREATE POLICY "Super Admins can view all fields"
ON public.documents_fields
FOR SELECT
USING (is_super_admin());

CREATE POLICY "Super Admins can insert fields"
ON public.documents_fields
FOR INSERT
WITH CHECK (is_super_admin());

CREATE POLICY "Super Admins can update fields"
ON public.documents_fields
FOR UPDATE
USING (is_super_admin())
WITH CHECK (is_super_admin());

CREATE POLICY "Super Admins can delete fields"
ON public.documents_fields
FOR DELETE
USING (is_super_admin());

-- Add trigger for updated_at on documents_fields
CREATE TRIGGER update_documents_fields_updated_at
BEFORE UPDATE ON public.documents_fields
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();