import { useState, useCallback } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { useClientTenant } from '@/contexts/ClientTenantContext';
import { useCreateSuggestItem } from '@/hooks/useSuggestItems';
import { useSuggestDropdowns } from '@/hooks/useSuggestDropdowns';
import { useSpeechToText } from '@/hooks/useSpeechToText';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Loader2, Mic, MicOff, Sparkles, ArrowLeft } from 'lucide-react';
import { toast } from '@/hooks/use-toast';

export default function ClientNewSuggestionPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useAuth();
  const { activeTenantId } = useClientTenant();
  const createItem = useCreateSuggestItem();
  const dropdowns = useSuggestDropdowns();
  const { isRecording, isSupported, interimTranscript, startRecording, stopRecording } = useSpeechToText();

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [titleGeneratedByAi, setTitleGeneratedByAi] = useState(false);
  const [extractingTitle, setExtractingTitle] = useState(false);
  const [typeId, setTypeId] = useState('');
  const [sourcePageUrl, setSourcePageUrl] = useState(location.state?.sourcePageUrl ?? window.location.pathname);
  const [sourcePageLabel, setSourcePageLabel] = useState(location.state?.sourcePageLabel ?? '');
  const [sourceArea, setSourceArea] = useState(location.state?.sourceArea ?? '');
  const [sourceComponent, setSourceComponent] = useState(location.state?.sourceComponent ?? '');

  const defaultStatusId = dropdowns.statuses.find(s => s.code === 'new')?.id ?? '';
  const defaultPriorityId = dropdowns.priorities.find(p => p.code === 'medium')?.id ?? '';
  const defaultImpactId = dropdowns.impactRatings.find(i => i.code === 'medium')?.id ?? '';
  const defaultReleaseStatusId = dropdowns.releaseStatuses.find(r => r.code === 'not_released')?.id ?? '';

  const handleDictation = useCallback(() => {
    if (isRecording) {
      stopRecording();
    } else {
      startRecording((text) => setDescription(prev => prev ? `${prev} ${text}` : text));
    }
  }, [isRecording, startRecording, stopRecording]);

  const handleGenerateTitle = async () => {
    if (!description.trim() || description.trim().length < 5) {
      toast({ title: 'Enter a description first', variant: 'destructive' });
      return;
    }
    setExtractingTitle(true);
    try {
      const { data, error } = await supabase.functions.invoke('extract-suggest-title', {
        body: { content: description.trim() },
      });
      if (error) throw error;
      if (data?.title) {
        setTitle(data.title);
        setTitleGeneratedByAi(true);
      }
    } catch {
      toast({ title: 'Could not generate title', variant: 'destructive' });
    } finally {
      setExtractingTitle(false);
    }
  };

  const handleSubmit = async () => {
    if (!title.trim() || !description.trim() || !typeId) {
      toast({ title: 'Please fill in required fields', variant: 'destructive' });
      return;
    }
    if (!activeTenantId || !user) {
      toast({ title: 'Unable to determine tenant', variant: 'destructive' });
      return;
    }
    if (!defaultStatusId || !defaultPriorityId || !defaultImpactId || !defaultReleaseStatusId) {
      toast({ title: 'Default settings not loaded — please retry', variant: 'destructive' });
      return;
    }

    const result = await createItem.mutateAsync({
      tenant_id: activeTenantId,
      title: title.trim(),
      description: description.trim(),
      title_generated_by_ai: titleGeneratedByAi,
      suggest_item_type_id: typeId,
      suggest_status_id: defaultStatusId,
      suggest_priority_id: defaultPriorityId,
      suggest_impact_rating_id: defaultImpactId,
      suggest_release_status_id: defaultReleaseStatusId,
      reported_by: user.id,
      created_by: user.id,
      updated_by: user.id,
      source_page_url: sourcePageUrl || null,
      source_page_label: sourcePageLabel || null,
      source_area: sourceArea || null,
      source_component: sourceComponent || null,
    });

    if (result?.id) {
      supabase.functions.invoke('notify-suggestion-submitted', {
        body: { suggest_item_id: result.id },
      }).catch(() => toast({ title: 'Notification could not be sent', variant: 'destructive' }));
      navigate(`/client/suggestions/${result.id}`);
    }
  };

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => navigate('/client/suggestions')}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <h1 className="text-2xl font-bold text-foreground">New Suggestion</h1>
      </div>

      <Card>
        <CardContent className="pt-6 space-y-5">
          <div className="space-y-2">
            <Label>Description *</Label>
            <div className="relative">
              <Textarea
                placeholder="Describe the suggestion, issue, or improvement…"
                value={description + (interimTranscript ? ` ${interimTranscript}` : '')}
                onChange={e => { setDescription(e.target.value); setTitleGeneratedByAi(false); }}
                rows={5}
                className="pr-12"
              />
              {isSupported && (
                <Button type="button" variant={isRecording ? 'destructive' : 'ghost'} size="icon"
                  className="absolute right-2 top-2" onClick={handleDictation}
                  title={isRecording ? 'Stop recording' : 'Start dictation'}>
                  {isRecording ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
                </Button>
              )}
            </div>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label>Title *</Label>
              <Button type="button" variant="outline" size="sm" onClick={handleGenerateTitle}
                disabled={extractingTitle || !description.trim()} className="gap-1.5 text-xs">
                {extractingTitle ? <Loader2 className="h-3 w-3 animate-spin" /> : <Sparkles className="h-3 w-3" />}
                Generate Title
              </Button>
            </div>
            <Input placeholder="Title for this item" value={title}
              onChange={e => { setTitle(e.target.value); setTitleGeneratedByAi(false); }} />
          </div>

          <div className="space-y-2">
            <Label>Type *</Label>
            <Select value={typeId} onValueChange={setTypeId}>
              <SelectTrigger><SelectValue placeholder="Select type" /></SelectTrigger>
              <SelectContent>
                {dropdowns.itemTypes.map(t => <SelectItem key={t.id} value={t.id}>{t.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          <details className="text-sm">
            <summary className="cursor-pointer text-muted-foreground font-medium">Source Page Context</summary>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-3">
              <div className="space-y-1">
                <Label className="text-xs">Page URL</Label>
                <Input value={sourcePageUrl} onChange={e => setSourcePageUrl(e.target.value)} className="text-xs" />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Page Label</Label>
                <Input value={sourcePageLabel} onChange={e => setSourcePageLabel(e.target.value)} className="text-xs" />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Area</Label>
                <Input value={sourceArea} onChange={e => setSourceArea(e.target.value)} className="text-xs" />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Component</Label>
                <Input value={sourceComponent} onChange={e => setSourceComponent(e.target.value)} className="text-xs" />
              </div>
            </div>
          </details>

          <div className="flex justify-end gap-3 pt-2">
            <Button variant="outline" onClick={() => navigate('/client/suggestions')}>Cancel</Button>
            <Button onClick={handleSubmit} disabled={createItem.isPending}>
              {createItem.isPending && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
              Save Suggestion
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
