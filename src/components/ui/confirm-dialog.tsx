import * as React from "react";
import { AlertTriangle, Info, AlertCircle, CheckCircle2 } from "lucide-react";
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
} from "@/components/ui/app-modal";

/**
 * ConfirmDialog - Standardized confirmation dialog
 * 
 * Uses AppModal for consistent sizing and accessibility.
 * Provides visual variants for different confirmation types.
 */

type ConfirmVariant = "destructive" | "warning" | "info" | "success";

interface ConfirmDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Dialog title */
  title: string;
  /** Description/message */
  description: string;
  /** Optional item name to highlight */
  itemName?: string;
  /** Confirmation callback */
  onConfirm: () => void;
  /** Cancel callback (optional) */
  onCancel?: () => void;
  /** Confirm button text */
  confirmText?: string;
  /** Cancel button text */
  cancelText?: string;
  /** Loading state */
  isLoading?: boolean;
  /** Visual variant */
  variant?: ConfirmVariant;
  /** Prevent closing during action */
  isBlocking?: boolean;
}

const variantStyles: Record<ConfirmVariant, {
  icon: React.ElementType;
  iconClass: string;
  bgClass: string;
  buttonClass?: string;
}> = {
  destructive: {
    icon: AlertTriangle,
    iconClass: "text-destructive",
    bgClass: "bg-destructive/10",
    buttonClass: "bg-destructive text-destructive-foreground hover:bg-destructive/90",
  },
  warning: {
    icon: AlertCircle,
    iconClass: "text-amber-600",
    bgClass: "bg-amber-100",
  },
  info: {
    icon: Info,
    iconClass: "text-blue-600",
    bgClass: "bg-blue-100",
  },
  success: {
    icon: CheckCircle2,
    iconClass: "text-green-600",
    bgClass: "bg-green-100",
  },
};

export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  itemName,
  onConfirm,
  onCancel,
  confirmText = "Confirm",
  cancelText = "Cancel",
  isLoading = false,
  variant = "destructive",
  isBlocking = false,
}: ConfirmDialogProps) {
  const styles = variantStyles[variant];
  const IconComponent = styles.icon;

  const handleCancel = () => {
    onCancel?.();
    onOpenChange(false);
  };

  const handleConfirm = () => {
    onConfirm();
  };

  return (
    <AppModal open={open} onOpenChange={onOpenChange} isBlocking={isBlocking || isLoading}>
      <AppModalContent size="sm">
        <AppModalHeader>
          <div className="flex items-center gap-4">
            <div className={cn(
              "flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-full",
              styles.bgClass
            )}>
              <IconComponent className={cn("h-6 w-6", styles.iconClass)} />
            </div>
            <div className="flex-1 min-w-0">
              <AppModalTitle>{title}</AppModalTitle>
            </div>
          </div>
        </AppModalHeader>

        <AppModalBody className="space-y-3">
          <AppModalDescription className="text-sm text-muted-foreground">
            {description}
          </AppModalDescription>
          
          {itemName && (
            <div className="rounded-md bg-muted px-3 py-2 font-medium text-foreground break-words">
              {itemName}
            </div>
          )}
        </AppModalBody>

        <AppModalFooter>
          <Button
            variant="outline"
            onClick={handleCancel}
            disabled={isLoading}
            className="w-full sm:w-auto"
          >
            {cancelText}
          </Button>
          <Button
            onClick={handleConfirm}
            disabled={isLoading}
            className={cn("w-full sm:w-auto", styles.buttonClass)}
          >
            {isLoading ? "Processing..." : confirmText}
          </Button>
        </AppModalFooter>
      </AppModalContent>
    </AppModal>
  );
}

export type { ConfirmDialogProps, ConfirmVariant };
