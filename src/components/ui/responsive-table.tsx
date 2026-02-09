import * as React from "react";
import { cn } from "@/lib/utils";
import { ChevronDown, ChevronUp, MoreHorizontal } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

/**
 * Responsive Table System
 * =======================
 * Components for making tables readable on all screen sizes.
 * 
 * Features:
 * - ResponsiveTableShell: Wrapper with horizontal scroll containment
 * - ResponsiveListCards: Card-based fallback for mobile
 * - Column visibility helpers
 * - Action menu consolidation
 */

// ============================================================
// RESPONSIVE TABLE SHELL
// ============================================================

interface ResponsiveTableShellProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Optional sticky header */
  stickyHeader?: boolean;
  /** Minimum width before scrolling */
  minWidth?: string;
  children: React.ReactNode;
}

/**
 * ResponsiveTableShell - Wrapper that prevents page-level horizontal scroll
 * 
 * @example
 * <ResponsiveTableShell>
 *   <Table>...</Table>
 * </ResponsiveTableShell>
 */
export const ResponsiveTableShell = React.forwardRef<HTMLDivElement, ResponsiveTableShellProps>(
  ({ className, stickyHeader = false, minWidth, children, ...props }, ref) => {
    return (
      <div
        ref={ref}
        className={cn(
          // Prevent page-level scroll
          "w-full max-w-full overflow-hidden",
          // Styling
          "rounded-lg border bg-card",
          className
        )}
        {...props}
      >
        <div
          className={cn(
            // Horizontal scroll inside container only
            "w-full overflow-x-auto overscroll-x-contain",
            // Optional sticky header support
            stickyHeader && "max-h-[70vh] overflow-y-auto"
          )}
          style={minWidth ? { minWidth } : undefined}
        >
          {children}
        </div>
      </div>
    );
  }
);
ResponsiveTableShell.displayName = "ResponsiveTableShell";

// ============================================================
// RESPONSIVE LIST CARDS
// ============================================================

interface CardField {
  label: string;
  value: React.ReactNode;
  priority?: "primary" | "secondary" | "tertiary";
  fullWidth?: boolean;
}

interface CardAction {
  label: string;
  icon?: React.ReactNode;
  onClick: () => void;
  variant?: "default" | "destructive" | "outline";
  disabled?: boolean;
}

interface ResponsiveListCardProps {
  /** Primary identifier (always visible) */
  title: React.ReactNode;
  /** Optional subtitle */
  subtitle?: React.ReactNode;
  /** Optional status badge */
  status?: React.ReactNode;
  /** Fields to display */
  fields: CardField[];
  /** Actions for this item */
  actions?: CardAction[];
  /** Click handler for the whole card */
  onClick?: () => void;
  /** Expandable additional content */
  expandedContent?: React.ReactNode;
  /** Additional className */
  className?: string;
}

/**
 * ResponsiveListCard - Single card for mobile list view
 */
export function ResponsiveListCard({
  title,
  subtitle,
  status,
  fields,
  actions,
  onClick,
  expandedContent,
  className,
}: ResponsiveListCardProps) {
  const [isExpanded, setIsExpanded] = React.useState(false);

  const primaryFields = fields.filter(f => f.priority === "primary" || !f.priority);
  const secondaryFields = fields.filter(f => f.priority === "secondary" || f.priority === "tertiary");

  return (
    <div
      className={cn(
        "rounded-lg border bg-card p-4 space-y-3",
        onClick && "cursor-pointer hover:bg-muted/50 transition-colors",
        className
      )}
      onClick={onClick}
    >
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="font-semibold text-foreground break-words">{title}</div>
          {subtitle && (
            <div className="text-sm text-muted-foreground break-words">{subtitle}</div>
          )}
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          {status}
          {actions && actions.length > 0 && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                  <MoreHorizontal className="h-4 w-4" />
                  <span className="sr-only">Actions</span>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                {actions.map((action, idx) => (
                  <DropdownMenuItem
                    key={idx}
                    onClick={(e) => {
                      e.stopPropagation();
                      action.onClick();
                    }}
                    disabled={action.disabled}
                    className={action.variant === "destructive" ? "text-destructive" : undefined}
                  >
                    {action.icon && <span className="mr-2">{action.icon}</span>}
                    {action.label}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>
      </div>

      {/* Primary Fields */}
      {primaryFields.length > 0 && (
        <div className="grid gap-2 text-sm">
          {primaryFields.map((field, idx) => (
            <div
              key={idx}
              className={cn(
                "flex items-start gap-2",
                field.fullWidth && "flex-col gap-1"
              )}
            >
              <span className="text-muted-foreground flex-shrink-0">{field.label}:</span>
              <span className="text-foreground break-words min-w-0">{field.value || "—"}</span>
            </div>
          ))}
        </div>
      )}

      {/* Expandable Secondary Fields */}
      {(secondaryFields.length > 0 || expandedContent) && (
        <>
          <Button
            variant="ghost"
            size="sm"
            className="w-full justify-center text-xs text-muted-foreground"
            onClick={(e) => {
              e.stopPropagation();
              setIsExpanded(!isExpanded);
            }}
          >
            {isExpanded ? (
              <>
                <ChevronUp className="h-3 w-3 mr-1" />
                Show less
              </>
            ) : (
              <>
                <ChevronDown className="h-3 w-3 mr-1" />
                Show more
              </>
            )}
          </Button>

          {isExpanded && (
            <div className="pt-2 border-t space-y-2 text-sm animate-in fade-in-0 slide-in-from-top-2">
              {secondaryFields.map((field, idx) => (
                <div
                  key={idx}
                  className={cn(
                    "flex items-start gap-2",
                    field.fullWidth && "flex-col gap-1"
                  )}
                >
                  <span className="text-muted-foreground flex-shrink-0">{field.label}:</span>
                  <span className="text-foreground break-words min-w-0">{field.value || "—"}</span>
                </div>
              ))}
              {expandedContent}
            </div>
          )}
        </>
      )}
    </div>
  );
}

interface ResponsiveListCardsProps {
  children: React.ReactNode;
  className?: string;
  /** Empty state content */
  emptyState?: React.ReactNode;
  /** Whether the list is empty */
  isEmpty?: boolean;
}

/**
 * ResponsiveListCards - Container for card-based list view
 * 
 * @example
 * <ResponsiveListCards>
 *   {items.map(item => (
 *     <ResponsiveListCard key={item.id} ... />
 *   ))}
 * </ResponsiveListCards>
 */
export function ResponsiveListCards({
  children,
  className,
  emptyState,
  isEmpty,
}: ResponsiveListCardsProps) {
  if (isEmpty) {
    return (
      <div className="py-8 text-center text-muted-foreground">
        {emptyState || "No items found"}
      </div>
    );
  }

  return (
    <div className={cn("space-y-3", className)}>
      {children}
    </div>
  );
}

// ============================================================
// RESPONSIVE TABLE/CARDS SWITCH
// ============================================================

interface ResponsiveTableViewProps<T> {
  /** Data items */
  items: T[];
  /** Render table view (for md+) */
  renderTable: () => React.ReactNode;
  /** Render card for each item (for mobile) */
  renderCard: (item: T, index: number) => React.ReactNode;
  /** Empty state content */
  emptyState?: React.ReactNode;
  /** Additional className for cards container */
  cardsClassName?: string;
  /** Key extractor for items */
  keyExtractor: (item: T) => string | number;
}

/**
 * ResponsiveTableView - Automatically switches between table and cards
 * 
 * @example
 * <ResponsiveTableView
 *   items={users}
 *   keyExtractor={(u) => u.id}
 *   renderTable={() => <UsersTable users={users} />}
 *   renderCard={(user) => <UserCard user={user} />}
 * />
 */
export function ResponsiveTableView<T>({
  items,
  renderTable,
  renderCard,
  emptyState,
  cardsClassName,
  keyExtractor,
}: ResponsiveTableViewProps<T>) {
  if (items.length === 0) {
    return (
      <div className="py-8 text-center text-muted-foreground rounded-lg border bg-card">
        {emptyState || "No items found"}
      </div>
    );
  }

  return (
    <>
      {/* Table view - visible on md+ */}
      <div className="hidden md:block">
        {renderTable()}
      </div>

      {/* Card view - visible on mobile */}
      <div className={cn("md:hidden", cardsClassName)}>
        <ResponsiveListCards>
          {items.map((item, index) => (
            <React.Fragment key={keyExtractor(item)}>
              {renderCard(item, index)}
            </React.Fragment>
          ))}
        </ResponsiveListCards>
      </div>
    </>
  );
}

// ============================================================
// COLUMN VISIBILITY HELPERS
// ============================================================

/**
 * CSS classes for column visibility at different breakpoints
 * Use these on TableHead and TableCell
 */
export const columnVisibility = {
  /** Always visible */
  always: "",
  /** Hidden on mobile, visible on sm+ */
  sm: "hidden sm:table-cell",
  /** Hidden below md, visible on md+ */
  md: "hidden md:table-cell",
  /** Hidden below lg, visible on lg+ */
  lg: "hidden lg:table-cell",
  /** Hidden below xl, visible on xl+ */
  xl: "hidden xl:table-cell",
} as const;

// ============================================================
// MOBILE ACTION MENU
// ============================================================

interface MobileActionMenuProps {
  actions: CardAction[];
  className?: string;
}

/**
 * MobileActionMenu - Kebab menu for row actions on mobile
 */
export function MobileActionMenu({ actions, className }: MobileActionMenuProps) {
  if (actions.length === 0) return null;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="sm" className={cn("h-8 w-8 p-0", className)}>
          <MoreHorizontal className="h-4 w-4" />
          <span className="sr-only">Open menu</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {actions.map((action, idx) => (
          <DropdownMenuItem
            key={idx}
            onClick={action.onClick}
            disabled={action.disabled}
            className={action.variant === "destructive" ? "text-destructive" : undefined}
          >
            {action.icon && <span className="mr-2">{action.icon}</span>}
            {action.label}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

// ============================================================
// EXPORTS
// ============================================================

export type {
  ResponsiveTableShellProps,
  ResponsiveListCardProps,
  ResponsiveListCardsProps,
  ResponsiveTableViewProps,
  CardField,
  CardAction,
};
