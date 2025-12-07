-- Add DELETE policy for user_invitations table
-- Allow super admins to delete invitations
CREATE POLICY "Super admins can delete invitations"
ON public.user_invitations
FOR DELETE
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.users
    WHERE users.user_uuid = auth.uid()
    AND users.unicorn_role = 'Super Admin'
  )
);