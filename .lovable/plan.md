In `src/components/help-center/MessageTab.tsx`, in the `sendSupport` function, add `subject: subject.trim() || null,` as a top-level column in the `help_threads` insert (between `status: "open"` and `metadata: diagnosticMeta`).

No other changes.