## Plan: Add Access-Control-Expose-Headers to Membership Certificate Edge Function

### Change
In `supabase/functions/generate-membership-certificate/index.ts`, add `"Access-Control-Expose-Headers": "Content-Disposition"` to the response headers in the final `return new Response(pdfBytes, ...)` block. This allows the browser's JavaScript to read the `Content-Disposition` header so the client-side download can use the dynamic filename returned by the edge function.

The headers object becomes:
```ts
headers: {
  "Content-Type": "application/pdf",
  "Content-Disposition": `attachment; filename="${downloadFilename}"`,
  "Access-Control-Expose-Headers": "Content-Disposition",
  ...corsHeaders,
},
```

### Scope
- Single file only: `supabase/functions/generate-membership-certificate/index.ts`
- No other files or logic modified.
