
## Fix: Link Event to Client Dialog Viewport Overflow

**Problem**: The dialog's client list has a fixed height (`h-[300px]`), which combined with the header, search input, and footer can push the "Link to client" button off-screen on smaller viewports.

**Solution**: Change the ScrollArea from a fixed height to a responsive max-height so it shrinks on smaller screens.

### Technical Details

**File**: `src/components/calendar/LinkEventToClientDialog.tsx`

- Change the ScrollArea class from `h-[300px]` to `max-h-[40vh] min-h-[150px]` so it adapts to the viewport while keeping a usable minimum size.
- This ensures the footer with Cancel / Link to client buttons is always visible.
