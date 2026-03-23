

## Fix: Informative error messages for governance document generation failures

### Problem
When `supabase.functions.invoke` receives a non-2xx response, the SDK sets `response.error` to a generic `FunctionsHttpError` with message "Edge Function returned a non-2xx status code". Line 130 throws this generic message **before** line 142 ever checks the response body (which contains the actual error like `GOVERNANCE_FOLDER_MISSING`). The governance-specific error handling at line 154 then never matches because the message is generic.

### Root cause
```typescript
// Line 130 — throws GENERIC message, skips body parsing
if (response.error) throw new Error(response.error.message);

// Line 142 — never reached when error is set
if (!response.data?.success) throw new Error(response.data?.error || 'Generation failed');
```

### Fix

**File: `src/components/client/StageDocumentsSection.tsx`** (lines 130-142)

Replace the error handling to parse the response body even on non-2xx status codes:

```typescript
// When functions.invoke returns non-2xx, response.error is set BUT
// response.data still contains the JSON body with error_code/error details.
// Check the body first for structured errors before falling back to generic.
if (response.error) {
  const body = response.data;
  const errorCode = body?.error_code || '';
  const errorMsg = body?.error || response.error.message;

  if (errorCode === 'GOVERNANCE_FOLDER_MISSING') {
    toast({
      title: 'Governance Folder Not Configured',
      description: 'This tenant does not have a governance folder mapped in SharePoint. Go to Admin → SharePoint Folder Mapping, select this tenant, and click "Verify & Create Default" or "Select Folder" to configure it.',
      variant: 'destructive',
    });
    return;
  }

  throw new Error(errorMsg);
}
```

This ensures:
1. The `GOVERNANCE_FOLDER_MISSING` code is detected from the response body
2. The user sees a clear, actionable message telling them exactly what to do
3. Other structured errors from the edge function body are surfaced instead of the generic SDK message

### Files
| File | Change |
|------|--------|
| `src/components/client/StageDocumentsSection.tsx` | Parse response body on non-2xx to detect `GOVERNANCE_FOLDER_MISSING` and show actionable toast |

