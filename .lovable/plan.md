

## Dual-Response EOS Quarterly Conversations

### Problem
Currently, only one set of answers exists per QC — manager and reviewee overwrite each other. The EOS process requires both to independently complete the form before the meeting, then compare answers side-by-side during the meeting. The reviewee should not see the manager's answers until the meeting begins.

### Database Changes (Migration)

**1. `eos_qc` table** — Add `meeting_started_at TIMESTAMPTZ` column to control when answers are revealed to both parties.

**2. `eos_qc_answers` table** — Add `respondent_role TEXT NOT NULL CHECK (respondent_role IN ('manager', 'reviewee'))`. Drop the existing unique constraint on `(qc_id, section_key, prompt_key)` and replace with `(qc_id, section_key, prompt_key, respondent_role)`. This allows two answers per prompt — one from each role.

**3. `eos_qc_fit` table** — Add `respondent_role TEXT NOT NULL CHECK (respondent_role IN ('manager', 'reviewee'))`. Drop the existing `UNIQUE(qc_id)` and replace with `UNIQUE(qc_id, respondent_role)`. This allows two GWC assessments per QC.

**4. Update `qc_upsert_answer` function** — Accept `p_respondent_role` parameter, include it in the INSERT and ON CONFLICT clause.

**5. Update `qc_set_fit` function** — Accept `p_respondent_role` parameter, include it in the upsert logic.

**6. New `qc_start_meeting` function** — Sets `meeting_started_at = now()` and status to `in_progress` on the QC. Only callable by manager.

### Workflow

```text
┌──────────────┐     ┌──────────────┐
│   REVIEWEE   │     │   MANAGER    │
│ fills forms  │     │ fills forms  │
│ (sees own    │     │ (sees own    │
│  only)       │     │  only)       │
└──────┬───────┘     └──────┬───────┘
       │                    │
       │    Manager clicks  │
       │   "Start Meeting"  │
       ▼                    ▼
┌─────────────────────────────────┐
│  MEETING MODE (side-by-side)    │
│  Both see Reviewee | Manager    │
│  columns for each prompt        │
└──────────────┬──────────────────┘
               │
               ▼
┌─────────────────────────────────┐
│  SIGN-OFF (both sign → locked)  │
└─────────────────────────────────┘
```

### UI Changes

**`src/types/qc.ts`**
- Add `respondent_role: 'manager' | 'reviewee'` to `QCAnswer` and `QCFit`
- Add `meeting_started_at: string | null` to `QuarterlyConversation`

**`src/hooks/useQuarterlyConversations.tsx`**
- `upsertAnswer` mutation: accept and pass `respondent_role` parameter
- `setFit` mutation: accept and pass `respondent_role` parameter
- Add `startMeeting` mutation calling the new `qc_start_meeting` RPC
- `useQCDetails`: fetch answers and fit for both roles; fetch `meeting_started_at`

**`src/pages/EosQCSession.tsx`**
- Determine current user's `respondentRole` (manager or reviewee)
- Compute `isMeetingMode = !!qc.meeting_started_at`
- Show "Start Meeting" button for manager (only before meeting started)
- Show status indicator: "Preparation Phase" vs "Meeting Mode"
- Pass `respondentRole`, `isMeetingMode`, and both sets of answers to section components
- Filter answers: pre-meeting each user sees only their own; in meeting mode show both

**`src/components/eos/qc/QCSectionCard.tsx`**
- Accept new props: `respondentRole`, `isMeetingMode`, `allAnswers` (both roles)
- **Pre-meeting**: Show single form, save with user's `respondentRole`
- **Meeting mode**: Render two-column layout — "Reviewee's Response" | "Manager's Response" for each prompt, with the current user's column editable and the other read-only

**`src/components/eos/qc/GWCPanel.tsx`**
- Accept `respondentRole`, `isMeetingMode`, and both fit records (manager fit + reviewee fit)
- Pre-meeting: single form saving with user's role
- Meeting mode: side-by-side GWC comparison

**`src/components/eos/qc/QCSignoffBar.tsx`**
- No structural changes needed; already handles dual sign-off

### Files Modified
1. **New migration SQL** — Schema changes (columns, constraints, functions)
2. `src/types/qc.ts`
3. `src/hooks/useQuarterlyConversations.tsx`
4. `src/pages/EosQCSession.tsx`
5. `src/components/eos/qc/QCSectionCard.tsx`
6. `src/components/eos/qc/GWCPanel.tsx`

