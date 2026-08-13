import { Fragment, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { DashboardLayout } from "@/components/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Search, Pencil, Trash2, ChevronDown, ChevronRight, ExternalLink, Check, X, Filter,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  useAcademyTagStats,
  useRenameAcademyTag,
  normalizeTagValue,
  type TagStat,
} from "@/hooks/academy/useAcademyTagManagement";

export default function AcademyTagManagementPage() {
  const [search, setSearch] = useState("");
  const [singleUseOnly, setSingleUseOnly] = useState(false);
  const [expandedTag, setExpandedTag] = useState<string | null>(null);
  const [editingTag, setEditingTag] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<TagStat | null>(null);

  const { data: tags = [], isLoading } = useAcademyTagStats();
  const renameTag = useRenameAcademyTag();

  const singleUseCount = useMemo(() => tags.filter((t) => t.count === 1).length, [tags]);
  const totalInstances = useMemo(() => tags.reduce((sum, t) => sum + t.count, 0), [tags]);

  const filtered = useMemo(() => {
    return tags.filter((t) => {
      if (singleUseOnly && t.count !== 1) return false;
      if (search.trim() && !t.tag.toLowerCase().includes(search.trim().toLowerCase())) return false;
      return true;
    });
  }, [tags, search, singleUseOnly]);

  const startEditing = (tag: string) => {
    setEditingTag(tag);
    setEditValue(tag);
  };

  const cancelEditing = () => {
    setEditingTag(null);
    setEditValue("");
  };

  const confirmEdit = (oldTag: string) => {
    const newTag = normalizeTagValue(editValue);
    if (!newTag || newTag === oldTag) {
      cancelEditing();
      return;
    }
    renameTag.mutate(
      { oldTag, newTag },
      { onSuccess: () => cancelEditing() },
    );
  };

  // Matches the same normalization the mutation itself applies, so this
  // preview never claims a merge that the actual save wouldn't perform.
  const willMergeInto = editingTag
    ? tags.find((t) => t.tag === normalizeTagValue(editValue) && t.tag !== editingTag)
    : undefined;

  // Only one rename/delete may be in flight at a time — prevents two
  // overlapping operations from touching the same course and having
  // whichever write lands last silently win.
  const anyMutationPending = renameTag.isPending;

  return (
    <DashboardLayout>
      <div className="p-6 space-y-6 max-w-[1200px] mx-auto">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Tag Management</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Rename, merge, or remove the sub-category tags courses carry across all pathways.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
          <span>{tags.length} distinct tags</span>
          <span className="text-border">·</span>
          <span>{totalInstances} tag instances</span>
          <span className="text-border">·</span>
          <span>{singleUseCount} used on only 1 course</span>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <div className="relative flex-1 min-w-[200px] max-w-sm">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search tags…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-8"
            />
          </div>
          <button
            type="button"
            onClick={() => setSingleUseOnly((v) => !v)}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-sm transition-colors",
              singleUseOnly
                ? "border-primary bg-primary/10 text-foreground"
                : "border-border bg-background text-muted-foreground hover:bg-muted/50",
            )}
          >
            Single-use only
            <span
              className={cn(
                "tabular-nums text-xs rounded-full px-1.5 py-0.5",
                singleUseOnly ? "bg-primary/15 text-foreground" : "bg-muted text-muted-foreground",
              )}
            >
              {singleUseCount}
            </span>
          </button>
          {(search.trim() || singleUseOnly) && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setSearch("");
                setSingleUseOnly(false);
              }}
            >
              <X className="h-4 w-4 mr-1" /> Clear
            </Button>
          )}
        </div>

        <div className="rounded-md border bg-card">
          {isLoading ? (
            <div className="p-4 space-y-3">
              {Array.from({ length: 8 }).map((_, i) => (
                <Skeleton key={i} className="h-10 w-full" />
              ))}
            </div>
          ) : filtered.length === 0 ? (
            <div className="p-10 text-center text-sm text-muted-foreground">
              <Filter className="h-8 w-8 mx-auto mb-2 opacity-40" />
              No tags match the current filters.
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="min-w-[240px]">Tag</TableHead>
                  <TableHead className="w-[110px] text-right">Courses</TableHead>
                  <TableHead className="w-[220px]">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((t) => {
                  const isEditing = editingTag === t.tag;
                  const isExpanded = expandedTag === t.tag;
                  const isSaving = renameTag.isPending && editingTag === t.tag;

                  return (
                    <Fragment key={t.tag}>
                      <TableRow>
                        <TableCell>
                          {isEditing ? (
                            <div className="space-y-1.5 max-w-sm">
                              <div className="flex items-center gap-1.5">
                                <Input
                                  autoFocus
                                  value={editValue}
                                  onChange={(e) => setEditValue(e.target.value)}
                                  onKeyDown={(e) => {
                                    if (e.key === "Enter") confirmEdit(t.tag);
                                    if (e.key === "Escape") cancelEditing();
                                  }}
                                  disabled={isSaving}
                                  className="h-9"
                                />
                                <Button
                                  size="icon"
                                  variant="ghost"
                                  className="h-9 w-9 shrink-0"
                                  disabled={isSaving}
                                  onClick={() => confirmEdit(t.tag)}
                                  aria-label="Confirm rename"
                                >
                                  <Check className="h-4 w-4" />
                                </Button>
                                <Button
                                  size="icon"
                                  variant="ghost"
                                  className="h-9 w-9 shrink-0"
                                  disabled={isSaving}
                                  onClick={cancelEditing}
                                  aria-label="Cancel"
                                >
                                  <X className="h-4 w-4" />
                                </Button>
                              </div>
                              {willMergeInto && (
                                <p className="text-xs text-amber-700 dark:text-amber-500">
                                  Merges into the existing “{willMergeInto.tag}” tag ({willMergeInto.count} courses)
                                </p>
                              )}
                            </div>
                          ) : (
                            <button
                              type="button"
                              onClick={() => setExpandedTag(isExpanded ? null : t.tag)}
                              className="inline-flex items-center gap-1.5 font-medium text-foreground hover:underline"
                            >
                              {isExpanded ? (
                                <ChevronDown className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                              ) : (
                                <ChevronRight className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                              )}
                              {t.tag}
                            </button>
                          )}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          <Badge variant="secondary">{t.count}</Badge>
                        </TableCell>
                        <TableCell>
                          {!isEditing && (
                            <div className="flex items-center gap-1.5">
                              <Button
                                variant="outline"
                                size="sm"
                                disabled={anyMutationPending}
                                onClick={() => startEditing(t.tag)}
                              >
                                <Pencil className="h-3.5 w-3.5 mr-1" />
                                Rename / merge
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-9 w-9 text-destructive hover:text-destructive"
                                disabled={anyMutationPending}
                                onClick={() => setDeleteTarget(t)}
                                aria-label={`Delete tag ${t.tag}`}
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </div>
                          )}
                        </TableCell>
                      </TableRow>
                      {isExpanded && (
                        <TableRow className="bg-muted/40 hover:bg-muted/40">
                          <TableCell colSpan={3} className="p-4">
                            <div className="flex flex-wrap gap-2">
                              {t.courses.map((c) => (
                                <Link
                                  key={c.id}
                                  to={`/superadmin/academy/builder/${c.id}`}
                                  className="inline-flex items-center gap-1 text-xs bg-background border rounded-md px-2 py-1 hover:bg-muted"
                                >
                                  {c.title}
                                  {c.status && c.status !== "published" && (
                                    <span className="text-muted-foreground">({c.status})</span>
                                  )}
                                  <ExternalLink className="h-3 w-3 text-muted-foreground" />
                                </Link>
                              ))}
                            </div>
                          </TableCell>
                        </TableRow>
                      )}
                    </Fragment>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </div>

        {!isLoading && filtered.length > 0 && (
          <p className="text-xs text-muted-foreground">
            Showing {filtered.length} of {tags.length} tags
          </p>
        )}
      </div>

      <AlertDialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove “{deleteTarget?.tag}” from every course?</AlertDialogTitle>
            <AlertDialogDescription>
              This removes the tag from {deleteTarget?.count} course{deleteTarget?.count === 1 ? "" : "s"}.
              The courses themselves aren't affected — only this tag is dropped from each one. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={renameTag.isPending}
              onClick={() => {
                if (!deleteTarget) return;
                renameTag.mutate(
                  { oldTag: deleteTarget.tag, newTag: null },
                  { onSuccess: () => setDeleteTarget(null) },
                );
              }}
            >
              Remove tag
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </DashboardLayout>
  );
}
