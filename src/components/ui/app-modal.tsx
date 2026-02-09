import * as React from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * AppModal - Unified responsive modal system
 * 
 * Features:
 * - Viewport-safe sizing: w-[min(92vw, maxWidth)] max-h-[85vh]
 * - Sticky header/footer with scrollable body
 * - Focus trapping and restoration
 * - ARIA attributes for accessibility
 * - Responsive padding: p-4 md:p-6
 * - Blocking mode to prevent backdrop/ESC close
 */

// ============================================================
// SIZE VARIANTS
// ============================================================

const sizeClasses = {
  xs: "w-[min(92vw,20rem)]",   // 320px - small confirms
  sm: "w-[min(92vw,24rem)]",   // 384px - simple dialogs
  md: "w-[min(92vw,32rem)]",   // 512px - default
  lg: "w-[min(92vw,40rem)]",   // 640px - forms
  xl: "w-[min(92vw,48rem)]",   // 768px - complex forms
  "2xl": "w-[min(92vw,56rem)]", // 896px - large content
  full: "w-[min(96vw,72rem)]", // 1152px - full-width
} as const;

type ModalSize = keyof typeof sizeClasses;

// ============================================================
// CONTEXT
// ============================================================

interface AppModalContextValue {
  titleId: string;
  descriptionId: string;
  isBlocking: boolean;
}

const AppModalContext = React.createContext<AppModalContextValue | null>(null);

function useAppModalContext() {
  const context = React.useContext(AppModalContext);
  if (!context) {
    throw new Error("AppModal components must be used within an AppModal");
  }
  return context;
}

// ============================================================
// ROOT
// ============================================================

interface AppModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Prevent closing via backdrop click or ESC */
  isBlocking?: boolean;
  children: React.ReactNode;
}

export function AppModal({ 
  open, 
  onOpenChange, 
  isBlocking = false,
  children 
}: AppModalProps) {
  const titleId = React.useId();
  const descriptionId = React.useId();
  
  // Handle ESC key prevention when blocking
  const handleOpenChange = React.useCallback((nextOpen: boolean) => {
    if (!nextOpen && isBlocking) {
      return; // Prevent closing
    }
    onOpenChange(nextOpen);
  }, [onOpenChange, isBlocking]);

  return (
    <AppModalContext.Provider value={{ titleId, descriptionId, isBlocking }}>
      <DialogPrimitive.Root open={open} onOpenChange={handleOpenChange}>
        {children}
      </DialogPrimitive.Root>
    </AppModalContext.Provider>
  );
}

// ============================================================
// CONTENT
// ============================================================

interface AppModalContentProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Size variant */
  size?: ModalSize;
  /** Additional class names */
  className?: string;
  children: React.ReactNode;
}

export const AppModalContent = React.forwardRef<HTMLDivElement, AppModalContentProps>(
  ({ size = "md", className, children, ...props }, ref) => {
    const { titleId, descriptionId, isBlocking } = useAppModalContext();
    
    return (
      <DialogPrimitive.Portal>
        {/* Backdrop */}
        <DialogPrimitive.Overlay
          className={cn(
            "fixed inset-0 z-50 bg-black/80",
            "data-[state=open]:animate-in data-[state=closed]:animate-out",
            "data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0"
          )}
          onClick={isBlocking ? (e) => e.stopPropagation() : undefined}
        />
        
        {/* Modal */}
        <DialogPrimitive.Content
          ref={ref}
          aria-labelledby={titleId}
          aria-describedby={descriptionId}
          className={cn(
            // Position: centered
            "fixed left-[50%] top-[50%] z-50 translate-x-[-50%] translate-y-[-50%]",
            // Responsive width
            sizeClasses[size],
            // Viewport-safe height
            "max-h-[85vh] max-h-[85dvh]",
            // Layout for sticky header/footer
            "flex flex-col",
            // Styling
            "border bg-background shadow-lg rounded-lg",
            // Prevent horizontal overflow
            "overflow-hidden",
            // Animations
            "duration-200 data-[state=open]:animate-in data-[state=closed]:animate-out",
            "data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0",
            "data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95",
            "data-[state=closed]:slide-out-to-left-1/2 data-[state=closed]:slide-out-to-top-[48%]",
            "data-[state=open]:slide-in-from-left-1/2 data-[state=open]:slide-in-from-top-[48%]",
            className
          )}
          {...props}
        >
          {children}
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    );
  }
);
AppModalContent.displayName = "AppModalContent";

// ============================================================
// HEADER (Sticky)
// ============================================================

interface AppModalHeaderProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Hide the close button */
  hideClose?: boolean;
  children: React.ReactNode;
}

export const AppModalHeader = React.forwardRef<HTMLDivElement, AppModalHeaderProps>(
  ({ className, hideClose = false, children, ...props }, ref) => {
    const { isBlocking } = useAppModalContext();
    
    return (
      <div
        ref={ref}
        className={cn(
          // Sticky at top
          "sticky top-0 z-10 bg-background",
          // Padding
          "px-4 py-4 md:px-6",
          // Border
          "border-b",
          // Layout
          "flex items-start justify-between gap-4",
          // Prevent shrink
          "flex-shrink-0",
          className
        )}
        {...props}
      >
        <div className="flex-1 min-w-0 space-y-1.5">
          {children}
        </div>
        
        {!hideClose && (
          <DialogPrimitive.Close
            className={cn(
              "flex-shrink-0 rounded-sm opacity-70 ring-offset-background transition-opacity",
              "hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2",
              "disabled:pointer-events-none",
              "min-w-[44px] min-h-[44px] -mr-2 -mt-2 flex items-center justify-center",
              isBlocking && "opacity-50 pointer-events-none"
            )}
            disabled={isBlocking}
          >
            <X className="h-5 w-5" />
            <span className="sr-only">Close</span>
          </DialogPrimitive.Close>
        )}
      </div>
    );
  }
);
AppModalHeader.displayName = "AppModalHeader";

// ============================================================
// TITLE
// ============================================================

interface AppModalTitleProps extends React.HTMLAttributes<HTMLHeadingElement> {
  children: React.ReactNode;
}

export const AppModalTitle = React.forwardRef<HTMLHeadingElement, AppModalTitleProps>(
  ({ className, children, ...props }, ref) => {
    const { titleId } = useAppModalContext();
    
    return (
      <DialogPrimitive.Title
        ref={ref}
        id={titleId}
        className={cn(
          "text-lg font-semibold leading-tight tracking-tight",
          "break-words", // Prevent long titles from clipping
          className
        )}
        {...props}
      >
        {children}
      </DialogPrimitive.Title>
    );
  }
);
AppModalTitle.displayName = "AppModalTitle";

// ============================================================
// DESCRIPTION
// ============================================================

interface AppModalDescriptionProps extends React.HTMLAttributes<HTMLParagraphElement> {
  children: React.ReactNode;
}

export const AppModalDescription = React.forwardRef<HTMLParagraphElement, AppModalDescriptionProps>(
  ({ className, children, ...props }, ref) => {
    const { descriptionId } = useAppModalContext();
    
    return (
      <DialogPrimitive.Description
        ref={ref}
        id={descriptionId}
        className={cn(
          "text-sm text-muted-foreground",
          "break-words",
          className
        )}
        {...props}
      >
        {children}
      </DialogPrimitive.Description>
    );
  }
);
AppModalDescription.displayName = "AppModalDescription";

// ============================================================
// BODY (Scrollable)
// ============================================================

interface AppModalBodyProps extends React.HTMLAttributes<HTMLDivElement> {
  children: React.ReactNode;
}

export const AppModalBody = React.forwardRef<HTMLDivElement, AppModalBodyProps>(
  ({ className, children, ...props }, ref) => {
    return (
      <div
        ref={ref}
        className={cn(
          // Scrollable
          "flex-1 overflow-y-auto overflow-x-hidden overscroll-contain",
          // Padding
          "px-4 py-4 md:px-6 md:py-5",
          // Spacing
          "space-y-4",
          className
        )}
        {...props}
      >
        {children}
      </div>
    );
  }
);
AppModalBody.displayName = "AppModalBody";

// ============================================================
// FOOTER (Sticky)
// ============================================================

interface AppModalFooterProps extends React.HTMLAttributes<HTMLDivElement> {
  children: React.ReactNode;
}

export const AppModalFooter = React.forwardRef<HTMLDivElement, AppModalFooterProps>(
  ({ className, children, ...props }, ref) => {
    return (
      <div
        ref={ref}
        className={cn(
          // Sticky at bottom
          "sticky bottom-0 z-10 bg-background",
          // Padding
          "px-4 py-4 md:px-6",
          // Border
          "border-t",
          // Layout - stack on mobile, row on sm+
          "flex flex-col-reverse gap-2 sm:flex-row sm:justify-end",
          // Prevent shrink
          "flex-shrink-0",
          className
        )}
        {...props}
      >
        {children}
      </div>
    );
  }
);
AppModalFooter.displayName = "AppModalFooter";

// ============================================================
// EXPORTS
// ============================================================

export type { AppModalProps, AppModalContentProps, ModalSize };
