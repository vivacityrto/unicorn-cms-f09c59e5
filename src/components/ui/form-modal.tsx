import * as React from "react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  AppModal,
  AppModalContent,
  AppModalHeader,
  AppModalTitle,
  AppModalDescription,
  AppModalBody,
  AppModalFooter,
  type ModalSize,
} from "@/components/ui/app-modal";

/**
 * FormModal - Modal optimized for forms
 * 
 * Features:
 * - Form-friendly layout with proper spacing
 * - Submit/Cancel button handling
 * - Loading state management
 * - Prevents accidental close during submission
 * - Larger default size for form content
 */

interface FormModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Modal title */
  title: string;
  /** Optional description */
  description?: string;
  /** Form content */
  children: React.ReactNode;
  /** Form submit handler */
  onSubmit: (e: React.FormEvent) => void | Promise<void>;
  /** Optional cancel handler */
  onCancel?: () => void;
  /** Submit button text */
  submitText?: string;
  /** Cancel button text */
  cancelText?: string;
  /** Loading/submitting state */
  isSubmitting?: boolean;
  /** Disable submit button */
  submitDisabled?: boolean;
  /** Size variant */
  size?: ModalSize;
  /** Additional footer content (before buttons) */
  footerLeft?: React.ReactNode;
  /** Additional className for body */
  bodyClassName?: string;
}

export function FormModal({
  open,
  onOpenChange,
  title,
  description,
  children,
  onSubmit,
  onCancel,
  submitText = "Save",
  cancelText = "Cancel",
  isSubmitting = false,
  submitDisabled = false,
  size = "lg",
  footerLeft,
  bodyClassName,
}: FormModalProps) {
  const formRef = React.useRef<HTMLFormElement>(null);

  const handleCancel = () => {
    onCancel?.();
    onOpenChange(false);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await onSubmit(e);
  };

  // Handle keyboard submission
  const handleKeyDown = (e: React.KeyboardEvent) => {
    // Only submit on Ctrl/Cmd + Enter
    if (e.key === "Enter" && (e.ctrlKey || e.metaKey) && !isSubmitting) {
      e.preventDefault();
      formRef.current?.requestSubmit();
    }
  };

  return (
    <AppModal open={open} onOpenChange={onOpenChange} isBlocking={isSubmitting}>
      <AppModalContent size={size}>
        <form ref={formRef} onSubmit={handleSubmit} onKeyDown={handleKeyDown}>
          <AppModalHeader>
            <AppModalTitle>{title}</AppModalTitle>
            {description && (
              <AppModalDescription>{description}</AppModalDescription>
            )}
          </AppModalHeader>

          <AppModalBody className={cn("space-y-4", bodyClassName)}>
            {children}
          </AppModalBody>

          <AppModalFooter className={footerLeft ? "justify-between" : undefined}>
            {footerLeft && (
              <div className="flex-1 hidden sm:block">
                {footerLeft}
              </div>
            )}
            <div className="flex flex-col-reverse gap-2 sm:flex-row w-full sm:w-auto">
              <Button
                type="button"
                variant="outline"
                onClick={handleCancel}
                disabled={isSubmitting}
                className="w-full sm:w-auto"
              >
                {cancelText}
              </Button>
              <Button
                type="submit"
                disabled={isSubmitting || submitDisabled}
                className="w-full sm:w-auto"
              >
                {isSubmitting ? "Saving..." : submitText}
              </Button>
            </div>
          </AppModalFooter>
        </form>
      </AppModalContent>
    </AppModal>
  );
}

/**
 * FormModalSection - Group related form fields
 */
interface FormModalSectionProps {
  title?: string;
  description?: string;
  children: React.ReactNode;
  className?: string;
}

export function FormModalSection({
  title,
  description,
  children,
  className,
}: FormModalSectionProps) {
  return (
    <div className={cn("space-y-3", className)}>
      {(title || description) && (
        <div className="space-y-1">
          {title && (
            <h4 className="text-sm font-medium leading-none">{title}</h4>
          )}
          {description && (
            <p className="text-sm text-muted-foreground">{description}</p>
          )}
        </div>
      )}
      <div className="space-y-3">
        {children}
      </div>
    </div>
  );
}

/**
 * FormModalRow - Horizontal layout for form fields
 */
interface FormModalRowProps {
  children: React.ReactNode;
  className?: string;
}

export function FormModalRow({ children, className }: FormModalRowProps) {
  return (
    <div className={cn(
      "grid gap-3",
      "grid-cols-1 sm:grid-cols-2",
      className
    )}>
      {children}
    </div>
  );
}

export type { FormModalProps };
