import * as React from "react";
import { cn } from "@/lib/utils";
import { Label } from "@/components/ui/label";
import { AlertCircle } from "lucide-react";

/**
 * Standardized Form Primitives
 * ============================
 * Use these components for all forms to ensure consistent
 * layout, spacing, and validation styling across breakpoints.
 * 
 * Layout Rules:
 * - One column on mobile (< md)
 * - Two columns at md+ when safe
 * - Never force side-by-side at 320px
 * 
 * Spacing Rules:
 * - Between fields: space-y-4 md:space-y-5
 * - Between label and input: gap-1.5
 * - Between sections: mt-6 md:mt-8
 */

// ============================================================
// FORM SECTION
// ============================================================

interface FormSectionProps {
  /** Section title */
  title?: string;
  /** Section description */
  description?: string;
  /** Section content */
  children: React.ReactNode;
  /** Additional className */
  className?: string;
  /** Whether this is the first section (no top margin) */
  first?: boolean;
}

/**
 * FormSection - Groups related form fields with optional title
 * 
 * @example
 * <FormSection title="Personal Information" description="Enter your details">
 *   <FieldRow>...</FieldRow>
 * </FormSection>
 */
export function FormSection({
  title,
  description,
  children,
  className,
  first = false,
}: FormSectionProps) {
  return (
    <div
      className={cn(
        "space-y-4 md:space-y-5",
        !first && "mt-6 md:mt-8 pt-6 md:pt-8 border-t",
        className
      )}
    >
      {(title || description) && (
        <div className="space-y-1">
          {title && (
            <h3 className="text-base font-semibold leading-none tracking-tight">
              {title}
            </h3>
          )}
          {description && (
            <p className="text-sm text-muted-foreground leading-relaxed">
              {description}
            </p>
          )}
        </div>
      )}
      <div className="space-y-4 md:space-y-5">{children}</div>
    </div>
  );
}

// ============================================================
// FIELD ROW
// ============================================================

interface FieldRowProps {
  /** Row content (typically 1-2 FieldGroups) */
  children: React.ReactNode;
  /** Force single column layout */
  singleColumn?: boolean;
  /** Additional className */
  className?: string;
}

/**
 * FieldRow - Horizontal layout for 1-2 fields
 * Single column on mobile, two columns at md+
 * 
 * @example
 * <FieldRow>
 *   <FieldGroup label="First Name"><Input /></FieldGroup>
 *   <FieldGroup label="Last Name"><Input /></FieldGroup>
 * </FieldRow>
 */
export function FieldRow({
  children,
  singleColumn = false,
  className,
}: FieldRowProps) {
  return (
    <div
      className={cn(
        "grid gap-4 md:gap-6",
        singleColumn ? "grid-cols-1" : "grid-cols-1 md:grid-cols-2",
        className
      )}
    >
      {children}
    </div>
  );
}

// ============================================================
// FIELD GROUP
// ============================================================

interface FieldGroupProps {
  /** Field label text */
  label?: string;
  /** Label for attribute (should match input id) */
  htmlFor?: string;
  /** Whether field is required */
  required?: boolean;
  /** Helper text shown below input */
  hint?: React.ReactNode;
  /** Error message */
  error?: string;
  /** The form input(s) */
  children: React.ReactNode;
  /** Additional className for the group container */
  className?: string;
  /** Whether to show error styling on the input wrapper */
  hasError?: boolean;
}

/**
 * FieldGroup - Complete field with label, input, hint, and error
 * 
 * @example
 * <FieldGroup 
 *   label="Email Address" 
 *   required 
 *   hint="We'll use this for notifications"
 *   error={errors.email?.message}
 * >
 *   <Input id="email" {...register("email")} />
 * </FieldGroup>
 */
export function FieldGroup({
  label,
  htmlFor,
  required = false,
  hint,
  error,
  children,
  className,
  hasError,
}: FieldGroupProps) {
  const showError = error || hasError;

  return (
    <div className={cn("space-y-1.5", className)}>
      {label && (
        <FieldLabel htmlFor={htmlFor} required={required}>
          {label}
        </FieldLabel>
      )}
      <div className={cn(showError && "[&>*]:border-destructive")}>{children}</div>
      {hint && !error && <FieldHint>{hint}</FieldHint>}
      {error && <FieldError>{error}</FieldError>}
    </div>
  );
}

// ============================================================
// FIELD LABEL
// ============================================================

interface FieldLabelProps extends React.LabelHTMLAttributes<HTMLLabelElement> {
  /** Whether field is required */
  required?: boolean;
  /** Label content */
  children: React.ReactNode;
}

/**
 * FieldLabel - Accessible label with required indicator
 * 
 * @example
 * <FieldLabel htmlFor="name" required>Full Name</FieldLabel>
 */
export const FieldLabel = React.forwardRef<HTMLLabelElement, FieldLabelProps>(
  ({ className, required, children, ...props }, ref) => {
    return (
      <Label
        ref={ref}
        className={cn(
          "text-sm font-medium leading-relaxed",
          // Labels wrap, never clip
          "whitespace-normal break-words",
          className
        )}
        {...props}
      >
        {children}
        {required && (
          <span className="text-destructive ml-1" aria-hidden="true">
            *
          </span>
        )}
      </Label>
    );
  }
);
FieldLabel.displayName = "FieldLabel";

// ============================================================
// FIELD HINT
// ============================================================

interface FieldHintProps {
  /** Hint content */
  children: React.ReactNode;
  /** Additional className */
  className?: string;
}

/**
 * FieldHint - Helper text below input
 * 
 * @example
 * <FieldHint>Enter your email to receive notifications</FieldHint>
 */
export function FieldHint({ children, className }: FieldHintProps) {
  return (
    <p
      className={cn(
        "text-sm text-muted-foreground leading-5",
        // Hints wrap and remain readable
        "whitespace-normal break-words",
        className
      )}
    >
      {children}
    </p>
  );
}

// ============================================================
// FIELD ERROR
// ============================================================

interface FieldErrorProps {
  /** Error message */
  children: React.ReactNode;
  /** Additional className */
  className?: string;
}

/**
 * FieldError - Validation error message
 * 
 * @example
 * <FieldError>Email is required</FieldError>
 */
export function FieldError({ children, className }: FieldErrorProps) {
  if (!children) return null;

  return (
    <p
      className={cn(
        "text-sm text-destructive leading-5 flex items-start gap-1.5",
        // Errors wrap and do not shift layout
        "whitespace-normal break-words",
        className
      )}
      role="alert"
    >
      <AlertCircle className="h-4 w-4 flex-shrink-0 mt-0.5" aria-hidden="true" />
      <span>{children}</span>
    </p>
  );
}

// ============================================================
// FORM GRID
// ============================================================

interface FormGridProps {
  /** Grid content */
  children: React.ReactNode;
  /** Number of columns at different breakpoints */
  columns?: 1 | 2 | 3;
  /** Additional className */
  className?: string;
}

/**
 * FormGrid - Responsive grid for multiple fields
 * 
 * @example
 * <FormGrid columns={3}>
 *   <FieldGroup label="Field 1"><Input /></FieldGroup>
 *   <FieldGroup label="Field 2"><Input /></FieldGroup>
 *   <FieldGroup label="Field 3"><Input /></FieldGroup>
 * </FormGrid>
 */
export function FormGrid({ children, columns = 2, className }: FormGridProps) {
  const columnClasses = {
    1: "grid-cols-1",
    2: "grid-cols-1 md:grid-cols-2",
    3: "grid-cols-1 md:grid-cols-2 lg:grid-cols-3",
  };

  return (
    <div className={cn("grid gap-4 md:gap-6", columnClasses[columns], className)}>
      {children}
    </div>
  );
}

// ============================================================
// FORM ACTIONS
// ============================================================

interface FormActionsProps {
  /** Action buttons */
  children: React.ReactNode;
  /** Alignment */
  align?: "left" | "right" | "between" | "center";
  /** Additional className */
  className?: string;
  /** Whether to stack on mobile */
  stackOnMobile?: boolean;
}

/**
 * FormActions - Container for submit/cancel buttons
 * 
 * @example
 * <FormActions align="right">
 *   <Button variant="outline">Cancel</Button>
 *   <Button type="submit">Save</Button>
 * </FormActions>
 */
export function FormActions({
  children,
  align = "right",
  className,
  stackOnMobile = true,
}: FormActionsProps) {
  const alignClasses = {
    left: "justify-start",
    right: "justify-end",
    between: "justify-between",
    center: "justify-center",
  };

  return (
    <div
      className={cn(
        "flex gap-3 pt-4 mt-6 border-t",
        stackOnMobile ? "flex-col-reverse sm:flex-row" : "flex-row",
        alignClasses[align],
        className
      )}
    >
      {children}
    </div>
  );
}

// ============================================================
// FORM DIVIDER
// ============================================================

interface FormDividerProps {
  /** Optional label for the divider */
  label?: string;
  /** Additional className */
  className?: string;
}

/**
 * FormDivider - Visual separator between form sections
 * 
 * @example
 * <FormDivider label="Optional Information" />
 */
export function FormDivider({ label, className }: FormDividerProps) {
  if (label) {
    return (
      <div className={cn("relative my-6", className)}>
        <div className="absolute inset-0 flex items-center">
          <span className="w-full border-t" />
        </div>
        <div className="relative flex justify-center text-xs uppercase">
          <span className="bg-background px-2 text-muted-foreground">{label}</span>
        </div>
      </div>
    );
  }

  return <div className={cn("border-t my-6", className)} />;
}

// ============================================================
// EXPORTS
// ============================================================

export type {
  FormSectionProps,
  FieldRowProps,
  FieldGroupProps,
  FieldLabelProps,
  FieldHintProps,
  FieldErrorProps,
  FormGridProps,
  FormActionsProps,
  FormDividerProps,
};
