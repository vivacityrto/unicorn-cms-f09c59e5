import * as React from "react";
import { cn } from "@/lib/utils";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Copy, Check } from "lucide-react";

/**
 * Text Overflow Utilities
 * =======================
 * Standardized text handling for long strings across the app.
 * 
 * Modes:
 * - wrap: Normal wrapping (default for headings, paragraphs)
 * - truncate: Single line with ellipsis (requires tooltip/reveal)
 * - truncate-2/3: Multi-line clamp with ellipsis
 * - mono: Monospace for IDs, codes (uses break-all)
 * - nowrap: For short tokens like dates
 */

// ============================================================
// TEXT COMPONENT
// ============================================================

export type TextOverflow = "wrap" | "truncate" | "truncate-2" | "truncate-3" | "mono" | "nowrap";

interface TextProps extends React.HTMLAttributes<HTMLSpanElement> {
  /** Text overflow mode */
  overflow?: TextOverflow;
  /** HTML element to render */
  as?: "span" | "p" | "div" | "h1" | "h2" | "h3" | "h4" | "h5" | "h6";
  /** Full text for tooltip (if different from children) */
  title?: string;
  /** Show tooltip on truncated text */
  showTooltip?: boolean;
  /** Show copy button (for IDs, emails) */
  copyable?: boolean;
  /** Text to copy (if different from children) */
  copyText?: string;
  /** Max width constraint */
  maxWidth?: string;
}

export function Text({
  children,
  overflow = "wrap",
  as: Component = "span",
  title,
  showTooltip = false,
  copyable = false,
  copyText,
  maxWidth,
  className,
  ...props
}: TextProps) {
  const [copied, setCopied] = React.useState(false);
  const textRef = React.useRef<HTMLSpanElement | HTMLDivElement | HTMLParagraphElement | HTMLHeadingElement>(null);
  const [isTruncated, setIsTruncated] = React.useState(false);

  // Check if text is actually truncated
  React.useEffect(() => {
    const el = textRef.current;
    if (el && (overflow === "truncate" || overflow === "truncate-2" || overflow === "truncate-3")) {
      setIsTruncated(el.scrollWidth > el.clientWidth || el.scrollHeight > el.clientHeight);
    }
  }, [children, overflow]);

  const overflowClasses: Record<TextOverflow, string> = {
    wrap: "whitespace-normal break-words",
    truncate: "truncate",
    "truncate-2": "line-clamp-2",
    "truncate-3": "line-clamp-3",
    mono: "font-mono text-xs break-all",
    nowrap: "whitespace-nowrap",
  };

  const handleCopy = async (e: React.MouseEvent) => {
    e.stopPropagation();
    const textToCopy = copyText || (typeof children === "string" ? children : "");
    await navigator.clipboard.writeText(textToCopy);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const combinedClassName = cn(
    overflowClasses[overflow],
    maxWidth,
    copyable && "inline-flex items-center gap-1.5",
    className
  );

  const copyButton = copyable && (
    <button
      type="button"
      onClick={handleCopy}
      className="inline-flex items-center justify-center h-5 w-5 rounded hover:bg-muted/50 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-1 flex-shrink-0"
      aria-label="Copy to clipboard"
    >
      {copied ? (
        <Check className="h-3 w-3 text-success" />
      ) : (
        <Copy className="h-3 w-3 text-muted-foreground" />
      )}
    </button>
  );

  // Render element based on component type
  const renderElement = () => {
    const commonProps = { className: combinedClassName, ...props };
    
    switch (Component) {
      case "div":
        return <div ref={textRef as React.RefObject<HTMLDivElement>} {...commonProps}>{children}{copyButton}</div>;
      case "p":
        return <p ref={textRef as React.RefObject<HTMLParagraphElement>} {...commonProps}>{children}{copyButton}</p>;
      case "h1":
        return <h1 ref={textRef as React.RefObject<HTMLHeadingElement>} {...commonProps}>{children}{copyButton}</h1>;
      case "h2":
        return <h2 ref={textRef as React.RefObject<HTMLHeadingElement>} {...commonProps}>{children}{copyButton}</h2>;
      case "h3":
        return <h3 ref={textRef as React.RefObject<HTMLHeadingElement>} {...commonProps}>{children}{copyButton}</h3>;
      case "h4":
        return <h4 ref={textRef as React.RefObject<HTMLHeadingElement>} {...commonProps}>{children}{copyButton}</h4>;
      case "h5":
        return <h5 ref={textRef as React.RefObject<HTMLHeadingElement>} {...commonProps}>{children}{copyButton}</h5>;
      case "h6":
        return <h6 ref={textRef as React.RefObject<HTMLHeadingElement>} {...commonProps}>{children}{copyButton}</h6>;
      default:
        return <span ref={textRef as React.RefObject<HTMLSpanElement>} {...commonProps}>{children}{copyButton}</span>;
    }
  };

  const textElement = renderElement();

  // Show tooltip only when truncated and tooltip is enabled
  if (showTooltip && (isTruncated || title)) {
    return (
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>{textElement}</TooltipTrigger>
          <TooltipContent className="max-w-xs break-words">
            <p>{title || children}</p>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  }

  return textElement;
}

// ============================================================
// TRUNCATED TEXT (Convenience wrapper)
// ============================================================

interface TruncatedTextProps extends Omit<TextProps, "overflow" | "showTooltip"> {
  /** Number of lines before truncating (default: 1) */
  lines?: 1 | 2 | 3;
}

/**
 * TruncatedText - Single or multi-line truncation with automatic tooltip
 * 
 * @example
 * <TruncatedText>Very long text that will be truncated...</TruncatedText>
 * <TruncatedText lines={2}>Multi-line text...</TruncatedText>
 */
export function TruncatedText({ lines = 1, ...props }: TruncatedTextProps) {
  const overflow: TextOverflow = lines === 1 ? "truncate" : lines === 2 ? "truncate-2" : "truncate-3";
  return <Text overflow={overflow} showTooltip {...props} />;
}

// ============================================================
// COPYABLE ID (For UUIDs, codes, etc.)
// ============================================================

interface CopyableIdProps extends Omit<TextProps, "overflow" | "copyable" | "showTooltip"> {
  /** Show full ID in tooltip */
  showFullInTooltip?: boolean;
}

/**
 * CopyableId - Monospace text with copy button, designed for IDs and codes
 * 
 * @example
 * <CopyableId>abc123-def456-ghi789</CopyableId>
 */
export function CopyableId({ showFullInTooltip = true, children, ...props }: CopyableIdProps) {
  return (
    <Text
      overflow="mono"
      copyable
      showTooltip={showFullInTooltip}
      className="text-muted-foreground"
      {...props}
    >
      {children}
    </Text>
  );
}

// ============================================================
// TEXT UTILITIES (CSS class helpers)
// ============================================================

/**
 * Text utility class names for use in Tailwind
 */
export const textUtils = {
  /** Normal wrapping - default for paragraphs, headings */
  wrap: "whitespace-normal break-words",
  
  /** Single line truncation - requires tooltip/reveal */
  truncate: "truncate",
  
  /** Two line clamp */
  truncate2: "line-clamp-2",
  
  /** Three line clamp */
  truncate3: "line-clamp-3",
  
  /** No wrap - for short tokens like dates */
  nowrap: "whitespace-nowrap",
  
  /** Monospace with break-all - for IDs, codes */
  mono: "font-mono text-xs break-all",
  
  /** Prevent long unbroken strings from overflowing */
  breakWord: "break-words",
  
  /** Force break anywhere (use sparingly) */
  breakAll: "break-all",
} as const;

// ============================================================
// EXPORTS
// ============================================================

export type { TextProps, TruncatedTextProps, CopyableIdProps };
