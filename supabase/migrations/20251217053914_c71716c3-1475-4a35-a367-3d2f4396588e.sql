-- Drop any triggers on storage.objects that might be calling the non-existent function
DO $$
DECLARE
    trigger_rec RECORD;
BEGIN
    -- Find and drop triggers on storage.objects
    FOR trigger_rec IN 
        SELECT tgname 
        FROM pg_trigger 
        WHERE tgrelid = 'storage.objects'::regclass
        AND tgname NOT LIKE 'RI_%'  -- Skip system triggers
    LOOP
        EXECUTE format('DROP TRIGGER IF EXISTS %I ON storage.objects', trigger_rec.tgname);
        RAISE NOTICE 'Dropped trigger: %', trigger_rec.tgname;
    END LOOP;
END $$;

-- Also drop any functions in storage schema that might be broken
DROP FUNCTION IF EXISTS storage.get_public_url(unknown, text);
DROP FUNCTION IF EXISTS storage.get_public_url(text, text);