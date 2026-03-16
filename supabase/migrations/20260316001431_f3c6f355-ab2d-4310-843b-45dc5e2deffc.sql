-- Fix eos_todos.owner_id FK to reference public.users instead of auth.users
ALTER TABLE public.eos_todos DROP CONSTRAINT IF EXISTS eos_todos_owner_id_fkey;
ALTER TABLE public.eos_todos ADD CONSTRAINT eos_todos_owner_id_fkey 
  FOREIGN KEY (owner_id) REFERENCES public.users(user_uuid);

-- Also fix eos_todos.created_by FK 
ALTER TABLE public.eos_todos DROP CONSTRAINT IF EXISTS eos_todos_created_by_fkey;
ALTER TABLE public.eos_todos ADD CONSTRAINT eos_todos_created_by_fkey 
  FOREIGN KEY (created_by) REFERENCES public.users(user_uuid);