// Unified Modal and Drawer System
// =================================
// Use these components for all pop-ups, dialogs, and side panels

// Core modal components
export {
  AppModal,
  AppModalContent,
  AppModalHeader,
  AppModalTitle,
  AppModalDescription,
  AppModalBody,
  AppModalFooter,
} from "./app-modal";
export type { AppModalProps, AppModalContentProps, ModalSize } from "./app-modal";

// Core drawer components
export {
  AppDrawer,
  AppDrawerContent,
  AppDrawerHeader,
  AppDrawerTitle,
  AppDrawerDescription,
  AppDrawerBody,
  AppDrawerFooter,
} from "./app-drawer";
export type { AppDrawerProps, AppDrawerContentProps, DrawerWidth, DrawerSide } from "./app-drawer";

// Specialized variants
export { ConfirmDialog } from "./confirm-dialog";
export type { ConfirmDialogProps, ConfirmVariant } from "./confirm-dialog";

export { FormModal, FormModalSection, FormModalRow } from "./form-modal";
export type { FormModalProps } from "./form-modal";
