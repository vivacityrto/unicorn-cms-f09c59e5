import { useEmailAttachments, type EmailAttachment } from '@/hooks/useEmailAttachments';
import { Badge } from '@/components/ui/badge';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { File, FileSpreadsheet, FileText, Lock } from 'lucide-react';
import { cn } from '@/lib/utils';

interface EmailAttachmentChipsProps {
  emailTemplateId?: number;
}

function iconFor(format: string | null) {
  const f = (format || '').toLowerCase();
  if (f === 'xlsx' || f === 'xls' || f === 'csv') return { Icon: FileSpreadsheet, color: 'text-green-600' };
  if (f === 'docx' || f === 'doc') return { Icon: FileText, color: 'text-blue-600' };
  return { Icon: File, color: 'text-muted-foreground' };
}

export function EmailAttachmentChips({ emailTemplateId }: EmailAttachmentChipsProps) {
  const { attachments, loading } = useEmailAttachments(emailTemplateId);
  const { toast } = useToast();

  if (loading || attachments.length === 0) return null;

  const handleOpen = async (a: EmailAttachment) => {
    if (!a.filePath) return;
    const { data, error } = await supabase.storage.from('documents').createSignedUrl(a.filePath, 60);
    if (error || !data?.signedUrl) {
      toast({ title: 'Unable to open file', description: error?.message || 'Signed URL failed', variant: 'destructive' });
      return;
    }
    window.open(data.signedUrl, '_blank', 'noopener,noreferrer');
  };

  return (
    <div className="grid grid-cols-[80px_1fr] items-start gap-2">
      <span className="text-right text-sm font-semibold text-muted-foreground pt-1.5">ATTACHMENTS:</span>
      <div className="flex flex-wrap gap-2">
        <TooltipProvider>
          {attachments.map((a) => {
            const { Icon, color } = iconFor(a.format);
            const locked = !a.filePath;
            const chip = (
              <button
                key={a.documentId}
                type="button"
                disabled={locked}
                onClick={() => handleOpen(a)}
                className={cn(
                  'inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md border bg-background text-xs',
                  locked
                    ? 'opacity-50 cursor-not-allowed'
                    : 'hover:bg-muted hover:border-primary/40 transition-colors cursor-pointer'
                )}
              >
                <Icon className={cn('h-3.5 w-3.5 shrink-0', !locked && color)} />
                <span className="truncate max-w-[240px]">{a.title}</span>
                {a.format && (
                  <Badge variant="secondary" className="text-[10px] px-1 py-0 h-4 uppercase">
                    {a.format}
                  </Badge>
                )}
                {locked && <Lock className="h-3 w-3 text-muted-foreground" />}
              </button>
            );
            return locked ? (
              <Tooltip key={a.documentId}>
                <TooltipTrigger asChild>{chip}</TooltipTrigger>
                <TooltipContent>File not yet uploaded to document library</TooltipContent>
              </Tooltip>
            ) : (
              chip
            );
          })}
        </TooltipProvider>
      </div>
    </div>
  );
}
