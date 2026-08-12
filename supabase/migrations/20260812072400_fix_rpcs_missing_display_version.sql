-- Caught by Vercel's automated PR review bot: adding document_versions.display_version
-- as NOT NULL with no default broke two RPCs that INSERT into document_versions
-- without supplying it. bulk_create_documents_with_versions is genuinely live --
-- called by useBulkDocumentUpload, used by BulkUploadWithMetadataDialog, imported
-- by StageDocumentsPanel.tsx -- so this was actively broken in production the
-- moment the earlier migration landed. publish_document_version's only frontend
-- caller (DocumentVersionHistory.tsx) is orphaned since the /document/:id route
-- retirement, but fixing it too since the RPC itself should still be correct.
--
-- bulk_create_documents_with_versions always creates version_number = 1 for a
-- brand-new document_id, so {current_year}.00.00 can never collide with an
-- existing row for that document.
--
-- publish_document_version increments version_number on an existing document,
-- so its display_version is derived from version_number to guarantee it never
-- collides with a prior call on the same document.

create or replace function public.bulk_create_documents_with_versions(
  p_documents jsonb,
  p_category text default null::text,
  p_standard_set text default null::text,
  p_standard_refs text[] default null::text[],
  p_auto_publish boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_doc jsonb;
  v_doc_id bigint;
  v_version_id uuid;
  v_results jsonb := '[]'::jsonb;
begin
  for v_doc in select * from jsonb_array_elements(p_documents) loop
    insert into public.documents (
      title, description, uploaded_files, document_category, standard_set, standard_refs, document_status
    ) values (
      v_doc->>'title',
      v_doc->>'description',
      array[v_doc->>'storage_path'],
      coalesce(v_doc->>'category', p_category),
      coalesce(v_doc->>'standard_set', p_standard_set),
      coalesce((select array_agg(x::text) from jsonb_array_elements_text(v_doc->'standard_refs') x), p_standard_refs),
      case when p_auto_publish then 'published' else 'draft' end
    ) returning id into v_doc_id;

    insert into public.document_versions (
      document_id, version_number, display_version, status, storage_path, file_name, mime_type, file_size, created_by
    ) values (
      v_doc_id, 1, to_char(now(), 'YYYY') || '.00.00',
      case when p_auto_publish then 'published' else 'draft' end,
      v_doc->>'storage_path', v_doc->>'file_name', v_doc->>'mime_type',
      (v_doc->>'file_size')::bigint, auth.uid()
    ) returning id into v_version_id;

    if p_auto_publish then
      update public.documents set current_published_version_id = v_version_id where id = v_doc_id;
    end if;

    v_results := v_results || jsonb_build_object('document_id', v_doc_id, 'version_id', v_version_id, 'title', v_doc->>'title');
  end loop;
  return v_results;
end;
$function$;

create or replace function public.publish_document_version(
  p_document_id bigint,
  p_notes text default null::text
)
returns uuid
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_next_version int;
  v_new_version_id uuid;
  v_current_path text;
  v_current_file text;
begin
  select uploaded_files[1], title
  into v_current_path, v_current_file
  from public.documents where id = p_document_id;

  if v_current_path is null then
    raise exception 'Document not found or has no files';
  end if;

  select coalesce(max(version_number), 0) + 1 into v_next_version
  from public.document_versions where document_id = p_document_id;

  insert into public.document_versions (
    document_id, version_number, display_version, status, storage_path, file_name, notes, created_by
  ) values (
    p_document_id, v_next_version,
    to_char(now(), 'YYYY') || '.00.' || lpad(v_next_version::text, 2, '0'),
    'published', v_current_path, v_current_file, p_notes, auth.uid()
  ) returning id into v_new_version_id;

  update public.document_versions set status = 'archived'
  where document_id = p_document_id and id != v_new_version_id and status = 'published';

  update public.documents
  set current_published_version_id = v_new_version_id, document_status = 'published'
  where id = p_document_id;

  return v_new_version_id;
end;
$function$;
