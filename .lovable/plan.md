Add a visible preview-mode banner pill to the center of `ClientTopbar` when `isPreview === true`, replacing the empty flex spacer. The banner shows an eye icon, "Viewing as" label, a compact user switcher (if multiple acting users are available) or a plain name, and an elapsed session timer.

## What to build

### 1. New hook usage
Import `useClientPreview` from `@/contexts/ClientPreviewContext` inside `ClientTopbar`. Pull out `actingUserId`, `actingUserOptions`, and `setActingUserId`.

### 2. Session timer
Add an `elapsedMin` state (number, default 0). In a `useEffect` gated on `isPreview`, read `sessionStorage.getItem("client_preview_session")`, parse the JSON, and compute elapsed minutes from `startedAt`.

- Run the calculation once immediately on mount.
- Start a `setInterval` every 60 000 ms to recalculate.
- Clear the interval on cleanup.
- Format display as:
  - `< 1 min` when under 1 minute
  - `X min` when 1–59 minutes
  - `Xh Ym` when 60 minutes or more

### 3. Acting user display name
Resolve the active user’s name from `actingUserOptions`:
- `activeOption` = the option whose `user_uuid` matches `actingUserId`
- `activeUserName` = `activeOption?.full_name` ?? `actingUser?.first_name` ?? `"Client"`

### 4. Preview banner JSX
Replace the current center spacer (`<div className="flex-1" />`) with a conditional block:

- When `isPreview === true`, render a centered pill/banner containing:
  - An `Eye` icon from lucide-react
  - The text "Viewing as"
  - Either a compact `DropdownMenu` switcher (when `actingUserOptions.length > 1`) or plain bold text showing `activeUserName`
  - A bullet separator `·`
  - The formatted elapsed timer string
- When `isPreview === false`, render the existing empty spacer unchanged.

**Dropdown switcher behavior:**
- Trigger shows `activeUserName` plus a `ChevronDown` icon.
- Content includes a "Switch viewing as" label and a separator.
- Items list all `actingUserOptions`. Each item shows the user’s `full_name`.
- The currently selected user gets a `Check` (or similar current indicator).
- Clicking an item calls `setActingUserId(opt.user_uuid)`.

### 5. Icon imports
Add `Eye` and `ChevronDown` to the existing lucide-react import block. `DropdownMenu` primitives are already imported; no changes needed there.

## What NOT to change
- Existing profile dropdown, notification popover, and help button logic.
- `ClientPreviewContext.tsx` — `startedAt` is read directly from `sessionStorage` as specified.
- Any other file.

## Acceptance criteria
- Preview banner appears only when `isPreview` is true.
- Timer updates every minute and formats correctly across the three ranges.
- Single acting user renders plain text; multiple users render a working dropdown switcher.
- Switching users via the dropdown immediately updates `actingUserId` in context and persists via the existing `setActingUserId` callback.
- No visual regressions in non-preview mode.