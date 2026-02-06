-- Insert default app_settings row if not exists (without specifying id)
INSERT INTO public.app_settings (clickup_enabled, review_required_before_release)
SELECT false, true
WHERE NOT EXISTS (SELECT 1 FROM public.app_settings LIMIT 1);