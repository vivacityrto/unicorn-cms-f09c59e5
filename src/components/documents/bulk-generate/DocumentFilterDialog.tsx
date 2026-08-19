import { useEffect, useMemo, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Search, FileText } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useDocumentCategories } from "@/hooks/useDocumentCategories";
import type { TemplatedDocumentRow } from "./useTemplatedDocuments";

interface DocumentFilterDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  documents: TemplatedDocumentRow[];
  selected: string[];
  onApply: (ids: string[]) => void;
}

// Every search term must appear somewhere in the title — lets "assessment
// policy" match "Q1.D2-Assessment Policy" without a fuzzy-match lib.
function matchesQuery(title: string, query: string): boolean {
  const terms = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  if (terms.length === 0) return true;
  const haystack = title.toLowerCase();
  return terms.every((term) => haystack.includes(term));
}

export function DocumentFilterDialog({
  open,
  onOpenChange,
  documents,
  selected,
  onApply,
}: DocumentFilterDialogProps) {
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [frameworkFilter, setFrameworkFilter] = useState("all");
  const [publishStatusFilter, setPublishStatusFilter] = useState("all");
  const [draft, setDraft] = useState<Set<string>>(new Set(selected));

  const { categories } = useDocumentCategories();
  const { data: frameworks } = useQuery({
    queryKey: ["dd_governance_framework"],
    queryFn: async () => {
      const { data } = await supabase
        .from("dd_governance_framework")
        .select("value, label")
        .eq("is_active", true)
        .order("sort_order");
      return data || [];
    },
    staleTime: 5 * 60_000,
  });

  // Re-seed everything from the applied selection each time the dialog
  // opens, so Cancel never leaks an in-progress edit back into the page.
  useEffect(() => {
    if (open) {
      setDraft(new Set(selected));
      setSearch("");
      setCategoryFilter("all");
      setFrameworkFilter("all");
      setPublishStatusFilter("all");
    }
  }, [open, selected]);

  const sortedDocuments = useMemo(
    () => [...documents].sort((a, b) => a.title.localeCompare(b.title)),
    [documents],
  );

  const filtered = useMemo(
    () =>
      sortedDocuments.filter((d) => {
        if (!matchesQuery(d.title, search)) return false;
        if (categoryFilter !== "all" && !d.categories.includes(categoryFilter)) return false;
        if (frameworkFilter !== "all" && d.frameworkType !== frameworkFilter) return false;
        if (publishStatusFilter === "published" && !d.isPublished) return false;
        if (publishStatusFilter === "unpublished" && d.isPublished) return false;
        return true;
      }),
    [sortedDocuments, search, categoryFilter, frameworkFilter, publishStatusFilter],
  );

  const hasNarrowingFilters =
    search !== "" ||
    categoryFilter !== "all" ||
    frameworkFilter !== "all" ||
    publishStatusFilter !== "all";

  const toggle = (id: string) => {
    setDraft((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const selectAllFiltered = () => {
    setDraft((prev) => {
      const next = new Set(prev);
      filtered.forEach((d) => next.add(d.id.toString()));
      return next;
    });
  };

  const clearAll = () => setDraft(new Set());

  const handleApply = () => {
    onApply(Array.from(draft));
    onOpenChange(false);
  };

  const categoryLabel = (value: string) =>
    categories.find((c) => c.value === value)?.label ?? value;
  const frameworkLabel = (value: string) =>
    frameworks?.find((f) => f.value === value)?.label ?? value;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="md" className="flex flex-col gap-4">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5" />
            Filter Documents
          </DialogTitle>
          <DialogDescription>
            Narrow the list by category, framework, or publish status, search by
            title, then select one or more documents. Leave empty to include
            every templated document in the selected stages.
          </DialogDescription>
        </DialogHeader>

        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            autoFocus
            placeholder="Search documents by title…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-10"
          />
        </div>

        <div className="flex gap-3">
          <Select value={categoryFilter} onValueChange={setCategoryFilter}>
            <SelectTrigger className="flex-1 min-w-0">
              <SelectValue placeholder="Category" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Categories</SelectItem>
              {categories.map((c) => (
                <SelectItem key={c.value} value={c.value}>
                  {c.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={frameworkFilter} onValueChange={setFrameworkFilter}>
            <SelectTrigger className="flex-1 min-w-0">
              <SelectValue placeholder="Framework" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Frameworks</SelectItem>
              {frameworks?.map((f) => (
                <SelectItem key={f.value} value={f.value}>
                  {f.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={publishStatusFilter} onValueChange={setPublishStatusFilter}>
            <SelectTrigger className="flex-1 min-w-0">
              <SelectValue placeholder="Publish Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Publish Status</SelectItem>
              <SelectItem value="published">Published</SelectItem>
              <SelectItem value="unpublished">Unpublished</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="flex items-center justify-between text-sm text-muted-foreground">
          <span>{draft.size} selected</span>
          <div className="flex gap-3">
            <button
              type="button"
              onClick={selectAllFiltered}
              disabled={filtered.length === 0}
              className="text-primary hover:underline disabled:opacity-50 disabled:no-underline disabled:cursor-not-allowed"
            >
              Select all{hasNarrowingFilters ? " filtered" : ""}
            </button>
            <button
              type="button"
              onClick={clearAll}
              disabled={draft.size === 0}
              className="text-primary hover:underline disabled:opacity-50 disabled:no-underline disabled:cursor-not-allowed"
            >
              Clear all
            </button>
          </div>
        </div>

        {(categoryFilter !== "all" || frameworkFilter !== "all" || publishStatusFilter !== "all") && (
          <div className="flex items-center flex-wrap gap-2 -mt-2 text-xs">
            {categoryFilter !== "all" && (
              <span className="rounded-full bg-muted px-2 py-0.5 text-muted-foreground">
                Category: {categoryLabel(categoryFilter)}
              </span>
            )}
            {frameworkFilter !== "all" && (
              <span className="rounded-full bg-muted px-2 py-0.5 text-muted-foreground">
                Framework: {frameworkLabel(frameworkFilter)}
              </span>
            )}
            {publishStatusFilter !== "all" && (
              <span className="rounded-full bg-muted px-2 py-0.5 text-muted-foreground">
                {publishStatusFilter === "published" ? "Published" : "Unpublished"}
              </span>
            )}
            <span className="text-muted-foreground">
              — {filtered.length} document{filtered.length === 1 ? "" : "s"} match
            </span>
          </div>
        )}

        <ScrollArea className="h-[320px] rounded-md border">
          <div className="p-1">
            {filtered.length === 0 ? (
              <p className="py-8 text-center text-sm text-muted-foreground px-4">
                No documents match the current search and filters.
              </p>
            ) : (
              filtered.map((doc) => {
                const id = doc.id.toString();
                const checked = draft.has(id);
                return (
                  <label
                    key={id}
                    htmlFor={`document-filter-${id}`}
                    className="flex items-center gap-3 rounded-md px-3 py-2 cursor-pointer hover:bg-muted/60 min-w-0"
                  >
                    <Checkbox
                      id={`document-filter-${id}`}
                      checked={checked}
                      onCheckedChange={() => toggle(id)}
                      className="shrink-0"
                    />
                    <span className="truncate min-w-0 flex-1" title={doc.title}>
                      {doc.title}
                    </span>
                  </label>
                );
              })
            )}
          </div>
        </ScrollArea>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleApply}>
            Apply{draft.size > 0 ? ` (${draft.size})` : ""}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
