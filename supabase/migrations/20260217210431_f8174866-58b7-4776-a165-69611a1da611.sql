
-- Insert 9 legacy client users into public.users and link them in tenant_users
-- These are unicorn1.users IDs 7528-7537 whose tenants exist in public.tenants

-- Insert users
INSERT INTO public.users (first_name, last_name, email, role, user_type, tenant_role, legacy_id)
VALUES
  ('Lorenzo', 'Inunciaga', 'lorenzo@mellozservicestraining.com.au', 'Client Child', 'Client Parent', 'user', 7528),
  ('Arti', 'Nandani', 'info@forklifttraininglicencesbrisbane.com.au', 'Client Child', 'Client Parent', 'user', 7529),
  ('Pamela', 'Trantalles', 'pamela@globalbusinesstrainer.edu.au', 'Client Child', 'Client Parent', 'user', 7530),
  ('Mariama', 'Kargbo', 'mariamakargbo591@gmail.com', 'Client Child', 'Client Parent', 'user', 7531),
  ('Kim', 'Luehman', 'kim.luehman@sunrise.org.au', 'Client Child', 'Client Parent', 'user', 7532),
  ('Male', 'Female', 'angela.tk.connell@gmail.com', 'Client Child', 'Client Parent', 'user', 7533),
  ('Hamid', 'Iskeirjeh', 'hamid@adelaideaviation.com.au', 'Client Child', 'Client Parent', 'user', 7535),
  ('Erolyn', 'Blythe', 'director@ttseducation.com.au', 'Client Child', 'Client Parent', 'user', 7536),
  ('Sunil', 'Baby', 'ceo@midcity.edu.au', 'Client Child', 'Client Parent', 'user', 7537);

-- Now insert tenant_users links (mapping legacy_id to tenant_id since they match)
INSERT INTO public.tenant_users (tenant_id, user_id, role, primary_contact)
SELECT u.legacy_id, u.user_uuid, 'parent', true
FROM public.users u
WHERE u.legacy_id IN (7528, 7529, 7530, 7531, 7532, 7533, 7535, 7536, 7537)
  AND NOT EXISTS (
    SELECT 1 FROM public.tenant_users tu 
    WHERE tu.tenant_id = u.legacy_id AND tu.user_id = u.user_uuid
  );
