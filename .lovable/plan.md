## Remove pink FloatingChatbot button from client portal

Scope: client portal only. Staff `DashboardLayout` and `FloatingChatbot.tsx` itself remain untouched (still used by staff).

### Changes

1. **`src/components/layout/ClientLayout.tsx`**
   - Remove import: `import { ClientChatbotLauncher } from "@/components/client/ClientChatbotLauncher";`
   - Remove the JSX `<ClientChatbotLauncher />` (currently rendered inside the `ClientRequestContext.Provider`, just after `<ClientFooter />`).
   - Also remove the now-stale `{/* Floating Chatbot */}` comment above it.

2. **`src/components/client/ClientChatbotLauncher.tsx`**
   - Delete the entire file. It is a 1-line wrapper around `FloatingChatbot` and has no other importers (only `ClientLayout.tsx` references it, per the file shown in context).

### Not touched (explicit)

- `src/components/help-center/FloatingChatbot.tsx` — still used by `DashboardLayout`.
- `HelpCenterDrawer`, `HelpCenterProvider`, `HelpCenterContext` — Ask Viv and quick links continue to open the Help Center drawer normally.
- `ClientAskVivPanel` and its trigger button in `ClientLayout` — unrelated, stays.
- `DashboardLayout.tsx`, `AskVivPanel.tsx`, `AskVivFloatingLauncher.tsx` — out of scope.

### Verification after switch to default mode

- `rg "ClientChatbotLauncher"` returns no matches.
- `rg "FloatingChatbot"` still shows usage in `DashboardLayout` (staff) only.
- Client portal at `/client/home` no longer shows the pink floating chatbot button; the cyan "Ask Viv" button (now at `bottom-6 right-24`) remains. After this change, the right-24 offset is no longer needed to avoid the chatbot, but I will leave positioning as-is to keep this change minimal — repositioning can be a follow-up if desired.
