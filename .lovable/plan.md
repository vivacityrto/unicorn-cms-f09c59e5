# Fix ReferenceError in ask-viv-prompts/index.ts

## Problem
`buildPromptPack()` and `buildFullPrompt()` in `supabase/functions/_shared/ask-viv-prompts/index.ts` reference `GLOBAL_SYSTEM_PROMPT`, `COMPLIANCE_SYSTEM_PROMPT`, `COMPLIANCE_DEVELOPER_PROMPT`, `KNOWLEDGE_SYSTEM_PROMPT`, and `KNOWLEDGE_DEVELOPER_PROMPT` as local bindings, but they are declared via `export { ... } from "./..."` re-export syntax, which does not create local bindings. Deno throws `ReferenceError: GLOBAL_SYSTEM_PROMPT is not defined` at runtime in `compliance-assistant`.

## Change
Single file: `supabase/functions/_shared/ask-viv-prompts/index.ts`

Convert each of the three `export { ... } from "./x.ts"` blocks into `import { ... } from "./x.ts"` followed by a separate `export { ... }` statement. This keeps the public API of the module identical while creating local bindings for `buildPromptPack` and `buildFullPrompt` to consume.

### Edits
1. Global prompt block → import then export `GLOBAL_SYSTEM_PROMPT`, `GLOBAL_SYSTEM_PROMPT_COMPACT`.
2. Compliance prompt block → import then export `COMPLIANCE_SYSTEM_PROMPT`, `COMPLIANCE_DEVELOPER_PROMPT`, `buildCompliancePrompt`.
3. Knowledge prompt block → import then export `KNOWLEDGE_SYSTEM_PROMPT`, `KNOWLEDGE_DEVELOPER_PROMPT`, `buildKnowledgePrompt`.

No other files modified. No schema, RLS, or frontend changes. Public exports unchanged.
