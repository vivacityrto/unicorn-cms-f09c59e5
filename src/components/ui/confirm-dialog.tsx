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
 * ConfirmDialog – Unicorn 2.0 Design System
 * 
 * Required for: Delete client, Archive user, Overwrite document, Reset integration.
 *
 * Structure: Clear title, short impact statement.
 * Confirm: Fuchsia (destructive) or variant-appropriate.
 * Cancel: Secondary/Ghost.
 * Typed confirmation for high-risk actions.
 */

type ConfirmVariant = "destructive" | "warning" | "info" | "success";

interface ConfirmDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  itemName?: string;
  onConfirm: () => void;
  onCancel?: () => void;
  confirmText?: string;
  cancelText?: string;
  isLoading?: boolean;
  variant?: ConfirmVariant;
  isBlocking?: boolean;
  /** For high-risk: require typed confirmation text */
  requireTypedConfirmation?: string;
}

const variantStyles: Record<ConfirmVariant, {
  icon: React.ElementType;
  iconClass: string;
  bgClass: string;
  buttonVariant?: 'default' | 'destructive' | 'warning';
}> = {
  destructive: {
    icon: AlertTriangle,
    iconClass: "text-destructive",
    bgClass: "bg-destructive/10",
    buttonVariant: "destructive",
  },
  warning: {
    icon: AlertCircle,
    iconClass: "text-brand-macaron-700",
    bgClass: "bg-brand-macaron-50",
    buttonVariant: "warning",
  },
  info: {
    icon: Info,
    iconClass: "text-brand-aqua-700",
    bgClass: "bg-brand-aqua-50",
  },
  success: {
    icon: CheckCircle2,
    iconClass: "text-primary",
    bgClass: "bg-primary/10",
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
  requireTypedConfirmation,
}: ConfirmDialogProps) {
  const [typedValue, setTypedValue] = React.useState('');
  const styles = variantStyles[variant];
  const IconComponent = styles.icon;

  const isConfirmDisabled = requireTypedConfirmation
    ? typedValue !== requireTypedConfirmation
    : false;

  const handleCancel = () => {
    setTypedValue('');
    onCancel?.();
    onOpenChange(false);
  };

  const handleConfirm = () => {
    setTypedValue('');
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

          {requireTypedConfirmation && (
            <div className="space-y-2">
              <p className="text-xs text-muted-foreground">
                Type <span className="font-mono font-semibold text-foreground">{requireTypedConfirmation}</span> to confirm:
              </p>
              <input
                type="text"
                value={typedValue}
                onChange={(e) => setTypedValue(e.target.value)}
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                placeholder={requireTypedConfirmation}
                autoFocus
              />
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
            variant={styles.buttonVariant || 'default'}
            onClick={handleConfirm}
            disabled={isLoading || isConfirmDisabled}
            isLoading={isLoading}
            className="w-full sm:w-auto"
          >
            {confirmText}
          </Button>
        </AppModalFooter>
      </AppModalContent>
    </AppModal>
  );
}

export type { ConfirmDialogProps, ConfirmVariant };
