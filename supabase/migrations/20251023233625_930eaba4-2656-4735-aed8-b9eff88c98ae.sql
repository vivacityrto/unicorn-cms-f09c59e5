-- Add created_at column to packages table
ALTER TABLE public.packages 
ADD COLUMN IF NOT EXISTS created_at TIMESTAMP WITH TIME ZONE DEFAULT now();

-- Update existing packages with slugs based on their names
UPDATE public.packages SET slug = '/package-ks-rto' WHERE id = 1;
UPDATE public.packages SET slug = '/package-chc' WHERE id = 2;
UPDATE public.packages SET slug = '/package-m-rr' WHERE id = 3;
UPDATE public.packages SET slug = '/package-sk-ec' WHERE id = 4;
UPDATE public.packages SET slug = '/package-m-rc' WHERE id = 5;
UPDATE public.packages SET slug = '/package-dd' WHERE id = 6;
UPDATE public.packages SET slug = '/package-ks-cri' WHERE id = 7;
UPDATE public.packages SET slug = '/package-sh-ar' WHERE id = 8;
UPDATE public.packages SET slug = '/package-pp' WHERE id = 9;
UPDATE public.packages SET slug = '/package-av' WHERE id = 10;
UPDATE public.packages SET slug = '/package-rtc' WHERE id = 11;
UPDATE public.packages SET slug = '/package-m-bc' WHERE id = 12;
UPDATE public.packages SET slug = '/package-m-gc' WHERE id = 13;
UPDATE public.packages SET slug = '/package-acc' WHERE id = 14;
UPDATE public.packages SET slug = '/package-asa' WHERE id = 15;
UPDATE public.packages SET slug = '/package-m-gr' WHERE id = 16;
UPDATE public.packages SET slug = '/package-gc' WHERE id = 17;
UPDATE public.packages SET slug = '/package-m-dr' WHERE id = 18;
UPDATE public.packages SET slug = '/package-m-dc' WHERE id = 19;
UPDATE public.packages SET slug = '/package-ks' WHERE id = 20;
UPDATE public.packages SET slug = '/package-ao-2' WHERE id = 21;
UPDATE public.packages SET slug = '/package-m-sar' WHERE id = 22;
UPDATE public.packages SET slug = '/package-ks-gto' WHERE id = 23;
UPDATE public.packages SET slug = '/package-m-sac' WHERE id = 24;
UPDATE public.packages SET slug = '/package-m-gto' WHERE id = 25;
UPDATE public.packages SET slug = '/package-ks-gto-n' WHERE id = 26;
UPDATE public.packages SET slug = '/package-doc-r' WHERE id = 27;
UPDATE public.packages SET slug = '/package-doc-c' WHERE id = 28;
UPDATE public.packages SET slug = '/package-m-am' WHERE id = 29;
UPDATE public.packages SET slug = '/package-ft-st' WHERE id = 30;

-- Create function to auto-generate slug for new packages
CREATE OR REPLACE FUNCTION generate_package_slug()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.slug IS NULL THEN
    NEW.slug := '/package-' || lower(regexp_replace(NEW.name, '[^a-zA-Z0-9]+', '-', 'g'));
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger to auto-generate slug on insert
DROP TRIGGER IF EXISTS set_package_slug ON public.packages;
CREATE TRIGGER set_package_slug
  BEFORE INSERT ON public.packages
  FOR EACH ROW
  EXECUTE FUNCTION generate_package_slug();