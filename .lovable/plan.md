

## Plan: Email Note Type — Send Now or Already Sent Prompt

### What Happens Today
When a user selects "Email" as the note type, the form behaves identically to any other note type — just a text note is created.

### What Changes

**`src/components/client/ClientStructuredNotesTab.tsx`**

1. **New state variables**: `emailMode` (`'prompt' | 'send_now' | 'already_sent' | null`), `composeEmailOpen` (boolean), and `primaryContactEmail` (string).

2. **Intercept `handleNoteTypeChange`**: When user selects `email`, instead of just setting the type, show an inline prompt (small card/alert inside the dialog) asking:
   - **"Send Now"** — closes the note dialog and opens `ComposeEmailDialog` pre-filled with the primary contact as recipient, empty subject/body.
   - **"Already Sent"** — dismisses the prompt and keeps the normal note form so the user can log details of the email that was already sent.

3. **Resolve primary contact email on mount**: Fetch the primary contact's email for the tenant (same pattern as `notifyClient.ts`) so it's ready when "Send Now" is clicked.

4. **Render `ComposeEmailDialog`**: Add it at the bottom of the component JSX, controlled by `composeEmailOpen`. After sending, create an "email" note automatically recording that an email was sent (subject as title, body as content).

5. **Visual flow inside the Add Note dialog**:
   - User picks Type → Email
   - A small prompt appears below the Type row: two buttons — "Send Now" / "Already Sent"
   - "Already Sent" hides the prompt, form stays as-is with type=email
   - "Send Now" closes the note dialog, opens ComposeEmailDialog

### Files Changed
- `src/components/client/ClientStructuredNotesTab.tsx` — all changes in this one file

