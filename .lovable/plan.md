## Tighten CRICOS detection in NewAuditModal

In `src/components/audit/NewAuditModal.tsx`, the `registrationType` useMemo currently treats any truthy value of `cricosVal` as a valid CRICOS, which means placeholder/empty-but-non-null strings count as a real registration.

### Change

Line 227:

```ts
const hasCricos = !!cricosVal;
```

becomes:

```ts
const hasCricos = isCricosValid(cricosVal);
```

`isCricosValid` is already imported from `@/types/clientAudits` (line 19), so no import changes are needed. No other lines change.