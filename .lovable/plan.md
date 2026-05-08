In `src/pages/SupportTicketsPage.tsx`:

- Line 77: change users select to `user_uuid, first_name, last_name, email`.
- Line 99: change `user_name` to `[u?.first_name, u?.last_name].filter(Boolean).join(" ") || u?.email || "Unknown user"`.

No other changes.