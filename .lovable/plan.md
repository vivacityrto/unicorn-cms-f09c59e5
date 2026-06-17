Three text-only string replacements — no logic, imports, or styling changes.

1. `src/pages/ActivateAccount.tsx`, line 61  
   Change: "This link can only be used once and expires in 1 hour." → "...expires in 24 hours."

2. `src/components/profile/AdminActions.tsx`, line 355  
   Change: "Expires in 1 hour." → "Expires in 24 hours."

3. `src/components/profile/AdminActions.tsx`, line 472  
   Change: "The link will expire in 1 hour." → "The link will expire in 24 hours."

Risk: None. Purely cosmetic UI text updates.