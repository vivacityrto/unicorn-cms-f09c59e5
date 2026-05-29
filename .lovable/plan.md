Fix the `activate-ghost-user` edge function by adding the missing `p_user_id` argument to the two staff-check RPC calls.

File: `supabase/functions/activate-ghost-user/index.ts`

Change lines 54–57 from:
```ts
const [{ data: isStaff }, { data: isSA }] = await Promise.all([
  userClient.rpc("is_vivacity_team_safe"),
  userClient.rpc("is_super_admin_safe"),
]);
```

To:
```ts
const [{ data: isStaff }, { data: isSA }] = await Promise.all([
  userClient.rpc("is_vivacity_team_safe", { p_user_id: caller.id }),
  userClient.rpc("is_super_admin_safe", { p_user_id: caller.id }),
]);
```

No other changes to this file, any UI, any other edge function, or any database object.