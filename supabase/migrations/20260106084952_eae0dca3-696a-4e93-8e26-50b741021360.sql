-- Add accountable_person column to clients_legacy
ALTER TABLE public.clients_legacy ADD COLUMN IF NOT EXISTS accountable_person TEXT;

-- Create merge_field_definitions table
CREATE TABLE public.merge_field_definitions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  source_table TEXT NOT NULL,
  source_column TEXT NOT NULL,
  description TEXT,
  is_system BOOLEAN DEFAULT false,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  created_by UUID REFERENCES auth.users(id)
);

-- Enable RLS
ALTER TABLE public.merge_field_definitions ENABLE ROW LEVEL SECURITY;

-- SuperAdmin read access
CREATE POLICY "SuperAdmins can view merge fields"
ON public.merge_field_definitions FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.users
    WHERE users.user_uuid = auth.uid()
    AND users.role = 'SuperAdmin'
  )
);

-- SuperAdmin write access
CREATE POLICY "SuperAdmins can manage merge fields"
ON public.merge_field_definitions FOR ALL
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.users
    WHERE users.user_uuid = auth.uid()
    AND users.role = 'SuperAdmin'
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.users
    WHERE users.user_uuid = auth.uid()
    AND users.role = 'SuperAdmin'
  )
);

-- Create generated_documents table
CREATE TABLE public.generated_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_document_id BIGINT REFERENCES public.documents(id),
  tenant_id BIGINT REFERENCES public.tenants(id),
  client_legacy_id UUID REFERENCES public.clients_legacy(id),
  stage_id BIGINT REFERENCES public.documents_stages(id),
  package_id BIGINT REFERENCES public.packages(id),
  file_path TEXT NOT NULL,
  file_name TEXT NOT NULL,
  generated_at TIMESTAMPTZ DEFAULT now(),
  generated_by UUID REFERENCES auth.users(id),
  status TEXT DEFAULT 'generated',
  merge_data JSONB,
  error_message TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.generated_documents ENABLE ROW LEVEL SECURITY;

-- SuperAdmin read access
CREATE POLICY "SuperAdmins can view generated documents"
ON public.generated_documents FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.users
    WHERE users.user_uuid = auth.uid()
    AND users.role = 'SuperAdmin'
  )
);

-- SuperAdmin write access
CREATE POLICY "SuperAdmins can manage generated documents"
ON public.generated_documents FOR ALL
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.users
    WHERE users.user_uuid = auth.uid()
    AND users.role = 'SuperAdmin'
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.users
    WHERE users.user_uuid = auth.uid()
    AND users.role = 'SuperAdmin'
  )
);

-- Tenant users can view their released documents
CREATE POLICY "Tenants can view their released documents"
ON public.generated_documents FOR SELECT
TO authenticated
USING (
  status = 'released' AND
  tenant_id IN (
    SELECT t.id FROM public.tenants t
    JOIN public.tenant_users tu ON tu.tenant_id = t.id
    WHERE tu.user_id = auth.uid()
  )
);

-- Seed merge field definitions with system fields
INSERT INTO public.merge_field_definitions (code, name, source_table, source_column, description, is_system, is_active) VALUES
('{{Title}}', 'Title', 'clients_legacy', 'title', 'Contact title (Mr, Mrs, etc.)', true, true),
('{{FirstName}}', 'First Name', 'clients_legacy', 'first_name', 'Contact first name', true, true),
('{{LastName}}', 'Last Name', 'clients_legacy', 'last_name', 'Contact last name', true, true),
('{{RTOName}}', 'RTO Name', 'clients_legacy', 'rto_name', 'Registered Training Organisation name', true, true),
('{{PhoneNumber}}', 'Phone', 'clients_legacy', 'phone', 'Primary phone number', true, true),
('{{EmailAddress}}', 'Email', 'clients_legacy', 'email', 'Primary email address', true, true),
('{{Website}}', 'Website', 'clients_legacy', 'website', 'Organisation website', true, true),
('{{StreetNumberName}}', 'Street Number Name', 'clients_legacy', 'street_number_name', 'Street address', true, true),
('{{Suburb}}', 'Suburb', 'clients_legacy', 'suburb', 'Suburb', true, true),
('{{State}}', 'State', 'clients_legacy', 'state', 'State/Territory', true, true),
('{{PostCode}}', 'Post Code', 'clients_legacy', 'postcode', 'Postal code', true, true),
('{{RTOID}}', 'RTO ID', 'clients_legacy', 'rtoid', 'RTO identifier code', true, true),
('{{ACN}}', 'ACN', 'clients_legacy', 'acn', 'Australian Company Number', true, true),
('{{ABN}}', 'ABN', 'clients_legacy', 'abn', 'Australian Business Number', true, true),
('{{Logo}}', 'Logo', 'clients_legacy', 'logo_url', 'Organisation logo URL', true, true),
('{{LMS}}', 'Student Management System', 'clients_legacy', 'student_management_system', 'Student management system name', true, true),
('{{AccountSystem}}', 'Accounting', 'clients_legacy', 'accounting_system', 'Accounting system name', true, true),
('{{TrainingFacilityAddress}}', 'Training Facility Address', 'clients_legacy', 'training_facility_address', 'Training facility address', true, true),
('{{POBoxAddress}}', 'PO Box Address', 'clients_legacy', 'po_box_address', 'PO Box address', true, true),
('{{CRICOSID}}', 'CRICOS ID', 'clients_legacy', 'cricos_id', 'CRICOS provider code', true, true),
('{{LegalName}}', 'Legal Name', 'clients_legacy', 'legal_name', 'Legal entity name', true, true),
('{{AccountablePerson}}', 'Accountable Person', 'clients_legacy', 'accountable_person', 'CEO/Director or accountable person name', true, true);

-- Create index for faster lookups
CREATE INDEX idx_generated_documents_tenant ON public.generated_documents(tenant_id);
CREATE INDEX idx_generated_documents_source ON public.generated_documents(source_document_id);
CREATE INDEX idx_generated_documents_status ON public.generated_documents(status);

-- Add updated_at trigger
CREATE TRIGGER update_generated_documents_updated_at
  BEFORE UPDATE ON public.generated_documents
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();