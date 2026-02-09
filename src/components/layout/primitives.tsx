import * as React from "react";
import { cn } from "@/lib/utils";

/**
 * Responsive Layout Primitives
 * ============================
 * These components enforce consistent breakpoint standards across Unicorn 2.0.
 * 
 * Breakpoints (Tailwind defaults):
 * - sm: 640px
 * - md: 768px
 * - lg: 1024px
 * - xl: 1280px
 * - 2xl: 1536px
 * 
 * Container widths:
 * - Default page: max-w-screen-xl (1280px)
 * - Inner content: max-w-5xl (64rem / 1024px)
 * - Forms: max-w-3xl (48rem / 768px)
 * - Reading text: max-w-2xl (42rem / 672px)
 */

// ============================================================
// PAGE CONTAINER
// ============================================================

interface PageContainerProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Maximum width variant */
  maxWidth?: "full" | "xl" | "lg" | "md" | "sm";
  /** Disable default padding */
  noPadding?: boolean;
  children: React.ReactNode;
}

const maxWidthClasses = {
  full: "max-w-full",
  xl: "max-w-screen-xl", // 1280px - default page container
  lg: "max-w-5xl",       // 1024px - inner content blocks
  md: "max-w-3xl",       // 768px - forms
  sm: "max-w-2xl",       // 672px - reading text
};

/**
 * PageContainer - Primary page wrapper with responsive padding
 * 
 * @example
 * <PageContainer>
 *   <PageHeader title="My Page" />
 *   <Section>Content here</Section>
 * </PageContainer>
 */
export const PageContainer = React.forwardRef<HTMLDivElement, PageContainerProps>(
  ({ className, maxWidth = "full", noPadding = false, children, ...props }, ref) => {
    // When maxWidth is "full", don't apply mx-auto or max-width constraints
    // This prevents layout collapse issues
    const isFullWidth = maxWidth === "full";
    
    return (
      <div
        ref={ref}
        className={cn(
          // Core layout contract: always w-full, min-w-0 to prevent collapse
          "w-full min-w-0",
          // Only apply max-width and centering when explicitly constrained
          !isFullWidth && maxWidthClasses[maxWidth],
          !isFullWidth && "mx-auto",
          // Responsive padding: only on non-full containers or when explicitly set
          !noPadding && "py-4 md:py-6 lg:py-8",
          className
        )}
        {...props}
      >
        {children}
      </div>
    );
  }
);
PageContainer.displayName = "PageContainer";

// ============================================================
// SECTION
// ============================================================

interface SectionProps extends React.HTMLAttributes<HTMLElement> {
  /** Section heading */
  title?: string;
  /** Section description */
  description?: string;
  /** Right-aligned actions */
  actions?: React.ReactNode;
  /** Maximum width for content */
  maxWidth?: "full" | "xl" | "lg" | "md" | "sm";
  /** Spacing between children */
  spacing?: "sm" | "md" | "lg";
  children: React.ReactNode;
}

const spacingClasses = {
  sm: "space-y-3",
  md: "space-y-4 md:space-y-6",
  lg: "space-y-6 md:space-y-8",
};

/**
 * Section - Semantic section with optional header
 * 
 * @example
 * <Section title="Settings" description="Manage your preferences">
 *   <Form />
 * </Section>
 */
export const Section = React.forwardRef<HTMLElement, SectionProps>(
  ({ className, title, description, actions, maxWidth = "full", spacing = "md", children, ...props }, ref) => {
    return (
      <section
        ref={ref}
        className={cn(
          maxWidth !== "full" && maxWidthClasses[maxWidth],
          spacingClasses[spacing],
          className
        )}
        {...props}
      >
        {(title || description || actions) && (
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div className="space-y-1">
              {title && (
                <h2 className="text-lg font-semibold tracking-tight md:text-xl">
                  {title}
                </h2>
              )}
              {description && (
                <p className="text-sm text-muted-foreground md:text-base max-w-2xl">
                  {description}
                </p>
              )}
            </div>
            {actions && (
              <div className="flex items-center gap-2 flex-shrink-0">
                {actions}
              </div>
            )}
          </div>
        )}
        {children}
      </section>
    );
  }
);
Section.displayName = "Section";

// ============================================================
// RESPONSIVE GRID
// ============================================================

interface ResponsiveGridProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Number of columns at different breakpoints */
  cols?: {
    default?: 1 | 2 | 3 | 4;
    sm?: 1 | 2 | 3 | 4;
    md?: 1 | 2 | 3 | 4;
    lg?: 1 | 2 | 3 | 4 | 5 | 6;
    xl?: 1 | 2 | 3 | 4 | 5 | 6;
  };
  /** Gap size */
  gap?: "sm" | "md" | "lg";
  children: React.ReactNode;
}

const colClasses = {
  1: "grid-cols-1",
  2: "grid-cols-2",
  3: "grid-cols-3",
  4: "grid-cols-4",
  5: "grid-cols-5",
  6: "grid-cols-6",
};

const gapClasses = {
  sm: "gap-3 md:gap-4",
  md: "gap-4 md:gap-6",
  lg: "gap-6 md:gap-8",
};

/**
 * ResponsiveGrid - Grid with responsive column counts
 * 
 * @example
 * <ResponsiveGrid cols={{ default: 1, md: 2, lg: 3 }}>
 *   <Card />
 *   <Card />
 *   <Card />
 * </ResponsiveGrid>
 */
export const ResponsiveGrid = React.forwardRef<HTMLDivElement, ResponsiveGridProps>(
  ({ className, cols = { default: 1, md: 2, lg: 3 }, gap = "md", children, ...props }, ref) => {
    const gridClasses = [
      cols.default && colClasses[cols.default],
      cols.sm && `sm:${colClasses[cols.sm]}`,
      cols.md && `md:${colClasses[cols.md]}`,
      cols.lg && `lg:${colClasses[cols.lg]}`,
      cols.xl && `xl:${colClasses[cols.xl]}`,
    ].filter(Boolean).join(" ");

    return (
      <div
        ref={ref}
        className={cn(
          "grid",
          gridClasses,
          gapClasses[gap],
          className
        )}
        {...props}
      >
        {children}
      </div>
    );
  }
);
ResponsiveGrid.displayName = "ResponsiveGrid";

// ============================================================
// CONTENT BLOCK
// ============================================================

interface ContentBlockProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Variant determines max-width and purpose */
  variant?: "default" | "form" | "text" | "wide";
  children: React.ReactNode;
}

const contentVariants = {
  default: "max-w-5xl",   // 1024px - inner content
  form: "max-w-3xl",      // 768px - forms
  text: "max-w-2xl",      // 672px - reading text
  wide: "max-w-screen-xl", // 1280px - full width content
};

/**
 * ContentBlock - Constrains content to readable widths
 * 
 * @example
 * <ContentBlock variant="form">
 *   <Form />
 * </ContentBlock>
 */
export const ContentBlock = React.forwardRef<HTMLDivElement, ContentBlockProps>(
  ({ className, variant = "default", children, ...props }, ref) => {
    return (
      <div
        ref={ref}
        className={cn(contentVariants[variant], className)}
        {...props}
      >
        {children}
      </div>
    );
  }
);
ContentBlock.displayName = "ContentBlock";

// ============================================================
// RESPONSIVE STACK
// ============================================================

interface ResponsiveStackProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Direction changes at breakpoint */
  direction?: "col-to-row" | "row-to-col";
  /** Breakpoint for direction change */
  breakpoint?: "sm" | "md" | "lg";
  /** Spacing between items */
  spacing?: "sm" | "md" | "lg";
  /** Alignment */
  align?: "start" | "center" | "end" | "stretch";
  children: React.ReactNode;
}

/**
 * ResponsiveStack - Flexbox that switches direction at breakpoint
 * 
 * @example
 * <ResponsiveStack direction="col-to-row" breakpoint="md">
 *   <Input />
 *   <Button>Submit</Button>
 * </ResponsiveStack>
 */
export const ResponsiveStack = React.forwardRef<HTMLDivElement, ResponsiveStackProps>(
  ({ className, direction = "col-to-row", breakpoint = "sm", spacing = "md", align = "stretch", children, ...props }, ref) => {
    const directionClasses = {
      "col-to-row": {
        sm: "flex-col sm:flex-row",
        md: "flex-col md:flex-row",
        lg: "flex-col lg:flex-row",
      },
      "row-to-col": {
        sm: "flex-row sm:flex-col",
        md: "flex-row md:flex-col",
        lg: "flex-row lg:flex-col",
      },
    };

    const alignClasses = {
      start: "items-start",
      center: "items-center",
      end: "items-end",
      stretch: "items-stretch",
    };

    return (
      <div
        ref={ref}
        className={cn(
          "flex",
          directionClasses[direction][breakpoint],
          gapClasses[spacing],
          alignClasses[align],
          className
        )}
        {...props}
      >
        {children}
      </div>
    );
  }
);
ResponsiveStack.displayName = "ResponsiveStack";

// ============================================================
// EXPORTS
// ============================================================

export type {
  PageContainerProps,
  SectionProps,
  ResponsiveGridProps,
  ContentBlockProps,
  ResponsiveStackProps,
};
