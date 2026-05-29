Plan: Two UI changes to ClientGovernanceDocumentsPage.tsx

Scope: Single file only — src/components/client/ClientGovernanceDocumentsPage.tsx. No backend, no other components.

Change 1 — Framework column display
In the table body (line ~320), replace the Framework cell content from:
  {row.framework_label ?? "—"}
to:
  {row.framework_type ?? "—"}

Preserved:
- Filter dropdown continues showing full labels via frameworkOptions.label
- fwMap and framework_label remain untouched
- Search haystack keeps r.framework_label for full-name search

Change 2 — Scroll-to-top button
- Add showScrollTop boolean state and a window scroll listener inside useEffect
- Show the button when window.scrollY > 300; otherwise hide
- Button: fixed position at bottom-right (fixed bottom-6 right-6 z-50)
- Use existing <Button> component with variant="outline" and a subtle shadow
- Icon: ChevronUp from lucide-react (add to existing import line)
- On click: window.scrollTo({ top: 0, behavior: 'smooth' })
- Animate visibility with an opacity transition (e.g., transition-opacity duration-300)

Nothing else in the file is changed. No edge functions, no DB changes, no query logic changes.