import { useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

interface AnalysisResult {
  category: string;
  description: string;
  framework_type: 'RTO' | 'CRICOS' | 'GTO' | null;
  quality_area?: string;
  document_type: string;
  confidence: number;
  merge_fields: string[];
  dropdown_sources: Record<string, string[]>;
}

interface DocumentWithAnalysis {
  id: number;
  title: string;
  storage_path: string;
  status: 'pending' | 'analyzing' | 'completed' | 'failed' | 'skipped';
  result?: AnalysisResult;
  error?: string;
  accepted?: boolean;
  edited?: {
    category?: string;
    description?: string;
  };
}

export function useDocumentAIAnalysis() {
  const [analyzing, setAnalyzing] = useState(false);
  const [documents, setDocuments] = useState<DocumentWithAnalysis[]>([]);

  const analyzeDocument = useCallback(async (
    documentId: number, 
    storagePath?: string,
    filename?: string
  ): Promise<AnalysisResult | null> => {
    try {
      const { data, error } = await supabase.functions.invoke('analyze-document', {
        body: { 
          document_id: documentId,
          storage_path: storagePath,
          filename
        }
      });

      if (error) {
        console.error('Analysis error:', error);
        return null;
      }

      if (data.skipped) {
        return null;
      }

      return data as AnalysisResult;
    } catch (err) {
      console.error('Analysis error:', err);
      return null;
    }
  }, []);

  const analyzeMultiple = useCallback(async (
    docs: Array<{ id: number; title: string; storage_path: string }>
  ) => {
    setAnalyzing(true);
    
    // Initialize documents list
    const initialDocs: DocumentWithAnalysis[] = docs.map(d => ({
      id: d.id,
      title: d.title,
      storage_path: d.storage_path,
      status: 'pending'
    }));
    setDocuments(initialDocs);

    // Process documents in parallel (max 3 concurrent)
    const batchSize = 3;
    for (let i = 0; i < docs.length; i += batchSize) {
      const batch = docs.slice(i, i + batchSize);
      
      const promises = batch.map(async (doc) => {
        // Update status to analyzing
        setDocuments(prev => prev.map(d => 
          d.id === doc.id ? { ...d, status: 'analyzing' } : d
        ));

        try {
          const result = await analyzeDocument(doc.id, doc.storage_path, doc.title);
          
          // If analysis returned results, apply confidence scoring via RPC
          if (result) {
            try {
              // Call the RPC to apply AI analysis with confidence thresholds
              await supabase.rpc('apply_document_ai_analysis', {
                p_document_id: doc.id,
                p_category_confidence: result.confidence,
                p_description_confidence: result.confidence,
                p_suggested_category: result.category,
                p_suggested_description: result.description,
                p_reasoning: `Framework: ${result.framework_type || 'RTO'}. Type: ${result.document_type}. ${result.merge_fields.length} merge fields detected.`
              });
            } catch (rpcError) {
              console.error('RPC error applying AI analysis:', rpcError);
              // Continue even if RPC fails - the edge function already saved basic data
            }
          }
          
          setDocuments(prev => prev.map(d => 
            d.id === doc.id 
              ? { 
                  ...d, 
                  status: result ? 'completed' : 'skipped',
                  result: result || undefined
                } 
              : d
          ));
        } catch (error) {
          setDocuments(prev => prev.map(d => 
            d.id === doc.id 
              ? { ...d, status: 'failed', error: 'Analysis failed' } 
              : d
          ));
        }
      });

      await Promise.all(promises);
    }

    setAnalyzing(false);
  }, [analyzeDocument]);

  const updateDocumentEdit = useCallback((docId: number, edits: { category?: string; description?: string }) => {
    setDocuments(prev => prev.map(d => 
      d.id === docId 
        ? { ...d, edited: { ...d.edited, ...edits } } 
        : d
    ));
  }, []);

  const acceptSuggestion = useCallback((docId: number) => {
    setDocuments(prev => prev.map(d => 
      d.id === docId ? { ...d, accepted: true } : d
    ));
  }, []);

  const acceptAllSuggestions = useCallback(() => {
    setDocuments(prev => prev.map(d => ({ ...d, accepted: true })));
  }, []);

  const saveAcceptedSuggestions = useCallback(async () => {
    const acceptedDocs = documents.filter(d => d.accepted && (d.result || d.edited));
    
    if (acceptedDocs.length === 0) {
      toast.error('No documents to save');
      return false;
    }

    try {
      for (const doc of acceptedDocs) {
        const hasUserEdits = !!doc.edited?.category || !!doc.edited?.description;
        const category = doc.edited?.category || doc.result?.category;
        const description = doc.edited?.description || doc.result?.description;
        
        // Use the RPC to approve suggestions if no user edits
        if (!hasUserEdits && doc.result) {
          try {
            await supabase.rpc('approve_document_ai_suggestions', {
              p_document_id: doc.id,
              p_apply_category: true,
              p_apply_description: true
            });
          } catch (rpcError) {
            console.error('RPC error approving suggestions:', rpcError);
            // Fallback to direct update
            const updateData: Record<string, unknown> = {
              ai_status: 'auto_approved'
            };
            if (category) updateData.document_category = category;
            if (description) updateData.description = description;
            await supabase.from('documents').update(updateData).eq('id', doc.id);
          }
        } else {
          // User made edits - update directly and mark as user-edited
          const updateData: Record<string, unknown> = {
            ai_status: 'auto_approved'
          };
          if (category) {
            updateData.document_category = category;
            if (doc.edited?.category) updateData.user_edited_category = true;
          }
          if (description) {
            updateData.description = description;
            if (doc.edited?.description) updateData.user_edited_description = true;
          }
          
          if (Object.keys(updateData).length > 0) {
            const { error } = await supabase
              .from('documents')
              .update(updateData)
              .eq('id', doc.id);
            
            if (error) throw error;
          }
        }
      }

      toast.success(`Updated ${acceptedDocs.length} document(s)`);
      return true;
    } catch (error) {
      console.error('Save error:', error);
      toast.error('Failed to save document updates');
      return false;
    }
  }, [documents]);

  const reset = useCallback(() => {
    setDocuments([]);
    setAnalyzing(false);
  }, []);

  return {
    analyzing,
    documents,
    analyzeDocument,
    analyzeMultiple,
    updateDocumentEdit,
    acceptSuggestion,
    acceptAllSuggestions,
    saveAcceptedSuggestions,
    reset
  };
}

// Hook to check document stage usage
export function useDocumentStageUsage(documentId: number) {
  const [loading, setLoading] = useState(false);
  const [stageCount, setStageCount] = useState(0);
  const [stageNames, setStageNames] = useState<string[]>([]);

  const fetchUsage = useCallback(async () => {
    if (!documentId) return;
    
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('document_stage_usage')
        .select('stage_count, stage_names')
        .eq('document_id', documentId)
        .single();

      if (error && error.code !== 'PGRST116') throw error;

      setStageCount(data?.stage_count || 0);
      setStageNames(data?.stage_names || []);
    } catch (error) {
      console.error('Failed to fetch document usage:', error);
    } finally {
      setLoading(false);
    }
  }, [documentId]);

  return { loading, stageCount, stageNames, fetchUsage };
}
