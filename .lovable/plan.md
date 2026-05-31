### Fix 1 — Expiry timer (24h → 7 days)
In `getTimeRemaining` (line 297), change the expires calculation from `24 * 60 * 60 * 1000` to `7 * 24 * 60 * 60 * 1000`.

In the Expired summary card description (line 622), change the text from `"Past 24-hour window"` to `"Past 7-day window"`.

### Fix 2 — Ghost users show as Verified
1. In the `UserStatus` type definition (around line 37), add `is_in_auth: boolean`.
2. In `fetchUserStatuses`, after building `authUserMap` from `auth.users`, set `is_in_auth: authUserMap.has(user.email)` on each status-map entry.
3. In the table row render (around line 756), change the `isVerified` check from `const isVerified = !!userStatus;` to `const isVerified = !!userStatus && userStatus.is_in_auth === true;`.

### Fix 3 — Re-invite button backwards visibility
In the Re-invite button inline `style` prop (around line 517), flip the ternary:
- From: `selectedInvites.size > 0 ? 'none' : 'inline-flex'`
- To:   `selectedInvites.size > 0 ? 'inline-flex' : 'none'`

No other logic, layout, or imports are changed.