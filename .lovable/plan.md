## Fix: Portal the FloatingSuggestionsDialog out of the TopBar stacking context

**Problem**
`FloatingSuggestionsDialog` is mounted inside the sticky `<header>` (z-index 20), which creates a CSS stacking context. The dialog's `z-index: 9999` is therefore scoped to that header, so dashboard cards rendered elsewhere in the DOM can paint on top of it.

**Change (single file: `src/components/layout/FloatingSuggestionsDialog.tsx`)**

1. Add at the top of the file:
   ```ts
   import { createPortal } from 'react-dom';
   ```
2. In the component's return, wrap the existing `<>…</>` fragment (backdrop `div` + dialog `div`) in `createPortal(…, document.body)`:
   ```tsx
   if (!open) return null;
   return createPortal(
     <>
       {/* existing backdrop + dialog JSX, unchanged */}
     </>,
     document.body
   );
   ```

**Not changing**
- No z-index values touched.
- No layout, drag handling, filtering, or empty-state logic touched.
- No other files modified.

**Why this works**
Portaling renders the dialog as a direct child of `document.body`, outside the header's stacking context, so its `z-index: 9999` competes against the page root and reliably sits above dashboard cards.
