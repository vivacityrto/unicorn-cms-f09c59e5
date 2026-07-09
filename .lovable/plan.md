## Auto-create template mapping on import

In `supabase/functions/import-sharepoint-template/index.ts`, inside `handleImport`, right after the existing `scanDocxMergeFields` block that produces `detected_fields`, `invalid_tags`, and `fields_linked`:

1. If `detected_fields.length > 0`, run a best-effort block (try/catch, `console.warn` on failure — same guard style as the scan itself):
   - Select `id, name` from `dd_fields` where `id in (detected_fields.map(f => f.field_id))`.
   - Build a `tag → name` lookup keyed by `field_id`.
   - Build `mapping_json` as `{ [tag]: { label: name, defaultValue: '' } }` for each detected field. Skip any field whose name didn't come back from the select.
   - Compute `checksum_sha256` via the existing `sha256Hex` helper, using `new TextEncoder().encode(JSON.stringify(mappingJson, Object.keys(mappingJson).sort()))` — same canonical form `GovernanceMappingEditor.handleSave` uses.
   - Insert one row into `document_template_mappings`: `{ template_version_id: newVersion.id, mapping_json, checksum_sha256, created_by: userId }`. No delete-first (brand-new version).
   - On success set a local `fieldsAutoMapped = <mapped count>`; on caught error leave it at `0` and `console.warn`.

2. Include `fields_auto_mapped: fieldsAutoMapped` in the JSON response returned at the end of `handleImport`.

### Out of scope

- `invalid_tags` — unchanged (no `dd_fields` label to derive; still surfaced for manual follow-up).
- `GovernanceMappingEditor.tsx` — unchanged; loads the auto-created row via its existing path, staff can still add/edit fields there before publish.
- `handlePublish` mapping-count check — unchanged; it just naturally passes on first import when at least one tag was auto-detected.
- No schema, RPC, or `document_fields` changes.

### Technical notes

- Reuses the existing `sha256Hex(bytes: Uint8Array): Promise<string>` helper at the top of `index.ts` — pass UTF-8 bytes of the canonicalised JSON string.
- Reuses the `userId` already resolved earlier in `handleImport` (same one used for `created_by` on the version insert).
- Best-effort wrapping ensures a mapping-insert failure never regresses import success.
