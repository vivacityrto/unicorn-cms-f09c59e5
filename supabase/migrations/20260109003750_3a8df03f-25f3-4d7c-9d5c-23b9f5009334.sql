-- Add missing columns to tga_rto_summary
ALTER TABLE tga_rto_summary ADD COLUMN IF NOT EXISTS acn text;
ALTER TABLE tga_rto_summary ADD COLUMN IF NOT EXISTS web_address text;
ALTER TABLE tga_rto_summary ADD COLUMN IF NOT EXISTS initial_registration_date date;

-- Add missing columns to tga_rto_contacts
ALTER TABLE tga_rto_contacts ADD COLUMN IF NOT EXISTS mobile text;
ALTER TABLE tga_rto_contacts ADD COLUMN IF NOT EXISTS fax text;
ALTER TABLE tga_rto_contacts ADD COLUMN IF NOT EXISTS address text;
ALTER TABLE tga_rto_contacts ADD COLUMN IF NOT EXISTS organisation_name text;

-- Add extent, delivery_notification, usage_recommendation to scope tables
ALTER TABLE tga_scope_qualifications 
  ADD COLUMN IF NOT EXISTS extent text,
  ADD COLUMN IF NOT EXISTS delivery_notification text,
  ADD COLUMN IF NOT EXISTS usage_recommendation text;

ALTER TABLE tga_scope_skillsets 
  ADD COLUMN IF NOT EXISTS extent text,
  ADD COLUMN IF NOT EXISTS usage_recommendation text;

ALTER TABLE tga_scope_units 
  ADD COLUMN IF NOT EXISTS extent text,
  ADD COLUMN IF NOT EXISTS delivery_notification text,
  ADD COLUMN IF NOT EXISTS usage_recommendation text,
  ADD COLUMN IF NOT EXISTS is_explicit boolean DEFAULT true;

ALTER TABLE tga_scope_courses 
  ADD COLUMN IF NOT EXISTS extent text,
  ADD COLUMN IF NOT EXISTS delivery_notification text,
  ADD COLUMN IF NOT EXISTS usage_recommendation text;