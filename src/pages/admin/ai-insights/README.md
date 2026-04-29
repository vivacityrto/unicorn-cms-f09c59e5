# AI Drafting — Prompt-Tuning Loop

This is the operator runbook for using `/admin/ai-insights` to tune the
system prompt in `supabase/functions/draft-finding/index.ts`.

## Cadence

Run the loop once a fortnight while the feature is new. Drop to monthly
once acceptance rates stabilise.

## The loop

1. Open `/admin/ai-insights` with the window set to 30 days.
2. Look at the Patterns panel, right column. Pick the worst-performing
   clause that has at least 5 drafts. This is your tuning target.
3. Filter the Recent Drafts table to that clause. Open the three drafts
   with the highest edit distance.
4. For each, read the side-by-side. Note what the auditor changed:
   - Did they rewrite the summary because it was too generic?
   - Did they swap "directors" for "Governing Persons"? (terminology
     rule should have caught this — flag for prompt strengthening)
   - Did they remove a verbatim Standard quote? (quote-length rule)
   - Did they change the priority? (priority rubric needs sharpening)
   - Did they add specific consequences the AI missed? (impact section
     needs a stronger hint)
5. Open `supabase/functions/draft-finding/index.ts`. Find the system
   prompt. Make ONE change targeting the pattern you found. Commit with
   a message that names the clause and the change.
6. Wait two weeks. Re-run the loop. Confirm acceptance rate on that
   clause has improved before targeting the next one.

## Why one change at a time

If you change three things at once and the metrics improve, you don't
know which change worked. Disciplined single-variable iteration produces
a system prompt that's actually optimised, not just busy.

## When to escalate

If a clause produces drafts that get rejected outright more than 30% of
the time across 10+ drafts, the issue is probably not the system prompt
— it's that the SRTO corpus chunks for that clause aren't matching the
question. Open `/admin/ai-insights`, drill into one of the rejected
drafts, expand "Sources used", and check whether the chunks are on-topic.
If they aren't, the fix is in the chunking or embedding, not the prompt.
