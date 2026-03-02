import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { RichTextEditor } from '@/components/ui/rich-text-editor';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { Send, Eye, Loader2, Pencil } from 'lucide-react';
import DOMPurify from 'dompurify';

interface ComposeEmailDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  tenantId: number;
  packageId?: number;
  stageInstanceId?: number;
  emailInstanceId?: number;
  defaultTo: string;
  defaultSubject: string;
  defaultBody: string;
  emailName?: string;
  onSent?: () => void;
}

export function ComposeEmailDialog({
  open,
  onOpenChange,
  tenantId,
  packageId,
  stageInstanceId,
  emailInstanceId,
  defaultTo,
  defaultSubject,
  defaultBody,
  emailName,
  onSent,
}: ComposeEmailDialogProps) {
  const { profile } = useAuth();
  const { toast } = useToast();
  const [to, setTo] = useState(defaultTo);
  const [cc, setCc] = useState('');
  const [bcc, setBcc] = useState('');
  const [subject, setSubject] = useState(defaultSubject);
  const [body, setBody] = useState(defaultBody);
  const [sending, setSending] = useState(false);
  const [previewing, setPreviewing] = useState(false);
  const [preview, setPreview] = useState<{ subject: string; body_html: string; to: string } | null>(null);
  const [activeTab, setActiveTab] = useState<string>('compose');

  useEffect(() => {
    if (open) {
      // Build signature from current user profile
      const senderName = [profile?.first_name, profile?.last_name].filter(Boolean).join(' ');
      const senderRole = profile?.job_title || '';
      const senderEmail = profile?.email || '';
      const signatureLines = [
        '',
        '<br/><br/>Regards,<br/>',
        senderName ? `<strong>${senderName}</strong><br/>` : '',
        senderRole ? `${senderRole}<br/>` : '',
        senderEmail ? `${senderEmail}` : '',
      ].join('');

      const bodyWithSig = defaultBody + signatureLines;
      setTo(defaultTo);
      setSubject(defaultSubject);
      setBody(bodyWithSig);
      setCc('');
      setBcc('');
      setPreview(null);
      setActiveTab('compose');
    }
  }, [open, defaultTo, defaultSubject, defaultBody, profile]);

  const callEdgeFunction = async (dryRun: boolean) => {
    const { data: session } = await supabase.auth.getSession();
    const res = await fetch(
      `https://yxkgdalkbrriasiyyrwk.supabase.co/functions/v1/send-composed-email`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session?.session?.access_token}`,
        },
        body: JSON.stringify({
          tenant_id: tenantId,
          package_id: packageId,
          stage_instance_id: stageInstanceId,
          email_instance_id: emailInstanceId,
          to,
          cc: cc || undefined,
          bcc: bcc || undefined,
          subject,
          body_html: body,
          dry_run: dryRun,
        }),
      }
    );
    return res.json();
  };

  const handlePreview = async () => {
    setPreviewing(true);
    try {
      const result = await callEdgeFunction(true);
      if (result.success && result.preview) {
        setPreview(result.preview);
        setActiveTab('preview');
      } else {
        toast({ title: 'Preview failed', description: result.error || 'Unknown error', variant: 'destructive' });
      }
    } catch (e: any) {
      toast({ title: 'Error', description: e.message, variant: 'destructive' });
    } finally {
      setPreviewing(false);
    }
  };

  const handleSend = async () => {
    if (!to.trim()) {
      toast({ title: 'Missing recipient', description: 'Please enter a To address.', variant: 'destructive' });
      return;
    }
    setSending(true);
    try {
      const result = await callEdgeFunction(false);
      if (result.success) {
        toast({ title: 'Email Sent', description: result.message || 'Email sent successfully.' });
        onSent?.();
        onOpenChange(false);
      } else {
        toast({ title: 'Send failed', description: result.error || 'Unknown error', variant: 'destructive' });
      }
    } catch (e: any) {
      toast({ title: 'Error', description: e.message, variant: 'destructive' });
    } finally {
      setSending(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[90vw] w-full max-h-[95vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Send className="h-5 w-5" />
            Compose Email
            {emailName && <Badge variant="outline" className="text-xs font-normal">{emailName}</Badge>}
          </DialogTitle>
        </DialogHeader>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 min-h-0 flex flex-col">
          <TabsList className="w-full justify-start">
            <TabsTrigger value="compose" className="gap-1.5">
              <Pencil className="h-3.5 w-3.5" />
              Compose
            </TabsTrigger>
            <TabsTrigger value="preview" className="gap-1.5" disabled={!preview}>
              <Eye className="h-3.5 w-3.5" />
              Preview
            </TabsTrigger>
          </TabsList>

          <TabsContent value="compose" className="flex-1 overflow-auto space-y-3 mt-3">
            <div className="grid grid-cols-[60px_1fr] items-center gap-2">
              <Label className="text-right text-sm font-semibold">To:</Label>
              <Input value={to} onChange={e => setTo(e.target.value)} placeholder="recipient@example.com" />
            </div>
            <div className="grid grid-cols-[60px_1fr] items-center gap-2">
              <Label className="text-right text-sm font-semibold">CC:</Label>
              <Input value={cc} onChange={e => setCc(e.target.value)} placeholder="" />
            </div>
            <div className="grid grid-cols-[60px_1fr] items-center gap-2">
              <Label className="text-right text-sm font-semibold">BCC:</Label>
              <Input value={bcc} onChange={e => setBcc(e.target.value)} placeholder="" />
            </div>
            <div className="grid grid-cols-[60px_1fr] items-center gap-2">
              <Label className="text-right text-sm font-semibold">Subject:</Label>
              <Input value={subject} onChange={e => setSubject(e.target.value)} />
            </div>
            <div className="flex-1 min-h-0">
              <Label className="text-sm font-semibold mb-1 block">Body:</Label>
              <RichTextEditor
                value={body}
                onChange={setBody}
              />
              <div className="mt-2 space-y-1">
                <p className="text-xs text-muted-foreground">
                  <span className="font-medium">Tenant fields:</span> {'{{ClientName}}'}, {'{{FirstName}}'}, {'{{ABN}}'}, {'{{TradingName}}'}, etc.
                </p>
                <p className="text-xs text-muted-foreground">
                  <span className="font-medium">Contextual fields:</span>{' '}
                  {'<<CSCName>>'}, {'<<CSCEmail>>'}, {'<<PackageName>>'}, {'<<PackageCode>>'}, {'<<SenderName>>'}, {'<<SenderEmail>>'}, {'<<SenderRole>>'}
                </p>
              </div>
            </div>
          </TabsContent>

          <TabsContent value="preview" className="flex-1 overflow-auto mt-3">
            {preview ? (
              <div className="space-y-3">
                <div className="grid grid-cols-[60px_1fr] items-center gap-2">
                  <span className="text-right text-sm font-semibold text-muted-foreground">To:</span>
                  <span className="text-sm">{preview.to}</span>
                </div>
                <div className="grid grid-cols-[60px_1fr] items-center gap-2">
                  <span className="text-right text-sm font-semibold text-muted-foreground">Subject:</span>
                  <span className="text-sm font-medium">{preview.subject}</span>
                </div>
                <div className="border rounded-md p-4 bg-background">
                  <div
                    className="prose prose-sm max-w-none"
                    dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(preview.body_html) }}
                  />
                </div>
              </div>
            ) : (
              <p className="text-muted-foreground text-sm text-center py-8">
                Click "Preview" to see the rendered email with merge fields resolved.
              </p>
            )}
          </TabsContent>
        </Tabs>

        <DialogFooter className="flex items-center gap-2 pt-3 border-t">
          <Button variant="outline" onClick={handlePreview} disabled={previewing || sending}>
            {previewing ? <Loader2 className="h-4 w-4 animate-spin mr-1.5" /> : <Eye className="h-4 w-4 mr-1.5" />}
            Preview
          </Button>
          <Button onClick={handleSend} disabled={sending || !to.trim()}>
            {sending ? <Loader2 className="h-4 w-4 animate-spin mr-1.5" /> : <Send className="h-4 w-4 mr-1.5" />}
            Send
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
