## Plan: Enable all 5 membership tiers in generate-membership-certificate edge function

### Goal
Remove the single-tier restriction and route each of the 5 membership tiers to its own PDF template in storage.

### Changes
File: `supabase/functions/generate-membership-certificate/index.ts`

1. **Remove the Phase 1 guard** (lines 142–144)
   Delete the block that returns `COMING_SOON` for any tier other than `ruby`.

2. **Add tier-to-template mapping and use it** (line 149)
   - Define `TIER_TEMPLATES` mapping each tier string to its storage path:
     - `ruby` → `membership/certificate-template-ruby.pdf`
     - `diamond` → `membership/certificate-template-diamond.pdf`
     - `sapphire` → `membership/certificate-template-sapphire.pdf`
     - `gold` → `membership/certificate-template-gold.pdf`
     - `amethyst` → `membership/certificate-template-amethyst.pdf`
   - Resolve the path via `templatePath = TIER_TEMPLATES[tier]`
   - Replace the hardcoded `.download("membership/certificate-template-ruby.pdf")` call with `.download(templatePath)`.

No other code changes — coordinates, fonts, colours, auth, and response format remain identical.

### Deployment
After editing, deploy the edge function so the change is live.

### Verification
Call the edge function for each tier (or spot-check a non-ruby tier) to confirm the correct template is fetched and the PDF is returned.