import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { Loader2, Check } from "lucide-react";

import { cn } from "@/lib/utils";

/**
 * Button System – Unicorn 2.0 Design System
 *
 * Heights: 32px (sm) | 40px (default) | 48px (lg)
 * Primary:     Purple 600, white text, hover Purple 700
 * Secondary:   Purple 600 border + text, hover Light Purple 200
 * Destructive: Fuchsia 600
 * Warning:     Macaron 600, Acai text
 * Ghost/Link:  Transparent
 *
 * Micro-interactions:
 * - Active: scale(0.98)
 * - Loading: inline spinner
 * - Success: check icon flash
 */
const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium ring-offset-background transition-all duration-200 ease-smooth focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 active:scale-[0.98] [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground hover:bg-primary/85",
        destructive: "bg-destructive text-destructive-foreground hover:bg-destructive/85",
        outline: "border border-primary text-primary bg-background hover:bg-brand-light-purple-200",
        secondary: "border border-primary text-primary bg-background hover:bg-brand-light-purple-200",
        ghost: "hover:bg-muted hover:text-foreground",
        link: "text-primary underline-offset-4 hover:underline",
        warning: "bg-brand-macaron text-secondary hover:bg-brand-macaron-600",
      },
      size: {
        default: "h-10 px-4 py-2",      /* 40px */
        sm: "h-8 rounded-md px-3",       /* 32px */
        lg: "h-12 rounded-md px-8",      /* 48px */
        icon: "h-10 w-10",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
  /** Show inline loading spinner and disable */
  isLoading?: boolean;
  /** Briefly show success check after action completes */
  showSuccess?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, isLoading, showSuccess, children, disabled, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    const isDisabled = disabled || isLoading;

    return (
      <Comp
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        disabled={isDisabled}
        aria-busy={isLoading}
        {...props}
      >
        {isLoading ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin" />
            <span>{children}</span>
          </>
        ) : showSuccess ? (
          <>
            <Check className="h-4 w-4" />
            <span>{children}</span>
          </>
        ) : (
          children
        )}
      </Comp>
    );
  },
);
Button.displayName = "Button";

export { Button, buttonVariants };
