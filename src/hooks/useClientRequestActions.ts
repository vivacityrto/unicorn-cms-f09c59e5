import { useState, useCallback } from "react";
import type { DocumentRequestPrefill } from "@/components/client/DocumentRequestModal";

const DEFAULT_PREFILL: DocumentRequestPrefill = {
  title: "Document request",
  details: "I need the following document(s): ",
  category: "Documents",
};

export function useClientRequestActions() {
  const [requestModalOpen, setRequestModalOpen] = useState(false);
  const [prefill, setPrefill] = useState<DocumentRequestPrefill | undefined>();

  const openDocumentRequest = useCallback(
    (overrides?: Partial<DocumentRequestPrefill>) => {
      setPrefill({ ...DEFAULT_PREFILL, ...overrides });
      setRequestModalOpen(true);
    },
    []
  );

  return {
    requestModalOpen,
    setRequestModalOpen,
    prefill,
    openDocumentRequest,
  };
}
