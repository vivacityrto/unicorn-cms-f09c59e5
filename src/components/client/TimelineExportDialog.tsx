import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { CalendarIcon, Download, FileText, Loader2 } from 'lucide-react';
import { format, subDays } from 'date-fns';
import { cn } from '@/lib/utils';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

interface TimelineExportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  tenantId: number;
  clientId: string;
  clientName?: string;
}

const EVENT_TYPE_OPTIONS = [
  { value: 'meeting_synced', label: 'Meetings' },
  { value: 'time_posted', label: 'Time Posted' },
  { value: 'time_ignored', label: 'Time Ignored' },
  { value: 'email_sent', label: 'Emails Sent' },
  { value: 'email_failed', label: 'Emails Failed' },
  { value: 'document_uploaded', label: 'Documents Uploaded' },
  { value: 'document_downloaded', label: 'Documents Downloaded' },
  { value: 'task_completed_team', label: 'Team Tasks Completed' },
  { value: 'task_completed_client', label: 'Client Tasks Completed' },
  { value: 'note_added', label: 'Notes Added' },
  { value: 'note_created', label: 'Notes Created' },
];

const DATE_PRESETS = [
  { label: 'Last 7 days', days: 7 },
  { label: 'Last 30 days', days: 30 },
  { label: 'Last 90 days', days: 90 },
  { label: 'Last year', days: 365 },
];

export function TimelineExportDialog({
  open,
  onOpenChange,
  tenantId,
  clientId,
  clientName
}: TimelineExportDialogProps) {
  const [fromDate, setFromDate] = useState<Date>(subDays(new Date(), 30));
  const [toDate, setToDate] = useState<Date>(new Date());
  const [selectedTypes, setSelectedTypes] = useState<string[]>([]);
  const [includeMetadata, setIncludeMetadata] = useState(true);
  const [exporting, setExporting] = useState<'csv' | 'pdf' | null>(null);
  const { toast } = useToast();

  const toggleType = (type: string) => {
    setSelectedTypes(prev => 
      prev.includes(type) 
        ? prev.filter(t => t !== type)
        : [...prev, type]
    );
  };

  const selectAll = () => {
    setSelectedTypes(EVENT_TYPE_OPTIONS.map(o => o.value));
  };

  const clearAll = () => {
    setSelectedTypes([]);
  };

  const applyPreset = (days: number) => {
    setFromDate(subDays(new Date(), days));
    setToDate(new Date());
  };

  const exportCSV = async () => {
    setExporting('csv');
    try {
      const { data, error } = await supabase.rpc('rpc_export_client_timeline', {
        p_tenant_id: tenantId,
        p_client_id: parseInt(clientId),
        p_from_date: fromDate.toISOString(),
        p_to_date: toDate.toISOString(),
        p_event_types: selectedTypes.length > 0 ? selectedTypes : null
      });

      if (error) throw error;

      // Build CSV
      const headers = [
        'Occurred At',
        'Event Type',
        'Title',
        'Body',
        'Created By',
        ...(includeMetadata ? ['Package ID', 'Stage ID', 'Entity ID', 'Metadata'] : [])
      ];

      const rows = (data || []).map((row: any) => {
        const base = [
          row.occurred_at ? format(new Date(row.occurred_at), 'yyyy-MM-dd HH:mm:ss') : '',
          row.event_type,
          `"${(row.title || '').replace(/"/g, '""')}"`,
          `"${((row.body || '').substring(0, 500)).replace(/"/g, '""')}"`,
          row.creator_name || 'System'
        ];
        
        if (includeMetadata) {
          const meta = row.metadata || {};
          base.push(
            meta.package_id || '',
            meta.stage_id || '',
            meta.entity_id || meta.document_id || meta.task_instance_id || meta.time_entry_id || '',
            `"${JSON.stringify(meta).replace(/"/g, '""')}"`
          );
        }
        
        return base;
      });

      const csvContent = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `timeline-export-${clientName || clientId}-${format(new Date(), 'yyyy-MM-dd')}.csv`;
      link.click();
      URL.revokeObjectURL(url);

      toast({ title: 'CSV exported successfully' });
      onOpenChange(false);
    } catch (error: any) {
      console.error('CSV export error:', error);
      toast({
        title: 'Export failed',
        description: error.message,
        variant: 'destructive'
      });
    } finally {
      setExporting(null);
    }
  };

  const exportPDF = async () => {
    setExporting('pdf');
    try {
      const { data, error } = await supabase.functions.invoke('export-client-timeline-pdf', {
        body: {
          tenant_id: tenantId,
          client_id: parseInt(clientId),
          client_name: clientName || `Client ${clientId}`,
          from_date: fromDate.toISOString(),
          to_date: toDate.toISOString(),
          event_types: selectedTypes.length > 0 ? selectedTypes : null
        }
      });

      if (error) throw error;

      // data should be base64 PDF
      if (data?.pdf) {
        const byteCharacters = atob(data.pdf);
        const byteNumbers = new Array(byteCharacters.length);
        for (let i = 0; i < byteCharacters.length; i++) {
          byteNumbers[i] = byteCharacters.charCodeAt(i);
        }
        const byteArray = new Uint8Array(byteNumbers);
        const blob = new Blob([byteArray], { type: 'application/pdf' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `timeline-audit-${clientName || clientId}-${format(new Date(), 'yyyy-MM-dd')}.pdf`;
        link.click();
        URL.revokeObjectURL(url);
        
        toast({ title: 'PDF exported successfully' });
        onOpenChange(false);
      } else {
        throw new Error('No PDF data received');
      }
    } catch (error: any) {
      console.error('PDF export error:', error);
      toast({
        title: 'Export failed',
        description: error.message,
        variant: 'destructive'
      });
    } finally {
      setExporting(null);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Export Timeline</DialogTitle>
          <DialogDescription>
            Export client timeline events for audit or reporting purposes.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6">
          {/* Date Range */}
          <div className="space-y-3">
            <Label className="text-sm font-medium">Date Range</Label>
            <div className="flex flex-wrap gap-2 mb-3">
              {DATE_PRESETS.map(preset => (
                <Button
                  key={preset.days}
                  variant="outline"
                  size="sm"
                  onClick={() => applyPreset(preset.days)}
                  className="text-xs"
                >
                  {preset.label}
                </Button>
              ))}
            </div>
            <div className="flex gap-2">
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" className={cn("flex-1 justify-start text-left font-normal")}>
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {format(fromDate, 'PP')}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={fromDate}
                    onSelect={(d) => d && setFromDate(d)}
                  />
                </PopoverContent>
              </Popover>
              <span className="flex items-center text-muted-foreground">to</span>
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" className={cn("flex-1 justify-start text-left font-normal")}>
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {format(toDate, 'PP')}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="end">
                  <Calendar
                    mode="single"
                    selected={toDate}
                    onSelect={(d) => d && setToDate(d)}
                  />
                </PopoverContent>
              </Popover>
            </div>
          </div>

          {/* Event Types */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <Label className="text-sm font-medium">Event Types</Label>
              <div className="flex gap-2">
                <Button variant="ghost" size="sm" onClick={selectAll} className="text-xs h-6">
                  Select All
                </Button>
                <Button variant="ghost" size="sm" onClick={clearAll} className="text-xs h-6">
                  Clear
                </Button>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2 max-h-48 overflow-y-auto p-2 border rounded-md">
              {EVENT_TYPE_OPTIONS.map(option => (
                <label
                  key={option.value}
                  className="flex items-center gap-2 cursor-pointer text-sm"
                >
                  <Checkbox
                    checked={selectedTypes.includes(option.value)}
                    onCheckedChange={() => toggleType(option.value)}
                  />
                  {option.label}
                </label>
              ))}
            </div>
            <p className="text-xs text-muted-foreground">
              {selectedTypes.length === 0 ? 'All event types will be included' : `${selectedTypes.length} type(s) selected`}
            </p>
          </div>

          {/* Options */}
          <div className="flex items-center justify-between">
            <Label htmlFor="include-metadata" className="text-sm">Include metadata in export</Label>
            <Switch
              id="include-metadata"
              checked={includeMetadata}
              onCheckedChange={setIncludeMetadata}
            />
          </div>

          {/* Actions */}
          <div className="flex gap-3 pt-2">
            <Button
              variant="outline"
              className="flex-1"
              onClick={exportCSV}
              disabled={!!exporting}
            >
              {exporting === 'csv' ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Download className="h-4 w-4 mr-2" />
              )}
              Export CSV
            </Button>
            <Button
              className="flex-1"
              onClick={exportPDF}
              disabled={!!exporting}
            >
              {exporting === 'pdf' ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <FileText className="h-4 w-4 mr-2" />
              )}
              Export PDF
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}