## Fix: "Message your CSC" subject in Team Communications

Change `src/pages/TeamCommunicationsPage.tsx` only. Two render sites use `conv.subject || conv.topic || "General"` and need a `type === "direct"` short-circuit.

### Edits

**1. Line 452 — conversation list row**

Replace:
```tsx
{conv.subject || conv.topic || "General"}
```
with:
```tsx
{conv.type === "direct" ? "Direct message" : (conv.subject || conv.topic || "General")}
```

**2. Line 499 — thread detail header `<h2>`**

Replace:
```tsx
{selected.subject || selected.topic || "General"}
```
with:
```tsx
{selected.type === "direct" ? "Direct message" : (selected.subject || selected.topic || "General")}
```

### Behaviour

- Direct (CSC) threads: always show "Direct message" in staff list and header, regardless of stored subject.
- General / Package / Task threads: unchanged — staff-written subject still wins, falling back to topic, then "General".
- Type badge, tenant name, message preview, timestamp, unread styling: untouched.
- `ClientInboxPage.tsx`: untouched — clients still see "Message your CSC".
- No DB, RLS, schema, or conversation-creation changes.

### Verification

- Direct conversation row → "Direct message".
- General conversation with subject "Renewal question" → "Renewal question".
- General with no subject → "General".
- Selecting a direct thread → header reads "Direct message".
- Type badges still render Direct / General / Package / Task.
