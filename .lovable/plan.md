## Goal
Match the Vivacity Team TopBar by showing both the Unicorn and Vivacity logos in the client portal top menu bar (`ClientTopbar.tsx`), used by both live `/client/*` routes and `/client-preview`.

## Change
**File:** `src/components/client/ClientTopbar.tsx`

1. Add import:
   ```ts
   import unicornLogo from "@/assets/unicorn-logo-login.svg";
   ```

2. Update the left-side logo block (lines ~74-77) to render Unicorn first, then Vivacity — mirroring the order/sizing used in `src/components/layout/TopBar.tsx`:
   ```tsx
   <div className="flex items-center gap-3 min-w-0 flex-shrink-0">
     <img
       src={unicornLogo}
       alt="Unicorn 2.0"
       className="h-14 w-auto flex-shrink-0"
       loading="eager"
     />
     <img
       src={vivacityLogo}
       alt="Vivacity Coaching & Consulting"
       className="h-10 w-auto flex-shrink-0"
       loading="eager"
     />
   </div>
   ```

No other files require changes — the tenant logo (`logoUrl`) on the right side stays as-is.
