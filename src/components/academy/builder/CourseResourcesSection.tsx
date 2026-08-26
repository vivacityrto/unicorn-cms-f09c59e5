import { useRef, useState } from "react";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { ChevronDown, ChevronUp, GripVertical, Loader2, Plus, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { CourseResourceTypeIcon } from "@/components/academy/CourseResourceTypeIcon";
import {
  useAcademyCourseResources,
  useAddCourseFileResource,
  useAddCourseLinkResource,
  useRemoveCourseResource,
  useReorderCourseResources,
  COURSE_RESOURCES_KEY,
  type CourseResource,
} from "@/hooks/academy/useAcademyCourseResources";
import { REJECTED_FILE_MESSAGE, isAllowedUploadFile, isHttpsUrl, titleFromFilename } from "@/lib/academy/courseResources";
import { RESOURCE_CATEGORIES } from "@/types/resource";
import { useQueryClient } from "@tanstack/react-query";

type AddMode = "file" | "link";

function SortableResourceRow({
  resource,
  canManage,
  index,
  total,
  onRemove,
  onMove,
}: {
  resource: CourseResource;
  canManage: boolean;
  index: number;
  total: number;
  onRemove: (resource: CourseResource) => void;
  onMove: (resource: CourseResource, direction: -1 | 1) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: resource.linkId,
    disabled: !canManage,
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="flex items-center gap-1 min-w-0 rounded-md border bg-card px-1.5 py-1"
    >
      {canManage && (
        <button
          type="button"
          className="p-0.5 text-muted-foreground hover:text-foreground cursor-grab active:cursor-grabbing touch-none"
          aria-label={`Reorder ${resource.title}`}
          {...attributes}
          {...listeners}
        >
          <GripVertical className="h-3.5 w-3.5" />
        </button>
      )}
      <CourseResourceTypeIcon kind={resource.kind} category={resource.category} />
      <span className="flex-1 min-w-0 truncate text-xs text-foreground" title={resource.title}>
        {resource.title}
      </span>
      {canManage && (
        <>
          <button
            type="button"
            className="p-0.5 text-muted-foreground hover:text-foreground disabled:opacity-30"
            aria-label={`Move ${resource.title} up`}
            disabled={index === 0}
            onClick={() => onMove(resource, -1)}
          >
            <ChevronUp className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            className="p-0.5 text-muted-foreground hover:text-foreground disabled:opacity-30"
            aria-label={`Move ${resource.title} down`}
            disabled={index === total - 1}
            onClick={() => onMove(resource, 1)}
          >
            <ChevronDown className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            className="p-0.5 hover:bg-destructive/10 rounded"
            aria-label={`Remove ${resource.title}`}
            onClick={() => onRemove(resource)}
          >
            <X className="h-3.5 w-3.5 text-destructive" />
          </button>
        </>
      )}
    </div>
  );
}

export default function CourseResourcesSection({
  courseId,
  canManage,
}: {
  courseId: number;
  canManage: boolean;
}) {
  const qc = useQueryClient();
  const { data: resources = [], isLoading } = useAcademyCourseResources(courseId);
  const addFile = useAddCourseFileResource(courseId);
  const addLink = useAddCourseLinkResource(courseId);
  const removeResource = useRemoveCourseResource(courseId);
  const reorder = useReorderCourseResources(courseId);

  const [formOpen, setFormOpen] = useState(false);
  const [mode, setMode] = useState<AddMode>("file");
  const [title, setTitle] = useState("");
  const [category, setCategory] = useState("");
  const [accessLevel, setAccessLevel] = useState<"member" | "public">("member");
  const [url, setUrl] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const persistOrder = (next: CourseResource[]) => {
    qc.setQueryData([COURSE_RESOURCES_KEY, courseId], next);
    reorder.mutate(next);
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = resources.findIndex((r) => r.linkId === active.id);
    const newIndex = resources.findIndex((r) => r.linkId === over.id);
    if (oldIndex === -1 || newIndex === -1) return;
    persistOrder(arrayMove(resources, oldIndex, newIndex));
  };

  const handleMove = (resource: CourseResource, direction: -1 | 1) => {
    const index = resources.findIndex((r) => r.linkId === resource.linkId);
    const nextIndex = index + direction;
    if (index === -1 || nextIndex < 0 || nextIndex >= resources.length) return;
    persistOrder(arrayMove(resources, index, nextIndex));
  };

  const resetForm = () => {
    setTitle("");
    setCategory("");
    setAccessLevel("member");
    setUrl("");
    setFile(null);
    setFileError(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const closeForm = () => {
    resetForm();
    setFormOpen(false);
    setMode("file");
  };

  const handleFileChange = (selected: File | null) => {
    setFileError(null);
    if (!selected) {
      setFile(null);
      return;
    }
    if (!isAllowedUploadFile(selected)) {
      setFile(null);
      setFileError(REJECTED_FILE_MESSAGE);
      if (fileInputRef.current) fileInputRef.current.value = "";
      toast.error(REJECTED_FILE_MESSAGE);
      return;
    }
    setFile(selected);
    setTitle((current) => current.trim() || titleFromFilename(selected.name));
  };

  const isPending = addFile.isPending || addLink.isPending;

  const handleSubmit = () => {
    const trimmedTitle = title.trim();
    if (!trimmedTitle) {
      toast.error("Title is required");
      return;
    }
    if (!category) {
      toast.error("Select a category");
      return;
    }

    if (mode === "file") {
      if (!file) {
        toast.error("Choose a PDF, Word, Excel, or Markdown file");
        return;
      }
      addFile.mutate(
        { file, title: trimmedTitle, category, accessLevel },
        { onSuccess: closeForm },
      );
      return;
    }

    if (!isHttpsUrl(url)) {
      toast.error("Enter a valid https:// URL.");
      return;
    }
    addLink.mutate(
      { title: trimmedTitle, url, category, accessLevel },
      { onSuccess: closeForm },
    );
  };

  return (
    <div className="space-y-1">
      <label className="text-xs font-medium text-muted-foreground">Resources</label>

      {isLoading ? (
        <div className="space-y-1.5">
          <Skeleton className="h-8 w-full" />
          <Skeleton className="h-8 w-full" />
        </div>
      ) : resources.length === 0 && !formOpen ? (
        <p className="text-[11px] text-muted-foreground rounded-md border border-dashed px-2 py-2">
          No resources attached yet.
        </p>
      ) : (
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <SortableContext items={resources.map((r) => r.linkId)} strategy={verticalListSortingStrategy}>
            <div className="space-y-1">
              {resources.map((resource, index) => (
                <SortableResourceRow
                  key={resource.linkId}
                  resource={resource}
                  canManage={canManage}
                  index={index}
                  total={resources.length}
                  onRemove={(row) => removeResource.mutate(row.linkId)}
                  onMove={handleMove}
                />
              ))}
            </div>
          </SortableContext>
        </DndContext>
      )}

      {canManage && !formOpen && (
        <Button type="button" variant="outline" size="sm" className="w-full mt-1" onClick={() => setFormOpen(true)}>
          <Plus className="h-3.5 w-3.5 mr-1" /> Add Resource
        </Button>
      )}

      {canManage && formOpen && (
        <div className="space-y-2 rounded-md border p-2 mt-1">
          <ToggleGroup
            type="single"
            value={mode}
            onValueChange={(value) => {
              if (value) setMode(value as AddMode);
            }}
            variant="outline"
            size="sm"
            className="w-full justify-start"
          >
            <ToggleGroupItem value="file" className="flex-1 text-[11px] h-8">
              Upload a file
            </ToggleGroupItem>
            <ToggleGroupItem value="link" className="flex-1 text-[11px] h-8">
              Add a link
            </ToggleGroupItem>
          </ToggleGroup>

          <div className="space-y-1">
            <label className="text-[11px] font-medium text-muted-foreground" htmlFor="course-resource-title">
              Title
            </label>
            <Input
              id="course-resource-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="h-8 text-xs"
            />
          </div>

          <div className="space-y-1">
            <label className="text-[11px] font-medium text-muted-foreground">Category</label>
            <Select value={category || undefined} onValueChange={setCategory}>
              <SelectTrigger className="h-8 text-xs">
                <SelectValue placeholder="Select a category" />
              </SelectTrigger>
              <SelectContent>
                {RESOURCE_CATEGORIES.map((cat) => (
                  <SelectItem key={cat.id} value={cat.id}>
                    {cat.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1">
            <label className="text-[11px] font-medium text-muted-foreground">Access level</label>
            <Select value={accessLevel} onValueChange={(v) => setAccessLevel(v as "member" | "public")}>
              <SelectTrigger className="h-8 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="member">Member</SelectItem>
                <SelectItem value="public">Public</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {mode === "file" ? (
            <div className="space-y-1">
              <label className="text-[11px] font-medium text-muted-foreground" htmlFor="course-resource-file">
                File
              </label>
              <Input
                id="course-resource-file"
                ref={fileInputRef}
                type="file"
                accept=".pdf,.doc,.docx,.xlsx,.xls,.md,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/markdown"
                className="h-8 text-xs"
                onChange={(e) => handleFileChange(e.target.files?.[0] ?? null)}
              />
              {fileError && <p className="text-[11px] text-destructive">{fileError}</p>}
              {file && !fileError && (
                <p className="text-[11px] text-muted-foreground truncate">{file.name}</p>
              )}
            </div>
          ) : (
            <div className="space-y-1">
              <label className="text-[11px] font-medium text-muted-foreground" htmlFor="course-resource-url">
                URL
              </label>
              <Input
                id="course-resource-url"
                type="url"
                placeholder="https://"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                className="h-8 text-xs"
              />
            </div>
          )}

          <div className="flex gap-2">
            <Button
              type="button"
              size="sm"
              className="flex-1"
              onClick={handleSubmit}
              disabled={isPending}
            >
              {isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
              Add
            </Button>
            <Button type="button" size="sm" variant="outline" onClick={closeForm} disabled={isPending}>
              Cancel
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
