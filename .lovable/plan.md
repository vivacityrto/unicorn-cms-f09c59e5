
# Add Missing Add-in Columns to `app_settings`

## Overview
Add four boolean columns to the existing `app_settings` table so the Microsoft Add-in Settings page can read and write feature flags correctly.

## Database Migration

Run a single `ALTER TABLE` statement adding:

| Column | Type | Default |
|--------|------|---------|
| `microsoft_addin_enabled` | boolean | false |
| `addin_outlook_mail_enabled` | boolean | false |
| `addin_meetings_enabled` | boolean | false |
| `addin_documents_enabled` | boolean | false |

```sql
ALTER TABLE public.app_settings
  ADD COLUMN IF NOT EXISTS microsoft_addin_enabled BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS addin_outlook_mail_enabled BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS addin_meetings_enabled BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS addin_documents_enabled BOOLEAN NOT NULL DEFAULT false;
```

## No Frontend Changes Required
The existing `useAddinFeatureFlags` hook and `AddinSettings` page already reference these exact column names. Once the columns exist, the toggles will work immediately.

## Files
| File | Action |
|------|--------|
| Database migration | Add four boolean columns to `app_settings` |
