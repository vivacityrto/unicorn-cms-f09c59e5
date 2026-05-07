## Plan

Edit only `src/pages/TeamCommunicationsPage.tsx`:

1. **Line 1 area**: Add a new import below the React import:
   ```ts
   import { useSearchParams } from "react-router-dom";
   ```

2. **Inside the component**, add:
   ```ts
   const [searchParams] = useSearchParams();
   ```

3. **Add an effect** that auto-selects the thread once conversations load:
   ```ts
   useEffect(() => {
     const threadId = searchParams.get('thread');
     if (threadId && conversations.length > 0) {
       setSelectedId(threadId);
     }
   }, [conversations, searchParams]);
   ```

No other files touched. No changes to selection logic, queries, or UI.
