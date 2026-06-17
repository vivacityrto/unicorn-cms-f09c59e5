## Problem
`buildVimeoEmbedUrl` in `src/components/academy/VimeoPlayer.tsx` (lines 27–33) uses a simple string replace that breaks when a Vimeo URL contains a privacy hash in the path segment, e.g.
`https://vimeo.com/444755523/77626ac772`
The current code produces `player.vimeo.com/video/444755523/77626ac772` which Vimeo rejects.

## Solution
Replace the simple `replace().split("?")` logic with `new URL()` parsing:
- Extract the video ID from the first path segment.
- Extract the hash from either the second path segment **or** the `?h=` query parameter.
- Rebuild the embed URL as `https://player.vimeo.com/video/{id}?h={hash}&autoplay=0&title=0&byline=0&portrait=0&texttrack=en`.
- If no hash is present, omit the `h` parameter.

## File Changes
- `src/components/academy/VimeoPlayer.tsx` — rewrite `buildVimeoEmbedUrl` (lines 27–33 only).

## No other changes
- No new dependencies.
- No changes to other files or components.

## Verification
Test the function with:
1. `https://vimeo.com/444755523/77626ac772` → hash moved to `?h=`
2. `https://vimeo.com/444755523?h=77626ac772` → same result
3. `https://vimeo.com/456437357` → no hash parameter
4. `null` / `undefined` → returns `null`