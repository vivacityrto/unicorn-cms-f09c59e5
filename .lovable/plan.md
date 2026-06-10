Remove `/audits` from the `ADMIN_ROUTES` array in `src/hooks/useRBAC.tsx` so that all internal Vivacity staff (CSC, BGT, Integrator, etc.) can access the Audits section. The route-level block is unnecessary because `usePermission` calls on the individual audit pages already enforce button-level gates (`audits.setup`, `audits.operate`, `audits.report`).

Change:
- `ADMIN_ROUTES` — delete the `'/audits',` entry.

No other file changes.