-- Fix search_path for staging schema function
ALTER FUNCTION staging.norm_rto_name(txt text) SET search_path = staging, public;