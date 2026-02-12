-- Fix: Set security_invoker=true on meetings_shared view to enforce RLS of the querying user
ALTER VIEW public.meetings_shared SET (security_invoker = true);