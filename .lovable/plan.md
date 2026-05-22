# Replace Academy "More" Dropdown with Searchable Command Palette

Frontend-only change to `src/components/academy/AudienceHubPage.tsx`. Swaps the overflow `DropdownMenu` for a `Popover` + `Command` palette that supports search, keyboard navigation, and auto-flips on small viewports. No DB, no API, no behavioural changes to filtering or tag computation.

## File: `src/components/academy/AudienceHubPage.tsx`

### 1. Imports
- Remove the `DropdownMenu`, `DropdownMenuContent`, `DropdownMenuItem`, `DropdownMenuTrigger` import block (lines 9–14). Grep confirms no other usage in this file.
- Add:
  ```ts
  import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
  import {
    Command,
    CommandInput,
    CommandList,
    CommandEmpty,
    CommandGroup,
    CommandItem,
  } from "@/components/ui/command";
  ```
- `useState` is already imported (line 1) — no change.

### 2. State
In the component body (near line 90), add:
```ts
const [moreOpen, setMoreOpen] = useState(false);
```

### 3. Replace the overflow block (lines 177–207)
Replace the entire `<DropdownMenu>...</DropdownMenu>` with:

```tsx
{overflowTags.length > 0 && (
  <Popover open={moreOpen} onOpenChange={setMoreOpen}>
    <PopoverTrigger asChild>
      <button
        className={cn(
          "px-3 py-2 text-sm font-medium whitespace-nowrap rounded-t-md transition-colors flex items-center gap-1",
          overflowTags.some((b) => b.tag === activeTag)
            ? "border-b-2"
            : "text-muted-foreground hover:text-foreground",
        )}
        style={
          overflowTags.some((b) => b.tag === activeTag)
            ? { color: accentColour, borderColor: accentColour }
            : undefined
        }
      >
        More <ChevronDown className="h-3.5 w-3.5" />
      </button>
    </PopoverTrigger>
    <PopoverContent className="w-64 p-0" align="start" collisionPadding={16}>
      <Command>
        <CommandInput placeholder="Search categories..." />
        <CommandList>
          <CommandEmpty>No categories found.</CommandEmpty>
          <CommandGroup>
            {overflowTags.map((b) => (
              <CommandItem
                key={b.tag}
                value={prettyTag(b.tag)}
                onSelect={() => {
                  setActiveTag(b.tag);
                  setMoreOpen(false);
                }}
              >
                {prettyTag(b.tag)} ({b.count})
              </CommandItem>
            ))}
          </CommandGroup>
        </CommandList>
      </Command>
    </PopoverContent>
  </Popover>
)}
```

Trigger button markup is byte-identical to the previous version (same classes, active-state highlight, label, chevron) — only the wrapping primitive changes.

### Notes on the chosen primitives
- `CommandList` in `src/components/ui/command.tsx` already applies `max-h-[300px] overflow-y-auto` — no override needed.
- `PopoverContent` from `src/components/ui/popover.tsx` uses Radix Portal, so it auto-flips above the trigger when bottom space is tight and respects `collisionPadding`.
- `Command` (cmdk) gives keyboard nav (Arrow/Enter), filtering by `value` (we pass `prettyTag` so users search by display label, not raw slug), and Esc to dismiss for free.
- Controlled `open` state is needed so `onSelect` can close the popover after picking an item.

### Out of scope (unchanged)
`overflowTags`, `visibleTags`, `activeTag`, `prettyTag`, `renderTabButton`, `buildTagBuckets`, course grid, loading/error/empty states.

## Verification checklist
1. Diff shows only the imports, one new `useState`, and the overflow JSX block changed.
2. No dangling `DropdownMenu*` imports remain (grep the file).
3. `/academy/audience/administration-assistant`: click **More** → popover opens with search box + scrollable list; typing "br" filters to "Branding"; click → active tab updates, popover closes.
4. Keyboard: Enter/Space opens, type filters, Arrow keys navigate, Enter selects, Esc closes.
5. Active-state `border-b-2` still appears on the trigger when the selected tag lives in the overflow set.
6. Small viewport: popover flips above when no room below; stays within viewport via `collisionPadding={16}`.
7. Role pages with few overflow categories render a compact popover (search bar present but list is short — acceptable).
8. Build passes — no unused imports, no unused state.
