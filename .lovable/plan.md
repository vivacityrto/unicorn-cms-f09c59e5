In `supabase/functions/activate-ghost-user/index.ts`, update the `admin.auth.admin.createUser()` call at step 7 to pass `user_metadata` containing the ghost user's name fields.

```text
Current call (lines 113–117):
  await admin.auth.admin.createUser({
    id: body.user_uuid,
    email: ghostEmail,
    email_confirm: true,
  });
```

Change to:

```text
  await admin.auth.admin.createUser({
    id: body.user_uuid,
    email: ghostEmail,
    email_confirm: true,
    user_metadata: {
      first_name: ghost.first_name ?? '',
      last_name: ghost.last_name ?? '',
      full_name: `${ghost.first_name ?? ''} ${ghost.last_name ?? ''}`.trim(),
    },
  });
```

No other code is modified. `ghost.first_name` and `ghost.last_name` are already selected at line 74 and are in scope.
