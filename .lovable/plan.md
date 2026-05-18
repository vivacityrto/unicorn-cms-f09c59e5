## Fix Help Centre Chatbot Reply Rendering & Markdown

Two surgical edits to `src/components/help-center/ChatTab.tsx` only. No other files, no schema, no edge function changes.

### Changes

**1. Import ReactMarkdown** at the top of the file:
```ts
import ReactMarkdown from "react-markdown";
```

**2. Replace the post-invoke reply handling in `sendMessage`** — remove the `data?.assistant_message` branch and instead fetch the latest assistant message directly from `help_messages` for `data.thread_id`:
```ts
if (data?.thread_id) setThreadId(data.thread_id);

if (data?.thread_id) {
  const { data: latestMsg } = await supabase
    .from("help_messages")
    .select("id, role, content, created_at")
    .eq("thread_id", data.thread_id)
    .eq("role", "assistant")
    .order("created_at", { ascending: false })
    .limit(1)
    .single();

  if (latestMsg) {
    setMessages(prev => [...prev, latestMsg as Message]);
  }
}
```
This guarantees the assistant reply appears immediately without requiring a panel-switch remount.

**3. Render assistant messages with ReactMarkdown** (line ~142). User messages stay as plain `{msg.content}`:
```tsx
{msg.role === "assistant" ? (
  <ReactMarkdown
    components={{
      h2: ({ node, ...props }) => (
        <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mt-3 mb-1 first:mt-0" {...props} />
      ),
      ul: ({ node, ...props }) => <ul className="space-y-1 pl-4" {...props} />,
      ol: ({ node, ...props }) => <ol className="space-y-1 pl-4" {...props} />,
      li: ({ node, ...props }) => <li className="text-sm list-disc" {...props} />,
      p: ({ node, ...props }) => <p className="text-sm" {...props} />,
    }}
  >
    {msg.content}
  </ReactMarkdown>
) : (
  msg.content
)}
```

### Out of scope (unchanged)
- CSC/Support tabs, other help centre components
- `help-center-chat` edge function
- Mount-time history fetch `useEffect`
- Loading spinner, scroll behaviour, input form
- DB schema, RLS, packages
