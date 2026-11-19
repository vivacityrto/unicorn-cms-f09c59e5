-- Lets people in a conversation see who wrote each message: first name, last name and profile picture.
-- Read-only: creates one function, changes no table, policy or data.
--
-- Why: row security on public.users lets a client see only themselves, their assigned CSC and (for organisation
-- admins) people in their own organisation. Any other Vivacity staff member who wrote in a conversation, such as the
-- sender of a broadcast, came back as no row, so the portal fell back to the generic label "Vivacity Team".
--
-- What it returns: for ONE conversation, the name and picture of the people who sent messages in it, and whether they
-- are Vivacity staff. Nothing else (no email, phone, role or other user fields). It only answers for a person who is a
-- participant in that conversation, or Vivacity staff, which is the same audience that can already read its messages.

create or replace function public.get_conversation_sender_profiles(p_conversation_id uuid)
returns table (user_uuid uuid, first_name text, last_name text, avatar_url text, is_staff boolean)
language plpgsql
stable
security definer
set search_path = public, auth, pg_temp
as $function$
begin
  if auth.uid() is null then
    raise exception 'Not authorized';
  end if;

  if not (
    public.is_conversation_participant_safe(p_conversation_id, auth.uid())
    or public.is_vivacity_team_safe(auth.uid())
  ) then
    raise exception 'Not authorized for this conversation';
  end if;

  return query
    select u.user_uuid, u.first_name, u.last_name, u.avatar_url, coalesce(u.is_vivacity_internal, false) as is_staff
    from public.users u
    where u.user_uuid in (
      select m.sender_user_uuid
      from public.tenant_messages m
      where m.conversation_id = p_conversation_id
        and m.sender_user_uuid is not null
    );
end;
$function$;

revoke execute on function public.get_conversation_sender_profiles(uuid) from public;
revoke execute on function public.get_conversation_sender_profiles(uuid) from anon;
grant execute on function public.get_conversation_sender_profiles(uuid) to authenticated;
