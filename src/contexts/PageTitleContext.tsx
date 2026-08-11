import { createContext, useContext, useEffect, useState, ReactNode } from "react";

interface PageTitleContextValue {
  title: string | null;
  setTitle: (title: string | null) => void;
}

const PageTitleContext = createContext<PageTitleContextValue | undefined>(undefined);

export function PageTitleProvider({ children }: { children: ReactNode }) {
  const [title, setTitle] = useState<string | null>(null);
  return (
    <PageTitleContext.Provider value={{ title, setTitle }}>
      {children}
    </PageTitleContext.Provider>
  );
}

function usePageTitleContext() {
  const ctx = useContext(PageTitleContext);
  if (!ctx) {
    throw new Error("usePageTitleContext must be used within a PageTitleProvider");
  }
  return ctx;
}

/**
 * Lets a page report its real title (an audit name, a client name, etc.) up
 * to TopBar, which otherwise only knows the static title for the page's exact
 * route — dynamic-segment routes like /audits/:id or /tenant/:id have no
 * static entry, so without this the header falls back to a generic label.
 * Clears on unmount so the next page never briefly inherits a stale title.
 */
export function usePageTitle(title: string | null | undefined) {
  const { setTitle } = usePageTitleContext();
  useEffect(() => {
    setTitle(title ?? null);
    return () => setTitle(null);
  }, [title, setTitle]);
}

export function usePageTitleValue() {
  return usePageTitleContext().title;
}
