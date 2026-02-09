import * as React from "react";
import { cn } from "@/lib/utils";
import { format } from "date-fns";

/**
 * Print Utilities
 * ===============
 * Components and utilities for audit-ready print/PDF exports.
 * 
 * Usage:
 * - Add data-print="hide" to elements that should not print
 * - Add data-print="content" to the main printable area
 * - Add data-print="show" to force-show elements (like specific headers)
 * - Use PrintHeader for evidence-ready export headers
 */

// ============================================================
// PRINT HEADER (Evidence Block)
// ============================================================

interface PrintHeaderProps {
  /** Document/report title */
  title: string;
  /** Organisation/tenant name */
  tenantName?: string;
  /** Package or phase name if relevant */
  packageName?: string;
  /** Additional context line */
  context?: string;
  /** Override export timestamp (defaults to now) */
  exportDate?: Date;
  /** Document reference number if applicable */
  documentRef?: string;
  /** Additional className */
  className?: string;
}

/**
 * PrintHeader - Evidence-ready header for printed documents
 * 
 * Displays:
 * - Document title
 * - Tenant/organisation name
 * - Package/phase name (if provided)
 * - Export date and time
 * - Document reference (if provided)
 * 
 * @example
 * <PrintHeader 
 *   title="Meeting Minutes" 
 *   tenantName="Acme Training Pty Ltd"
 *   packageName="KickStart Package - Phase 2"
 *   documentRef="MTG-2024-0042"
 * />
 */
export function PrintHeader({
  title,
  tenantName,
  packageName,
  context,
  exportDate = new Date(),
  documentRef,
  className,
}: PrintHeaderProps) {
  const formattedDate = format(exportDate, "dd/MM/yyyy");
  const formattedTime = format(exportDate, "HH:mm");

  return (
    <div 
      className={cn(
        "print-header print-only border-b-2 border-black pb-4 mb-6",
        className
      )}
      data-print="show"
    >
      <h1 className="print-header-title text-xl font-bold mb-2">
        {title}
      </h1>
      
      <div className="print-header-meta text-sm text-muted-foreground space-y-1">
        {tenantName && (
          <div>
            <span className="font-medium">Organisation:</span> {tenantName}
          </div>
        )}
        
        {packageName && (
          <div>
            <span className="font-medium">Package/Phase:</span> {packageName}
          </div>
        )}
        
        {context && (
          <div>
            <span className="font-medium">Context:</span> {context}
          </div>
        )}
        
        <div className="flex flex-wrap gap-4 pt-1">
          <span>
            <span className="font-medium">Exported:</span> {formattedDate} at {formattedTime}
          </span>
          
          {documentRef && (
            <span>
              <span className="font-medium">Ref:</span> {documentRef}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

// ============================================================
// PRINT WRAPPER
// ============================================================

interface PrintWrapperProps {
  /** Content to wrap */
  children: React.ReactNode;
  /** Include print header */
  header?: PrintHeaderProps;
  /** Additional className */
  className?: string;
}

/**
 * PrintWrapper - Wrapper for printable content areas
 * 
 * Marks content with data-print="content" for proper print styling.
 * Optionally includes a PrintHeader.
 * 
 * @example
 * <PrintWrapper header={{ title: "User Report", tenantName: "Acme Corp" }}>
 *   <Table>...</Table>
 * </PrintWrapper>
 */
export function PrintWrapper({ children, header, className }: PrintWrapperProps) {
  return (
    <div 
      className={cn("print-content", className)}
      data-print="content"
    >
      {header && <PrintHeader {...header} />}
      {children}
    </div>
  );
}

// ============================================================
// PRINT BUTTON
// ============================================================

interface PrintButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  /** Button variant */
  variant?: "default" | "outline" | "ghost";
  /** Button size */
  size?: "default" | "sm" | "lg";
  /** Children (button text) */
  children?: React.ReactNode;
}

/**
 * PrintButton - Triggers browser print dialog
 * 
 * Hidden in print output. Styled consistently.
 * 
 * @example
 * <PrintButton>Print Report</PrintButton>
 */
export function PrintButton({ 
  children = "Print", 
  className,
  onClick,
  ...props 
}: PrintButtonProps) {
  const handlePrint = (e: React.MouseEvent<HTMLButtonElement>) => {
    onClick?.(e);
    window.print();
  };

  return (
    <button
      type="button"
      onClick={handlePrint}
      className={cn(
        "no-print inline-flex items-center justify-center rounded-md text-sm font-medium",
        "ring-offset-background transition-colors focus-visible:outline-none",
        "focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
        "disabled:pointer-events-none disabled:opacity-50",
        "bg-primary text-primary-foreground hover:bg-primary/90",
        "h-10 px-4 py-2",
        className
      )}
      data-print="hide"
      {...props}
    >
      {children}
    </button>
  );
}

// ============================================================
// PAGE BREAK
// ============================================================

interface PageBreakProps {
  /** Break before or after this element */
  position?: "before" | "after";
  /** Visible divider on screen */
  showDivider?: boolean;
}

/**
 * PageBreak - Forces a page break in print output
 * 
 * @example
 * <PageBreak position="before" />
 * <Section>New page content</Section>
 */
export function PageBreak({ position = "before", showDivider = false }: PageBreakProps) {
  const className = position === "before" ? "page-break-before" : "page-break-after";
  
  if (showDivider) {
    return (
      <div className={cn(className, "border-t border-dashed border-muted my-6 print:border-0")} />
    );
  }
  
  return <div className={className} aria-hidden="true" />;
}

// ============================================================
// PRINT STATUS BADGE
// ============================================================

interface PrintStatusBadgeProps {
  /** Status type for icon indicator */
  status: "success" | "warning" | "error" | "info" | "pending";
  /** Display text */
  children: React.ReactNode;
  /** Additional className */
  className?: string;
}

/**
 * PrintStatusBadge - Badge that renders clearly in print
 * 
 * Uses text indicators instead of color-only styling.
 * 
 * @example
 * <PrintStatusBadge status="success">Completed</PrintStatusBadge>
 */
export function PrintStatusBadge({ status, children, className }: PrintStatusBadgeProps) {
  const statusIcons = {
    success: "✓",
    warning: "⚠",
    error: "✗",
    info: "ℹ",
    pending: "○",
  };

  return (
    <span 
      className={cn(
        "inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-xs font-medium",
        "print:bg-transparent print:border-gray-400",
        className
      )}
      data-print="badge"
      data-status={status}
    >
      <span className="print-only">{statusIcons[status]} </span>
      {children}
    </span>
  );
}

// ============================================================
// UTILITIES
// ============================================================

/**
 * Trigger browser print dialog
 */
export function triggerPrint() {
  window.print();
}

/**
 * Check if currently in print mode (for conditional rendering)
 * Note: This only works during actual print, not preview
 */
export function isPrintMode(): boolean {
  return window.matchMedia?.("print").matches ?? false;
}

// ============================================================
// EXPORTS
// ============================================================

export type { PrintHeaderProps, PrintWrapperProps, PrintButtonProps, PageBreakProps, PrintStatusBadgeProps };
