In `supabase/functions/research-audit-intelligence/index.ts` (line 32), change:

```ts
compliance_health_check: "CHC",
```

to:

```ts
compliance_health_check: "CHC — RTO",
```

to match the canonical label in `src/types/clientAudits.ts`.

No other keys, values, fallback logic, function logic, or files will be touched.