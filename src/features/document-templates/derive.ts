// Pure derivation helpers for the document-template create/import flow
// (src/pages/ManageDocuments.tsx). Extracted as a types-only/pure-function
// boundary — no state, no Supabase calls, no behavior change from the
// original inline implementations.

// Derives a category from a filename's leading code token (e.g. "CP" in
// "CP.S3-Validation-Credentials-Policy-2026.03.00") by matching it against
// the first segment of each category's slug (dd_document_categories.value,
// e.g. "cp-credential_policy" -> "cp"). Only auto-selects on a unique match —
// several categories share a prefix (the GTO/CRICOS sub-categories), and
// guessing wrong is worse than leaving it for the user to pick.
export const deriveCategoryFromFilename = (
  fileName: string,
  categoryOptions: { id: string | number; name: string }[],
): string | null => {
  const match = fileName.match(/^([A-Za-z0-9]+)[.\-_]/);
  if (!match) return null;
  const code = match[1].toLowerCase();
  const matches = categoryOptions.filter(
    (c) => String(c.id).split(/[-_]/)[0].toLowerCase() === code,
  );
  return matches.length === 1 ? String(matches[0].id) : null;
};

// Derives Framework Type from the top-level SharePoint folder the selected
// file lives under (e.g. a file under Root/RTO/... implies framework "RTO").
export const deriveFrameworkFromRootFolder = (
  rootFolderName: string | null,
  frameworkOptions: { value: string; label: string }[],
): string | null => {
  if (!rootFolderName) return null;
  const normalized = rootFolderName.trim().toLowerCase();
  const exact = frameworkOptions.find((f) => f.value.toLowerCase() === normalized);
  if (exact) return exact.value;
  const prefixed = frameworkOptions.find((f) => normalized.startsWith(f.value.toLowerCase()));
  return prefixed ? prefixed.value : null;
};

// `documents.format` drives the delivery pipeline, so keep it as a file
// extension rather than a presentation label (for example, `xlsx`, not
// `Excel`). Friendly labels belong in the rendering layer.
export const deriveFormatFromFile = (fileName: string, mimeType: string | null): string => {
  const ext = (fileName.match(/\.([^./\\]+)$/)?.[1] || '').toLowerCase();
  if (ext) return ext;

  const mimeTypeMap: Array<[string, string]> = [
    ['wordprocessingml', 'docx'], ['msword', 'doc'],
    ['spreadsheetml', 'xlsx'], ['ms-excel', 'xls'],
    ['presentationml', 'pptx'], ['powerpoint', 'ppt'],
    ['pdf', 'pdf'], ['csv', 'csv'], ['plain', 'txt'],
  ];
  const mimeTypeMatch = mimeTypeMap.find(([needle]) => mimeType?.includes(needle));
  if (mimeTypeMatch) return mimeTypeMatch[1];

  return '';
};
