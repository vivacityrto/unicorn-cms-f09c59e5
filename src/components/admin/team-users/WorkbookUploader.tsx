import { useRef } from "react";
import { Button } from "@/components/ui/button";
import { Download, ExternalLink, Loader2, Trash2, Upload } from "lucide-react";
import { useWorkbookSignedUrl, useWorkbookUpload } from "@/hooks/useWorkbookUpload";

interface Props {
  runId: number;
  filePath: string | null;
  fallbackUrl: string | null;
}

export function WorkbookUploader({ runId, filePath, fallbackUrl }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const { upload, remove } = useWorkbookUpload(runId);
  const { data: signedUrl, isLoading: loadingUrl } = useWorkbookSignedUrl(filePath);

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (!f) return;
    upload.mutate({ file: f, previousPath: filePath });
  };

  if (filePath) {
    const filename = filePath.split("/").pop() ?? "workbook.pdf";
    return (
      <div className="space-y-2">
        <Button
          asChild
          variant="outline"
          className="w-full"
          disabled={loadingUrl || !signedUrl}
        >
          {signedUrl ? (
            <a href={signedUrl} target="_blank" rel="noopener noreferrer">
              <Download className="h-4 w-4 mr-2" />
              Download {filename}
              <ExternalLink className="h-3 w-3 ml-2" />
            </a>
          ) : (
            <span>
              <Loader2 className="h-4 w-4 mr-2 animate-spin" /> Preparing link…
            </span>
          )}
        </Button>
        <div className="flex gap-2">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="flex-1"
            onClick={() => inputRef.current?.click()}
            disabled={upload.isPending}
          >
            <Upload className="h-3.5 w-3.5 mr-1" /> Replace
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => remove.mutate(filePath)}
            disabled={remove.isPending}
          >
            <Trash2 className="h-3.5 w-3.5 mr-1" /> Remove
          </Button>
        </div>
        <input
          ref={inputRef}
          type="file"
          accept="application/pdf"
          hidden
          onChange={handleFile}
        />
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {fallbackUrl && (
        <Button asChild variant="outline" className="w-full">
          <a href={fallbackUrl} target="_blank" rel="noopener noreferrer">
            <Download className="h-4 w-4 mr-2" /> Download default workbook
            <ExternalLink className="h-3 w-3 ml-2" />
          </a>
        </Button>
      )}
      <Button
        type="button"
        variant={fallbackUrl ? "ghost" : "default"}
        className="w-full"
        onClick={() => inputRef.current?.click()}
        disabled={upload.isPending}
      >
        {upload.isPending ? (
          <>
            <Loader2 className="h-4 w-4 mr-2 animate-spin" /> Uploading…
          </>
        ) : (
          <>
            <Upload className="h-4 w-4 mr-2" /> Upload workbook PDF
          </>
        )}
      </Button>
      <p className="text-xs text-muted-foreground">PDF only, up to 25 MB. Stored in the internal-onboarding bucket.</p>
      <input
        ref={inputRef}
        type="file"
        accept="application/pdf"
        hidden
        onChange={handleFile}
      />
    </div>
  );
}
