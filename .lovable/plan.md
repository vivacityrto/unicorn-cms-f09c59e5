## Completed: Suggestion & Issue Register

### Summary
Lightweight internal module for logging suggestions, improvements, data enhancements, errors, and functionality fails. Supports resolution tracking and release note capture directly on each item.

### Database
- 6 dropdown tables: `dd_suggest_item_type`, `dd_suggest_status`, `dd_suggest_priority`, `dd_suggest_impact_rating`, `dd_suggest_release_status`, `dd_suggest_category`
- `suggest_items` — main register table with corrected FK types (integer tenant_id, uuid user refs to public.users)
- `suggest_attachments` — file metadata with private `suggest-attachments` storage bucket
- RLS using existing helpers: `has_tenant_access_safe`, `is_super_admin_safe`, `is_vivacity_team_safe`
- Seed data for all dropdown tables
- `updated_at` trigger on suggest_items

### Edge Function
- `extract-suggest-title` — AI title generation from description (clone of extract-note-title pattern)

### Frontend
- **SuggestionRegister** (`/suggestions`) — filterable list with search, type/status/priority/category/release filters
- **NewSuggestionForm** (`/suggestions/new`) — create form with dictation (useSpeechToText), AI title generation, source page context prefill
- **SuggestionDetail** (`/suggestions/:id`) — edit all fields, resolution/release workflows, attachment upload with signed URLs
- Hooks: `useSuggestItems`, `useSuggestDropdowns`, `useSuggestAttachments`
- Reuses: `useVivacityTeamUsers` for assignment, `useSpeechToText` for dictation
- Dropdown admin via existing CodeTablesAdmin (auto-discovered)

### Architecture Corrections Applied
- `tenant_id` → integer (not uuid) matching `tenants.id`
- All user FKs → `public.users(user_uuid)` (not `auth.users(id)`)
- Uses `tenant_members` via existing RLS helpers (actual table name handled internally)
- Private storage bucket with signed URL access
