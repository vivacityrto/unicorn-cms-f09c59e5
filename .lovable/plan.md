
# Completed: Remap `documents_stages` → `stages`

All references to the deprecated `documents_stages` table have been remapped to the authoritative `stages` table across frontend and edge functions. Column mapping: `title` → `name`, `short_name` → `shortname`, `video_url` → `videourl`, `created_at` → `dateimported`.

No pending work.
