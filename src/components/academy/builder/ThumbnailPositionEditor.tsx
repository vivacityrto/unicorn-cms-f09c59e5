import { useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";

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
  imageUrl: string | null;
  value: string;
  onChange: (value: string) => void;
}

export default function ThumbnailPositionEditor({ imageUrl, value, onChange }: Props) {
  const [x, y] = useMemo(() => parsePosition(value), [value]);
  const setPosition = (nextX: number, nextY: number) => onChange(`${Math.round(nextX)}% ${Math.round(nextY)}%`);

  return (
    <div className="space-y-3 rounded-lg border p-3">
      <div>
        <Label>Thumbnail framing</Label>
        <p className="text-xs text-muted-foreground mt-1">Keep the square card design and move the Vimeo image to keep the important subject in frame.</p>
      </div>
      <div className="aspect-square max-w-[220px] overflow-hidden rounded-lg bg-muted border">
        {imageUrl ? (
          <img src={imageUrl} alt="Thumbnail preview" className="h-full w-full object-cover" style={{ objectPosition: value || "50% 50%" }} />
        ) : (
          <div className="h-full flex items-center justify-center text-xs text-muted-foreground text-center p-4">Generate or add a thumbnail to preview framing.</div>
        )}
      </div>
      <div className="flex flex-wrap gap-2">
        {PRESETS.map((preset) => (
          <Button key={preset.value} type="button" size="sm" variant={value === preset.value ? "default" : "outline"} onClick={() => onChange(preset.value)}>{preset.label}</Button>
        ))}
      </div>
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
