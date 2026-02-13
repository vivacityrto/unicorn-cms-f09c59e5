import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import {
  Sparkles, AlertTriangle, Check, Loader2,
  FileText, Users, BookOpen, GraduationCap, Clock
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { toast } from 'sonner';

interface DocFileExtractedFieldsProps {
  docFileId: string;
  tenantId: number;
  docType: 'tas' | 'trainer_matrix';
  /** If true, show the "Confirm and save to profile" button */
  allowConfirm?: boolean;
}

interface TasExtract {
  tas_extract_id: string;
  extracted_json: Record<string, unknown>;
  units: string[];
  delivery_mode: string | null;
  aqf_level: string | null;
  duration_weeks: number | null;
  confidence: number | null;
  created_at: string;
}

interface TrainerMatrixExtract {
  trainer_matrix_extract_id: string;
  extracted_json: Record<string, unknown>;
  trainers: Array<{
    trainer_name: string;
    qualifications: string[];
    units_assigned: string[];
    currency_status: string;
  }>;
  trainer_unit_links: unknown[];
  confidence: number | null;
  created_at: string;
}

export function DocFileExtractedFields({
  docFileId,
  tenantId,
  docType,
  allowConfirm = false,
}: DocFileExtractedFieldsProps) {
  const queryClient = useQueryClient();
  const [confirmed, setConfirmed] = useState(false);

  // Fetch existing TAS extract
  const { data: tasExtract, isLoading: loadingTas } = useQuery({
    queryKey: ['tas-extract', docFileId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('tas_extracts')
        .select('*')
        .eq('doc_file_id', docFileId)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return data as TasExtract | null;
    },
    enabled: docType === 'tas',
  });

  // Fetch existing Trainer Matrix extract
  const { data: trainerExtract, isLoading: loadingTrainer } = useQuery({
    queryKey: ['trainer-matrix-extract', docFileId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('trainer_matrix_extracts')
        .select('*')
        .eq('doc_file_id', docFileId)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return data as unknown as TrainerMatrixExtract | null;
    },
    enabled: docType === 'trainer_matrix',
  });

  // Extract mutation
  const extractMutation = useMutation({
    mutationFn: async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) throw new Error('Not authenticated');

      const response = await supabase.functions.invoke('extract-document-fields', {
        headers: { Authorization: `Bearer ${session.access_token}` },
        body: { doc_file_id: docFileId, tenant_id: tenantId, doc_type: docType },
      });

      if (response.error) throw response.error;
      return response.data;
    },
    onSuccess: () => {
      toast.success('Extraction complete');
      queryClient.invalidateQueries({ queryKey: ['tas-extract', docFileId] });
      queryClient.invalidateQueries({ queryKey: ['trainer-matrix-extract', docFileId] });
    },
    onError: (error) => {
      console.error('Extraction failed:', error);
      toast.error('Failed to extract fields');
    },
  });

  const isLoading = docType === 'tas' ? loadingTas : loadingTrainer;
  const hasExtract = docType === 'tas' ? !!tasExtract : !!trainerExtract;

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground p-4">
        <Loader2 className="h-4 w-4 animate-spin" />
        Loading extracted fields...
      </div>
    );
  }

  // No extract yet — show extract button
  if (!hasExtract) {
    return (
      <div className="space-y-4 p-1">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-primary" />
            <span className="font-medium text-sm">Extracted Fields</span>
            <Badge variant="secondary" className="text-[10px]">
              {docType === 'tas' ? 'TAS' : 'Trainer Matrix'}
            </Badge>
          </div>
          <Button
            size="sm"
            variant="outline"
            onClick={() => extractMutation.mutate()}
            disabled={extractMutation.isPending}
            className="gap-2"
          >
            {extractMutation.isPending ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : (
              <Sparkles className="h-3 w-3" />
            )}
            Extract fields
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">
          No extraction yet. Click to extract structured fields from this document.
        </p>
      </div>
    );
  }

  // Render TAS extract
  if (docType === 'tas' && tasExtract) {
    return (
      <div className="space-y-4 p-1">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-primary" />
            <span className="font-medium text-sm">Extracted Fields</span>
            <Badge variant="secondary" className="text-[10px]">TAS</Badge>
            {tasExtract.confidence !== null && (
              <Badge variant="outline" className="text-[10px]">
                {Math.round(tasExtract.confidence * 100)}% confidence
              </Badge>
            )}
          </div>
        </div>

        <Alert className="border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/30">
          <AlertTriangle className="h-4 w-4 text-amber-600" />
          <AlertDescription className="text-xs text-amber-800 dark:text-amber-200">
            AI extraction — review before confirming. No data written to compliance tables.
          </AlertDescription>
        </Alert>

        {/* Units */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <BookOpen className="h-4 w-4" />
              Units of Competency
            </CardTitle>
          </CardHeader>
          <CardContent>
            {tasExtract.units.length === 0 ? (
              <p className="text-xs text-muted-foreground">No units extracted</p>
            ) : (
              <div className="flex flex-wrap gap-1">
                {tasExtract.units.map((unit, i) => (
                  <Badge key={i} variant="outline" className="text-xs">
                    {unit}
                  </Badge>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Metadata fields */}
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <span className="text-xs font-medium text-muted-foreground">Delivery Mode</span>
            <p className="text-sm">{tasExtract.delivery_mode || 'Not extracted'}</p>
          </div>
          <div className="space-y-1">
            <span className="text-xs font-medium text-muted-foreground">AQF Level</span>
            <p className="text-sm">{tasExtract.aqf_level || 'Not extracted'}</p>
          </div>
          <div className="space-y-1">
            <span className="text-xs font-medium text-muted-foreground flex items-center gap-1">
              <Clock className="h-3 w-3" /> Duration
            </span>
            <p className="text-sm">
              {tasExtract.duration_weeks ? `${tasExtract.duration_weeks} weeks` : 'Not extracted'}
            </p>
          </div>
        </div>

        {/* Full extracted JSON (collapsible) */}
        <ExtractedJsonView data={tasExtract.extracted_json} />

        <Separator />

        {/* Re-extract + Confirm */}
        <div className="flex gap-2">
          {allowConfirm && !confirmed && (
            <Button
              size="sm"
              onClick={() => {
                setConfirmed(true);
                toast.success('Extraction confirmed. Phase 1: no auto-write to compliance tables.');
              }}
              className="gap-2"
            >
              <Check className="h-3 w-3" />
              Confirm and save to profile
            </Button>
          )}
          {confirmed && (
            <Badge variant="default" className="gap-1">
              <Check className="h-3 w-3" /> Confirmed
            </Badge>
          )}
          <Button
            size="sm"
            variant="outline"
            onClick={() => extractMutation.mutate()}
            disabled={extractMutation.isPending}
            className="gap-2"
          >
            {extractMutation.isPending ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : (
              <Sparkles className="h-3 w-3" />
            )}
            Re-extract
          </Button>
        </div>
      </div>
    );
  }

  // Render Trainer Matrix extract
  if (docType === 'trainer_matrix' && trainerExtract) {
    return (
      <div className="space-y-4 p-1">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-primary" />
            <span className="font-medium text-sm">Extracted Fields</span>
            <Badge variant="secondary" className="text-[10px]">Trainer Matrix</Badge>
            {trainerExtract.confidence !== null && (
              <Badge variant="outline" className="text-[10px]">
                {Math.round(trainerExtract.confidence * 100)}% confidence
              </Badge>
            )}
          </div>
        </div>

        <Alert className="border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/30">
          <AlertTriangle className="h-4 w-4 text-amber-600" />
          <AlertDescription className="text-xs text-amber-800 dark:text-amber-200">
            AI extraction — review before confirming. No data written to compliance tables.
          </AlertDescription>
        </Alert>

        {/* Trainers */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <Users className="h-4 w-4" />
              Trainers ({trainerExtract.trainers.length})
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {trainerExtract.trainers.length === 0 ? (
              <p className="text-xs text-muted-foreground">No trainers extracted</p>
            ) : (
              trainerExtract.trainers.map((trainer, i) => (
                <div key={i} className="border rounded-md p-3 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="font-medium text-sm">{trainer.trainer_name}</span>
                    <Badge
                      variant={trainer.currency_status === 'current' ? 'default' : 'secondary'}
                      className="text-[10px]"
                    >
                      {trainer.currency_status || 'Unknown'}
                    </Badge>
                  </div>

                  {trainer.qualifications?.length > 0 && (
                    <div>
                      <span className="text-xs text-muted-foreground">Qualifications</span>
                      <div className="flex flex-wrap gap-1 mt-1">
                        {trainer.qualifications.map((q, j) => (
                          <Badge key={j} variant="outline" className="text-[10px]">
                            <GraduationCap className="h-2.5 w-2.5 mr-1" />
                            {q}
                          </Badge>
                        ))}
                      </div>
                    </div>
                  )}

                  {trainer.units_assigned?.length > 0 && (
                    <div>
                      <span className="text-xs text-muted-foreground">
                        Units ({trainer.units_assigned.length})
                      </span>
                      <div className="flex flex-wrap gap-1 mt-1">
                        {trainer.units_assigned.slice(0, 10).map((u, j) => (
                          <Badge key={j} variant="outline" className="text-[10px]">
                            {u}
                          </Badge>
                        ))}
                        {trainer.units_assigned.length > 10 && (
                          <Badge variant="secondary" className="text-[10px]">
                            +{trainer.units_assigned.length - 10} more
                          </Badge>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              ))
            )}
          </CardContent>
        </Card>

        {/* Full extracted JSON */}
        <ExtractedJsonView data={trainerExtract.extracted_json} />

        <Separator />

        {/* Re-extract + Confirm */}
        <div className="flex gap-2">
          {allowConfirm && !confirmed && (
            <Button
              size="sm"
              onClick={() => {
                setConfirmed(true);
                toast.success('Extraction confirmed. Phase 1: no auto-write to compliance tables.');
              }}
              className="gap-2"
            >
              <Check className="h-3 w-3" />
              Confirm and save to profile
            </Button>
          )}
          {confirmed && (
            <Badge variant="default" className="gap-1">
              <Check className="h-3 w-3" /> Confirmed
            </Badge>
          )}
          <Button
            size="sm"
            variant="outline"
            onClick={() => extractMutation.mutate()}
            disabled={extractMutation.isPending}
            className="gap-2"
          >
            {extractMutation.isPending ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : (
              <Sparkles className="h-3 w-3" />
            )}
            Re-extract
          </Button>
        </div>
      </div>
    );
  }

  return null;
}

// ============= Collapsible JSON viewer =============

function ExtractedJsonView({ data }: { data: Record<string, unknown> }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div>
      <Button
        size="sm"
        variant="ghost"
        className="text-xs p-0 h-auto"
        onClick={() => setExpanded(!expanded)}
      >
        <FileText className="h-3 w-3 mr-1" />
        {expanded ? 'Hide' : 'Show'} raw extracted JSON
      </Button>
      {expanded && (
        <pre className="mt-2 p-3 bg-muted rounded-md text-xs overflow-auto max-h-64">
          {JSON.stringify(data, null, 2)}
        </pre>
      )}
    </div>
  );
}
