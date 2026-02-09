import * as React from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * AppDrawer - Unified responsive drawer/slide panel
 * 
 * Features:
 * - Slides from right (default), left, top, or bottom
 * - Full height with internal scrolling
 * - Viewport-safe sizing: w-[min(92vw, maxWidth)]
 * - Sticky header/footer with scrollable body
 * - Focus trapping and restoration
 * - ARIA attributes for accessibility
 * - Blocking mode to prevent backdrop/ESC close
 */

// ============================================================
// SIZE VARIANTS
// ============================================================

const widthClasses = {
  sm: "w-[min(92vw,20rem)]",   // 320px
  md: "w-[min(92vw,28rem)]",   // 448px - default
  lg: "w-[min(92vw,32rem)]",   // 512px
  xl: "w-[min(92vw,40rem)]",   // 640px
  "2xl": "w-[min(92vw,48rem)]", // 768px
  full: "w-[min(96vw,64rem)]", // 1024px
} as const;

type DrawerWidth = keyof typeof widthClasses;

type DrawerSide = "left" | "right" | "top" | "bottom";

// ============================================================
// CONTEXT
// ============================================================

interface AppDrawerContextValue {
  titleId: string;
  descriptionId: string;
  isBlocking: boolean;
  side: DrawerSide;
}

const AppDrawerContext = React.createContext<AppDrawerContextValue | null>(null);

function useAppDrawerContext() {
  const context = React.useContext(AppDrawerContext);
  if (!context) {
    throw new Error("AppDrawer components must be used within an AppDrawer");
  }
  return context;
}

// ============================================================
// ROOT
// ============================================================

interface AppDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Side to slide from */
  side?: DrawerSide;
  /** Prevent closing via backdrop click or ESC */
  isBlocking?: boolean;
  children: React.ReactNode;
}

export function AppDrawer({ 
  open, 
  onOpenChange, 
  side = "right",
  isBlocking = false,
  children 
}: AppDrawerProps) {
  const titleId = React.useId();
  const descriptionId = React.useId();
  
  const handleOpenChange = React.useCallback((nextOpen: boolean) => {
    if (!nextOpen && isBlocking) {
      return;
    }
    onOpenChange(nextOpen);
  }, [onOpenChange, isBlocking]);

  return (
    <AppDrawerContext.Provider value={{ titleId, descriptionId, isBlocking, side }}>
      <DialogPrimitive.Root open={open} onOpenChange={handleOpenChange}>
        {children}
      </DialogPrimitive.Root>
    </AppDrawerContext.Provider>
  );
}

// ============================================================
// CONTENT
// ============================================================

interface AppDrawerContentProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Width variant (for left/right) or height variant (for top/bottom) */
  size?: DrawerWidth;
  children: React.ReactNode;
}

const slideAnimations = {
  left: "data-[state=closed]:slide-out-to-left data-[state=open]:slide-in-from-left",
  right: "data-[state=closed]:slide-out-to-right data-[state=open]:slide-in-from-right",
  top: "data-[state=closed]:slide-out-to-top data-[state=open]:slide-in-from-top",
  bottom: "data-[state=closed]:slide-out-to-bottom data-[state=open]:slide-in-from-bottom",
};

const positionClasses = {
  left: "inset-y-0 left-0 h-dvh border-r",
  right: "inset-y-0 right-0 h-dvh border-l",
  top: "inset-x-0 top-0 w-full border-b",
  bottom: "inset-x-0 bottom-0 w-full border-t",
};

export const AppDrawerContent = React.forwardRef<HTMLDivElement, AppDrawerContentProps>(
  ({ size = "md", className, children, ...props }, ref) => {
    const { titleId, descriptionId, isBlocking, side } = useAppDrawerContext();
    
    const isVertical = side === "top" || side === "bottom";
    
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
        
        {/* Drawer */}
        <DialogPrimitive.Content
          ref={ref}
          aria-labelledby={titleId}
          aria-describedby={descriptionId}
          className={cn(
            // Position
            "fixed z-50",
            positionClasses[side],
            // Size
            !isVertical && widthClasses[size],
            isVertical && "max-h-[80vh] max-h-[80dvh]",
            // Layout
            "flex flex-col",
            // Styling
            "bg-background shadow-lg",
            // Animations
            "transition ease-in-out duration-300",
            "data-[state=open]:animate-in data-[state=closed]:animate-out",
            slideAnimations[side],
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
AppDrawerContent.displayName = "AppDrawerContent";

// ============================================================
// HEADER (Sticky)
// ============================================================

interface AppDrawerHeaderProps extends React.HTMLAttributes<HTMLDivElement> {
  hideClose?: boolean;
  children: React.ReactNode;
}

export const AppDrawerHeader = React.forwardRef<HTMLDivElement, AppDrawerHeaderProps>(
  ({ className, hideClose = false, children, ...props }, ref) => {
    const { isBlocking } = useAppDrawerContext();
    
    return (
      <div
        ref={ref}
        className={cn(
          "sticky top-0 z-10 bg-background",
          "px-4 py-4 md:px-6",
          "border-b",
          "flex items-start justify-between gap-4",
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
AppDrawerHeader.displayName = "AppDrawerHeader";

// ============================================================
// TITLE
// ============================================================

export const AppDrawerTitle = React.forwardRef<
  HTMLHeadingElement,
  React.HTMLAttributes<HTMLHeadingElement>
>(({ className, children, ...props }, ref) => {
  const { titleId } = useAppDrawerContext();
  
  return (
    <DialogPrimitive.Title
      ref={ref}
      id={titleId}
      className={cn(
        "text-lg font-semibold leading-tight tracking-tight",
        "break-words",
        className
      )}
      {...props}
    >
      {children}
    </DialogPrimitive.Title>
  );
});
AppDrawerTitle.displayName = "AppDrawerTitle";

// ============================================================
// DESCRIPTION
// ============================================================

export const AppDrawerDescription = React.forwardRef<
  HTMLParagraphElement,
  React.HTMLAttributes<HTMLParagraphElement>
>(({ className, children, ...props }, ref) => {
  const { descriptionId } = useAppDrawerContext();
  
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
});
AppDrawerDescription.displayName = "AppDrawerDescription";

// ============================================================
// BODY (Scrollable)
// ============================================================

export const AppDrawerBody = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, children, ...props }, ref) => {
  return (
    <div
      ref={ref}
      className={cn(
        "flex-1 overflow-y-auto overflow-x-hidden overscroll-contain",
        "px-4 py-4 md:px-6 md:py-5",
        "space-y-4",
        className
      )}
      {...props}
    >
      {children}
    </div>
  );
});
AppDrawerBody.displayName = "AppDrawerBody";

// ============================================================
// FOOTER (Sticky)
// ============================================================

export const AppDrawerFooter = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, children, ...props }, ref) => {
  return (
    <div
      ref={ref}
      className={cn(
        "sticky bottom-0 z-10 bg-background",
        "px-4 py-4 md:px-6",
        "border-t",
        "flex flex-col-reverse gap-2 sm:flex-row sm:justify-end",
        "flex-shrink-0",
        className
      )}
      {...props}
    >
      {children}
    </div>
  );
});
AppDrawerFooter.displayName = "AppDrawerFooter";

// ============================================================
// EXPORTS
// ============================================================

export type { AppDrawerProps, AppDrawerContentProps, DrawerWidth, DrawerSide };
