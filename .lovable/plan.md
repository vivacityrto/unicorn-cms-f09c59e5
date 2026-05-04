## Change

In `src/components/layout/ClientLayout.tsx`, on the inline Ask Viv `<Button>` inside `ClientLayoutInner` (line 105), update the className:

- `right-24` → `right-6`
- `z-40` → `z-50`

Final className:
```
fixed bottom-6 right-6 z-50 h-12 w-12 rounded-full shadow-lg p-1 bg-primary hover:bg-primary/90
```

## Why

The old fuchsia `FloatingChatbot` previously occupied `bottom-6 right-6 z-50`, so Ask Viv was offset to `right-24` to sit beside it. With the chatbot removed, the bottom-right slot is empty and Ask Viv should occupy it. `z-50` matches the convention used by the other floating launchers.

## Scope

Single-line change, one file. No other files affected.