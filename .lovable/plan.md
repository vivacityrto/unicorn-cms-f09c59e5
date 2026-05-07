# Plan: Route "Message CSC" actions to the CSC tab

Two single-character literal swaps in `src/components/client/ClientHomePage.tsx`. No other files touched.

## Change 1 — Line 360 ("Message CSC" quick action tile)

```tsx
// Before
onClick: () => openHelpCenter("chatbot"),
// After
onClick: () => openHelpCenter("csc"),
```

## Change 2 — Line 395 (CSC card `onMessage` prop)

```tsx
// Before
onMessage={() => openHelpCenter("chatbot")}
// After
onMessage={() => openHelpCenter("csc")}
```

## Untouched
- Line 372 — "Ask the Chatbot" tile stays `openHelpCenter("chatbot")`.
- `HelpCenterContext.tsx` — no changes.
- All other markup, props, styling, schema, RLS.
