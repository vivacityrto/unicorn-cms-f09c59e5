

## AI-Assisted Rock Building

### What This Does

Adds a "Suggest with AI" button to each Rock creation dialog (Company, Team, Individual) that uses AI to generate smart Rock suggestions based on the organisation's strategic context -- VTO goals, existing rocks, open issues, and scorecard trends.

Instead of starting from a blank form, users click one button and get a pre-filled draft they can review and edit before saving.

### How It Works

1. User opens any Rock creation dialog (Company, Team, or Individual)
2. User clicks "Suggest with AI" (sparkle icon button)
3. AI reads the tenant's VTO (10-year target, 3-year picture, 1-year goals), existing rocks for the current quarter, open issues, and scorecard trends
4. AI returns a suggested Rock with: title, description, issue, outcome, and milestones
5. The form fields are pre-filled with the suggestion
6. User reviews, edits if needed, then saves normally

The user always has final control -- AI drafts, humans approve.

### User Experience Flow

```text
+---------------------------+
| Create [Level] Rock       |
|                           |
|  [Suggest with AI]        |
|                           |
|  Title: _______________   |
|  Description: _________   |
|  Issue: _______________   |
|  Outcome: _____________   |
|  Milestones:              |
|    1. ___                 |
|    2. ___                 |
|                           |
|  [Cancel]  [Create Rock]  |
+---------------------------+
```

After clicking "Suggest with AI":
- A loading spinner replaces the button text
- All text fields populate with the AI suggestion
- A subtle banner appears: "AI-suggested draft -- review and edit before saving"
- User can click "Suggest with AI" again for a different suggestion

### Context Sent to AI (by Rock Level)

| Rock Level | Context Provided |
|------------|-----------------|
| Company | VTO (10-year target, 3-year measurables, 1-year goals), existing company rocks this quarter |
| Team | Parent company rock title + description, function name, existing team rocks for that function |
| Individual | Parent team rock title + description, owner name, existing individual rocks for that owner |

### Technical Details

**1. New Edge Function: `ai-suggest-rock`**

File: `supabase/functions/ai-suggest-rock/index.ts`

- Accepts: `{ rock_level, tenant_id, parent_rock_id?, function_id?, owner_id? }`
- Fetches context from database based on rock level
- Calls Lovable AI Gateway (`google/gemini-3-flash-preview`) with tool calling to extract structured output
- Returns: `{ title, description, issue, outcome, milestones[] }`
- Uses tool calling (not JSON mode) for reliable structured extraction
- Handles 429/402 errors gracefully
- Adds `Cache-Control: no-store` header

Tool schema for structured extraction:
```text
function: suggest_rock
parameters:
  title: string (max 100 chars)
  description: string (max 300 chars)
  issue: string (max 200 chars)
  outcome: string (max 200 chars)
  milestones: array of { text: string } (3-5 items)
```

**2. Config update: `supabase/config.toml`**

Add:
```text
[functions.ai-suggest-rock]
verify_jwt = false
```

**3. New React hook: `src/hooks/useAISuggestRock.ts`**

- Wraps the edge function call in a `useMutation`
- Returns `{ suggestRock, isGenerating }` 
- Shows toast on error (including rate limit messages)

**4. UI changes to all three dialog components**

Files:
- `src/components/eos/rocks/CreateCompanyRockDialog.tsx`
- `src/components/eos/rocks/CreateTeamRockDialog.tsx`
- `src/components/eos/rocks/CreateIndividualRockDialog.tsx`

Each dialog gets:
- A "Suggest with AI" button (with Sparkles icon) placed below the dialog header
- On click: calls the hook, populates title/description/issue/outcome/milestones
- Shows a loading state while generating
- Shows a small info banner when AI content is loaded: "AI-suggested draft -- review and edit before saving"
- The banner disappears if the user manually edits any field

**5. No database changes required**

The feature is stateless -- suggestions are generated on-demand and only persisted when the user clicks "Create Rock" (using the existing save flow).

### Files to Create
- `supabase/functions/ai-suggest-rock/index.ts`
- `src/hooks/useAISuggestRock.ts`

### Files to Edit
- `supabase/config.toml` (add function entry)
- `src/components/eos/rocks/CreateCompanyRockDialog.tsx` (add AI suggest button)
- `src/components/eos/rocks/CreateTeamRockDialog.tsx` (add AI suggest button)
- `src/components/eos/rocks/CreateIndividualRockDialog.tsx` (add AI suggest button)

### What Does Not Change
- No new database tables or migrations
- No changes to existing Rock save logic
- No changes to permissions or RLS
- No changes to the Rock hierarchy or rollup rules
