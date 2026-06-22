Replace the `Access-Control-Allow-Headers` value in `supabase/functions/get-message-attachment-url/index.ts` with the full list that includes Supabase client platform headers, exactly as specified:

```
"authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version"
```

No other changes to this file.