## Plan: Add Mailgun delivery outcome filters to ManageInvites

### Goal
Extend the status filter dropdown in `ManageInvites.tsx` with three new options that filter by `delivery_status` values reported by the Mailgun webhook.

### Files changed
- `src/pages/ManageInvites.tsx`

### Changes

#### 1. Status filter dropdown options
Add three entries after the existing `"failed"` option in the dropdown array (line 729):

- `{ value: "bounced", label: "Bounced", icon: AlertCircle, iconColor: "text-red-600" }`
- `{ value: "delivery-failed", label: "Delivery failed", icon: AlertCircle, iconColor: "text-orange-600" }`
- `{ value: "spam", label: "Spam report", icon: AlertCircle, iconColor: "text-red-600" }`

#### 2. Filter button display text
Add three new display labels in the filter button area (after line 709):

- `{statusFilter === "bounced" && "Bounced"}`
- `{statusFilter === "delivery-failed" && "Delivery failed"}`
- `{statusFilter === "spam" && "Spam report"}`

#### 3. matchesStatus logic
Add three new conditions to the `matchesStatus` expression (after line 440):

- `(statusFilter === "bounced" && invite.delivery_status === 'bounced') ||`
- `(statusFilter === "delivery-failed" && invite.delivery_status === 'failed') ||`
- `(statusFilter === "spam" && invite.delivery_status === 'complained') ||`

### What stays unchanged
- All existing filter values (`all`, `pending`, `sent`, `expired`, `verified`, `failed`) and their logic
- Stat cards, table, pagination, row actions, realtime subscription
- Dropdown search input, option styling pattern, divider separators
