import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { FolderOpen, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { SharePointTemplateBrowser, type SelectedTemplate } from '@/components/documents/SharePointTemplateBrowser';

interface GovernanceVersionImportDialogProps {
  documentId: number;
  documentTitle: string;
  frameworkType?: string | null;
  /** Latest existing display_version for this document, or null if it has never been imported. */
  latestDisplayVersion?: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
}

type BumpSegment = 'year' | 'major' | 'minor';

function parseLabel(label: string): { year: number; major: number; minor: number } | null {
  const m = /^(\d{4})\.(\d{2})\.(\d{2})$/.exec(label);
  if (!m) return null;
  return { year: parseInt(m[1], 10), major: parseInt(m[2], 10), minor: parseInt(m[3], 10) };
}

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

function suggestNext(latest: { year: number; major: number; minor: number } | null, segment: BumpSegment): string {
  const currentYear = new Date().getFullYear();
  if (!latest) return `${currentYear}.00.00`;
  if (segment === 'year') return `${latest.year + 1}.00.00`;
  if (segment === 'major') return `${latest.year}.${pad2(latest.major + 1)}.00`;
  return `${latest.year}.${pad2(latest.major)}.${pad2(latest.minor + 1)}`;
}

const DISPLAY_VERSION_FORMAT = /^\d{4}\.\d{2}\.\d{2}$/;

/**
 * Two-step "Import New Version" flow: pick a file from the Master Documents
 * SharePoint site, then set the version label it should be imported as.
 * Replaces the old plain-URL "Link to SharePoint" flow -- selecting a file
 * here actually downloads it, snapshots it into Supabase Storage, and
 * creates a real draft document_versions row (see import-sharepoint-template
 * edge function), not just a pointer update.
 */
export function GovernanceVersionImportDialog({
  documentId,
  documentTitle,
  frameworkType,
  latestDisplayVersion,
  open,
  onOpenChange,
  onSuccess,
}: GovernanceVersionImportDialogProps) {
  const [step, setStep] = useState<'select-file' | 'set-version'>('select-file');
  const [selectedTemplate, setSelectedTemplate] = useState<SelectedTemplate | null>(null);
  const [bumpSegment, setBumpSegment] = useState<BumpSegment>('minor');
  const [displayVersion, setDisplayVersion] = useState('');
  const [importing, setImporting] = useState(false);

  const parsedLatest = latestDisplayVersion ? parseLabel(latestDisplayVersion) : null;
  const hasExisting = !!parsedLatest;

  const reset = () => {
    setStep('select-file');
    setSelectedTemplate(null);
    setBumpSegment('minor');
    setDisplayVersion('');
  };

  const handleContinue = () => {
    if (!selectedTemplate) return;
    setDisplayVersion(suggestNext(parsedLatest, bumpSegment));
    setStep('set-version');
  };

  const handleBumpChange = (segment: BumpSegment) => {
    setBumpSegment(segment);
    setDisplayVersion(suggestNext(parsedLatest, segment));
  };

  const handleImport = async () => {
    if (!selectedTemplate) return;
    if (!DISPLAY_VERSION_FORMAT.test(displayVersion)) {
      toast.error('Version label must match YYYY.MM.NN, e.g. 2026.03.00');
      return;
    }
    setImporting(true);
    try {
      const { data, error } = await supabase.functions.invoke('import-sharepoint-template', {
        body: {
          action: 'import',
          document_id: documentId,
          source_drive_id: selectedTemplate.driveId,
          source_item_id: selectedTemplate.file.id,
          display_version: displayVersion,
        },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      const linked = data?.fields_linked ?? 0;
      toast.success(`Imported ${data?.display_version ?? displayVersion} — ${linked} field${linked !== 1 ? 's' : ''} linked`);
      reset();
      onOpenChange(false);
      onSuccess();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Import failed');
    } finally {
      setImporting(false);
    }
  };

  const frameworkFolderMap: Record<string, string> = { rto: 'RTO', gto: 'GTO', cricos: 'CRICOS' };
  const autoFolder = frameworkType ? frameworkFolderMap[frameworkType.toLowerCase()] || 'Other' : 'Other';

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) reset();
        onOpenChange(o);
      }}
    >
      <DialogContent className={step === 'select-file' ? 'max-w-[95vw] w-[1400px] max-h-[85vh] overflow-y-auto' : 'max-w-md'}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FolderOpen className="h-5 w-5" />
            {step === 'select-file' ? 'Master Documents — Select Template File' : 'Set Version Label'}
          </DialogTitle>
        </DialogHeader>

        {step === 'select-file' && (
          <>
            <SharePointTemplateBrowser
              initialFilter={documentTitle}
              autoNavigateToFolder={autoFolder}
              onSelectionChange={setSelectedTemplate}
            />
            <DialogFooter>
              <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
              <Button onClick={handleContinue} disabled={!selectedTemplate}>Continue</Button>
            </DialogFooter>
          </>
        )}

        {step === 'set-version' && (
          <div className="space-y-4 py-2">
            <p className="text-sm text-muted-foreground">
              Importing <span className="font-medium text-foreground">{selectedTemplate?.file.name}</span>
            </p>

            {hasExisting ? (
              <div className="space-y-2">
                <Label>Bump</Label>
                <RadioGroup
                  value={bumpSegment}
                  onValueChange={(v) => handleBumpChange(v as BumpSegment)}
                  className="flex gap-4"
                >
                  <div className="flex items-center gap-2">
                    <RadioGroupItem value="year" id="bump-year" />
                    <Label htmlFor="bump-year" className="font-normal">Year</Label>
                  </div>
                  <div className="flex items-center gap-2">
                    <RadioGroupItem value="major" id="bump-major" />
                    <Label htmlFor="bump-major" className="font-normal">Major</Label>
                  </div>
                  <div className="flex items-center gap-2">
                    <RadioGroupItem value="minor" id="bump-minor" />
                    <Label htmlFor="bump-minor" className="font-normal">Minor</Label>
                  </div>
                </RadioGroup>
                <p className="text-xs text-muted-foreground">Current version: {latestDisplayVersion}</p>
              </div>
            ) : (
              <p className="text-xs text-muted-foreground">This is the first version for this document.</p>
            )}

            <div className="space-y-1.5">
              <Label htmlFor="display-version">Version Label</Label>
              <Input
                id="display-version"
                value={displayVersion}
                onChange={(e) => setDisplayVersion(e.target.value)}
                placeholder="2026.03.00"
                className="font-mono"
              />
              <p className="text-xs text-muted-foreground">Format: YYYY.MM.NN</p>
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={() => setStep('select-file')} disabled={importing}>Back</Button>
              <Button onClick={handleImport} disabled={importing || !DISPLAY_VERSION_FORMAT.test(displayVersion)}>
                {importing ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" /> Importing...
                  </>
                ) : (
                  'Import'
                )}
              </Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
