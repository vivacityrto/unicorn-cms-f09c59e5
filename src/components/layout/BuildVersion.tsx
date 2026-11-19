import { useState } from "react";
import { Check, Copy } from "lucide-react";
import { cn } from "@/lib/utils";

const BUILD_ID = import.meta.env.VITE_BUILD_ID as string | undefined;

/** The build version shown in the footers (staff and client), or nothing where the build has no id (local development). */
export function BuildVersion({ className }: { className?: string }) {
  const [copied, setCopied] = useState(false);
  if (!BUILD_ID || BUILD_ID === "__BUILD_ID__") return null;

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(BUILD_ID);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      /* Clipboard can be blocked; the build id is still visible. */
    }
  };

  return (
    <button
      type="button"
      onClick={copy}
      title="Build version. Click to copy"
      className={cn(
        "hidden items-center gap-1.5 rounded px-1 py-0.5 font-mono text-[10px] text-muted-foreground/70 transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring md:inline-flex",
        className,
      )}
    >
      {copied ? <Check aria-hidden className="h-3 w-3" /> : <Copy aria-hidden className="h-3 w-3" />}
      {copied ? "Copied" : `Build ${BUILD_ID}`}
    </button>
  );
}
