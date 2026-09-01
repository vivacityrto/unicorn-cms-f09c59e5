import { useMemo, useState } from "react";
import { Check, Library, Loader2, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Input } from "@/components/ui/input";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import type { AcademyThumbnailLibraryItem } from "@/hooks/academy/useAcademyBuilderPickers";

interface Props {
  category: "course" | "banner";
  items: AcademyThumbnailLibraryItem[];
  value: string | null;
  onSelect: (url: string) => void;
  onDelete?: (item: AcademyThumbnailLibraryItem) => Promise<void>;
}

export default function ThumbnailLibraryPicker({ category, items, value, onSelect, onDelete }: Props) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<AcademyThumbnailLibraryItem | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const categoryItems = useMemo(
    () => items.filter((item) => item.category === category && item.sourceCourseTitle.toLowerCase().includes(search.toLowerCase())),
    [category, items, search],
  );
  const label = category === "course" ? "course card" : "banner";

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button type="button" size="sm" variant="outline" className="gap-1">
          <Library className="h-3.5 w-3.5" /> Choose from library
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[360px] p-3" align="start">
        <div className="space-y-3">
          <div>
            <p className="text-sm font-medium">{category === "course" ? "Course card" : "Banner"} image library</p>
            <p className="text-xs text-muted-foreground">Reuse an uploaded {label} image without creating another Storage file.</p>
          </div>
          <Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search source course…" />
          <div className="grid max-h-64 grid-cols-2 gap-2 overflow-y-auto">
            {categoryItems.map((item) => (
              <button
                key={`${item.category}:${item.url}`}
                type="button"
                className="group relative overflow-hidden rounded-md border text-left hover:ring-2 hover:ring-primary"
                onClick={() => { onSelect(item.url); setOpen(false); }}
                title={`Uploaded on ${item.sourceCourseTitle}`}
              >
                <img src={item.url} alt="" className="aspect-video w-full object-cover" />
                <span className="block truncate px-2 py-1.5 text-[11px] text-muted-foreground">{item.sourceCourseTitle}</span>
                {value === item.url && <Check className="absolute right-1 top-1 h-4 w-4 rounded-full bg-background p-0.5 text-primary" />}
                {onDelete && (
                  <span
                    role="button"
                    tabIndex={0}
                    className="absolute bottom-1 right-1 rounded bg-background/90 p-1 text-destructive opacity-0 shadow-sm group-hover:opacity-100 focus:opacity-100"
                    title="Delete this image"
                    onClick={(event) => { event.preventDefault(); event.stopPropagation(); setDeleteTarget(item); }}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault(); event.stopPropagation(); setDeleteTarget(item);
                      }
                    }}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </span>
                )}
              </button>
            ))}
          </div>
          {categoryItems.length === 0 && <p className="py-3 text-center text-xs text-muted-foreground">No uploaded {label} images found.</p>}
        </div>
      </PopoverContent>
      {onDelete && (
        <AlertDialog open={!!deleteTarget} onOpenChange={(nextOpen) => !nextOpen && !isDeleting && setDeleteTarget(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete this library image?</AlertDialogTitle>
              <AlertDialogDescription>
                This removes the {label} image reference from every course using it and deletes the Storage file when no other thumbnail reference remains. This cannot be undone.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={isDeleting}>Cancel</AlertDialogCancel>
              <AlertDialogAction
                disabled={isDeleting}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                onClick={async (event) => {
                  event.preventDefault();
                  if (!deleteTarget) return;
                  setIsDeleting(true);
                  try {
                    await onDelete(deleteTarget);
                    setDeleteTarget(null);
                    setOpen(false);
                  } finally {
                    setIsDeleting(false);
                  }
                }}
              >
                {isDeleting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Delete image
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}
    </Popover>
  );
}
