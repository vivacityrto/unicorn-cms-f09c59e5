import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Skeleton } from "@/components/ui/skeleton";
import { FileText, FileSpreadsheet, FileType, Download, ExternalLink } from "lucide-react";
import {
  getAttachmentUrl,
  isImageMime,
  isPdfMime,
  isOfficeMime,
  type MessageAttachmentRow,
} from "@/lib/messageAttachments";

interface Props {
  attachments: MessageAttachmentRow[];
}

export function MessageAttachments({ attachments }: Props) {
  const [imageUrls, setImageUrls] = useState<Record<string, string>>({});

  // Eagerly resolve signed URLs for image thumbnails
  useEffect(() => {
    let cancelled = false;
    const imageAttachments = attachments.filter(a => isImageMime(a.mime_type));
    if (imageAttachments.length === 0) return;
    (async () => {
      const entries = await Promise.all(
        imageAttachments.map(async (a) => {
          try {
            const url = await getAttachmentUrl(supabase, a.storage_path);
            return [a.storage_path, url] as const;
          } catch {
            return [a.storage_path, ""] as const;
          }
        })
      );
      if (cancelled) return;
      setImageUrls(prev => {
        const next = { ...prev };
        for (const [k, v] of entries) if (v) next[k] = v;
        return next;
      });
    })();
    return () => { cancelled = true; };
  }, [attachments]);

  const handleOpenLazy = async (a: MessageAttachmentRow) => {
    try {
      const url = await getAttachmentUrl(supabase, a.storage_path);
      window.open(url, "_blank", "noopener,noreferrer");
    } catch (e) {
      console.error("Failed to open attachment", e);
    }
  };

  const handleDownload = async (a: MessageAttachmentRow) => {
    try {
      const url = await getAttachmentUrl(supabase, a.storage_path);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = a.filename;
      anchor.rel = "noopener noreferrer";
      document.body.appendChild(anchor);
      anchor.click();
      document.body.removeChild(anchor);
    } catch (e) {
      console.error("Failed to download attachment", e);
    }
  };

  if (!attachments.length) return null;

  return (
    <div className="flex min-w-0 max-w-full flex-wrap gap-2 mt-2 overflow-hidden">
      {attachments.map((a) => {
        if (isImageMime(a.mime_type)) {
          const url = imageUrls[a.storage_path];
          if (!url) {
            return <Skeleton key={a.id} className="h-24 w-32 max-w-full rounded-md" />;
          }
          return (
            <img
              key={a.id}
              src={url}
              alt={a.filename}
              loading="lazy"
              onClick={() => window.open(url, "_blank", "noopener,noreferrer")}
              className="max-w-full sm:max-w-[200px] max-h-[200px] rounded-md cursor-pointer border border-border object-cover"
            />
          );
        }

        if (isPdfMime(a.mime_type)) {
          return (
            <button
              key={a.id}
              type="button"
              onClick={() => handleOpenLazy(a)}
              className="inline-flex max-w-full min-w-0 items-center gap-2 px-3 py-1.5 rounded-full border border-border bg-background hover:bg-muted text-xs"
            >
              <FileText className="h-3.5 w-3.5 text-red-600" />
              <span className="truncate max-w-[200px]">{a.filename}</span>
              <ExternalLink className="h-3 w-3 text-muted-foreground" />
            </button>
          );
        }

        if (isOfficeMime(a.mime_type)) {
          const isExcel = a.mime_type?.includes("spreadsheet") || a.mime_type?.includes("excel");
          const Icon = isExcel ? FileSpreadsheet : FileType;
          return (
            <button
              key={a.id}
              type="button"
              onClick={() => handleDownload(a)}
              className="inline-flex max-w-full min-w-0 items-center gap-2 px-3 py-1.5 rounded-full border border-border bg-background hover:bg-muted text-xs"
            >
              <Icon className={`h-3.5 w-3.5 ${isExcel ? "text-green-600" : "text-blue-600"}`} />
              <span className="truncate max-w-[200px]">{a.filename}</span>
              <Download className="h-3 w-3 text-muted-foreground" />
            </button>
          );
        }

        // Fallback (shouldn't happen given validation)
        return (
          <button
            key={a.id}
            type="button"
            onClick={() => handleDownload(a)}
              className="inline-flex max-w-full min-w-0 items-center gap-2 px-3 py-1.5 rounded-full border border-border bg-background hover:bg-muted text-xs"
          >
            <FileText className="h-3.5 w-3.5" />
            <span className="truncate max-w-[200px]">{a.filename}</span>
            <Download className="h-3 w-3 text-muted-foreground" />
          </button>
        );
      })}
    </div>
  );
}
