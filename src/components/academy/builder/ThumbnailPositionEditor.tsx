import { useMemo, useRef, type PointerEvent } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import ThumbnailLibraryPicker from "@/components/academy/builder/ThumbnailLibraryPicker";
import type { AcademyThumbnailLibraryItem } from "@/hooks/academy/useAcademyBuilderPickers";

const PRESETS = [
  { label: "Top", value: "50% 0%" },
  { label: "Center", value: "50% 50%" },
  { label: "Bottom", value: "50% 100%" },
];

function parsePosition(value: string | null | undefined): [number, number] {
  const match = String(value || "50% 50%").match(/(-?\d+(?:\.\d+)?)%\s+(-?\d+(?:\.\d+)?)%/);
  if (!match) return [50, 50];
  return [Math.max(0, Math.min(100, Number(match[1]))), Math.max(0, Math.min(100, Number(match[2])))];
}

interface Props {
  /** Section heading, e.g. "Course card image" or "Course page banner image". */
  label: string;
  /** Preview aspect ratio — square for the course card, video (16:9) for the course-detail hero banner. */
  shape?: "square" | "video";
  imageUrl: string | null;
  value: string;
  onChange: (value: string) => void;
  fit: "cover" | "contain";
  onFitChange: (fit: "cover" | "contain") => void;
  zoom: number;
  onZoomChange: (zoom: number) => void;
  onUpload: (file: File) => Promise<void>;
  libraryItems?: AcademyThumbnailLibraryItem[];
  libraryCategory?: "course" | "banner";
  onSelectLibraryImage?: (url: string) => void;
  onDeleteLibraryImage?: (item: AcademyThumbnailLibraryItem) => Promise<void>;
  isUploading?: boolean;
  /** When provided, shows a "Remove" action (e.g. to fall back to another image) instead of requiring a replacement upload. */
  onRemove?: () => void;
  removeLabel?: string;
}

export default function ThumbnailPositionEditor({
  label,
  shape = "square",
  imageUrl,
  value,
  onChange,
  fit,
  onFitChange,
  zoom,
  onZoomChange,
  onUpload,
  libraryItems = [],
  libraryCategory,
  onSelectLibraryImage,
  onDeleteLibraryImage,
  isUploading = false,
  onRemove,
  removeLabel = "Remove",
}: Props) {
  const [x, y] = useMemo(() => parsePosition(value), [value]);
  const dragRef = useRef<{ pointerId: number; startX: number; startY: number; originX: number; originY: number } | null>(null);
  const setPosition = (nextX: number, nextY: number) => {
    const clampedX = Math.max(0, Math.min(100, nextX));
    const clampedY = Math.max(0, Math.min(100, nextY));
    onChange(`${Math.round(clampedX)}% ${Math.round(clampedY)}%`);
  };
  const handlePointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (!imageUrl) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    dragRef.current = { pointerId: event.pointerId, startX: event.clientX, startY: event.clientY, originX: x, originY: y };
  };
  const handlePointerMove = (event: PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    setPosition(drag.originX - (event.clientX - drag.startX) / 2, drag.originY - (event.clientY - drag.startY) / 2);
  };
  const clearDrag = () => { dragRef.current = null; };

  const previewShapeClass = shape === "video" ? "aspect-video max-w-[320px]" : "aspect-square max-w-[260px]";

  return (
    <div className="space-y-3 rounded-lg border p-3">
      <div>
        <Label>{label}</Label>
        <p className="text-xs text-muted-foreground mt-1">Drag the image to reposition it. Choose Fill to crop or Show full image to zoom out.</p>
      </div>
      <div
        className={`${previewShapeClass} overflow-hidden rounded-lg bg-muted border cursor-move touch-none`}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={clearDrag}
        onPointerCancel={clearDrag}
        title={imageUrl ? "Drag to reposition thumbnail" : undefined}
      >
        {imageUrl ? (
          <img src={imageUrl} alt={`${label} preview`} className="h-full w-full" style={{ objectFit: fit, objectPosition: value || "50% 50%", transform: `scale(${zoom})`, transformOrigin: value || "50% 50%" }} draggable={false} />
        ) : (
          <div className="h-full flex items-center justify-center text-xs text-muted-foreground text-center p-4">Generate or add a thumbnail to preview framing.</div>
        )}
      </div>
      <div className="flex flex-wrap gap-2">
        <Button type="button" size="sm" variant={fit === "cover" ? "default" : "outline"} onClick={() => onFitChange("cover")}>Fill (crop)</Button>
        <Button type="button" size="sm" variant={fit === "contain" ? "default" : "outline"} onClick={() => onFitChange("contain")}>Show full image</Button>
      </div>
      <div className="rounded-md border border-dashed p-3 space-y-2">
        <div>
          <p className="text-sm font-medium">Custom image</p>
          <p className="text-xs text-muted-foreground">Use your own JPG, PNG, or WebP image.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <label className="inline-flex cursor-pointer items-center rounded-md border px-3 py-2 text-sm font-medium hover:bg-muted has-[:disabled]:cursor-not-allowed has-[:disabled]:opacity-50">
            {isUploading ? "Uploading…" : imageUrl ? "Replace image" : "Upload custom image"}
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp"
              className="sr-only"
              disabled={isUploading}
              onChange={(event) => {
                const file = event.target.files?.[0];
                event.currentTarget.value = "";
                if (file) void onUpload(file);
              }}
            />
          </label>
          {libraryCategory && onSelectLibraryImage && (
            <ThumbnailLibraryPicker
              category={libraryCategory}
              items={libraryItems}
              value={imageUrl}
              onSelect={onSelectLibraryImage}
              onDelete={onDeleteLibraryImage}
            />
          )}
          {onRemove && imageUrl && (
            <Button type="button" size="sm" variant="outline" onClick={onRemove}>{removeLabel}</Button>
          )}
        </div>
      </div>
      <div className="flex flex-wrap gap-2">
        {PRESETS.map((preset) => (
          <Button key={preset.value} type="button" size="sm" variant={value === preset.value ? "default" : "outline"} onClick={() => onChange(preset.value)}>{preset.label}</Button>
        ))}
      </div>
      <label className="text-xs text-muted-foreground space-y-1 block">
        Zoom: {Math.round(zoom * 100)}%
        <Slider value={[zoom * 100]} min={100} max={160} step={1} onValueChange={([next]) => onZoomChange(next / 100)} aria-label="Thumbnail zoom" />
      </label>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="text-xs text-muted-foreground space-y-1">
          Horizontal: {Math.round(x)}%
          <Slider value={[x]} min={0} max={100} step={1} onValueChange={([next]) => setPosition(next, y)} aria-label="Thumbnail horizontal position" />
        </label>
        <label className="text-xs text-muted-foreground space-y-1">
          Vertical: {Math.round(y)}%
          <Slider value={[y]} min={0} max={100} step={1} onValueChange={([next]) => setPosition(x, next)} aria-label="Thumbnail vertical position" />
        </label>
      </div>
    </div>
  );
}
