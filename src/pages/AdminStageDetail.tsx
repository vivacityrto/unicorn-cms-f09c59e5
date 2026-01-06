import { useParams, Link } from 'react-router-dom';
import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useRBAC } from '@/hooks/useRBAC';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { ArrowLeft, Layers, ShieldCheck, ShieldX, Construction } from 'lucide-react';

interface StageData {
  id: number;
  title: string;
  short_name: string | null;
  description: string | null;
  stage_type: string;
  stage_key: string;
  is_certified: boolean;
  certified_notes: string | null;
}

export default function AdminStageDetail() {
  const { stage_id } = useParams<{ stage_id: string }>();
  const { isSuperAdmin } = useRBAC();
  const [stage, setStage] = useState<StageData | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (stage_id) {
      fetchStage();
    }
  }, [stage_id]);

  const fetchStage = async () => {
    try {
      setIsLoading(true);
      const { data, error } = await supabase
        .from('documents_stages')
        .select('id, title, short_name, description, stage_type, stage_key, is_certified, certified_notes')
        .eq('id', parseInt(stage_id!))
        .single();

      if (error) throw error;
      setStage(data);
    } catch (error) {
      console.error('Failed to fetch stage:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const getStageTypeColor = (stageType: string) => {
    switch (stageType) {
      case 'onboarding':
        return 'bg-blue-500/10 text-blue-600 border-blue-500/20';
      case 'delivery':
      case 'documentation':
        return 'bg-emerald-500/10 text-emerald-600 border-emerald-500/20';
      case 'support':
        return 'bg-purple-500/10 text-purple-600 border-purple-500/20';
      case 'offboarding':
        return 'bg-amber-500/10 text-amber-600 border-amber-500/20';
      default:
        return 'bg-muted text-muted-foreground border-border';
    }
  };

  // Access denied for non-SuperAdmins
  if (!isSuperAdmin) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-center space-y-4">
          <ShieldX className="h-16 w-16 mx-auto text-destructive/50" />
          <h2 className="text-xl font-semibold">Access Denied</h2>
          <p className="text-muted-foreground">
            You need Super Admin privileges to access this page.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 p-6 animate-fade-in">
      {/* Back Button */}
      <div>
        <Button
          variant="ghost"
          asChild
          className="gap-2 hover:bg-muted"
        >
          <Link to="/admin/stages">
            <ArrowLeft className="h-4 w-4" />
            Back to Stages
          </Link>
        </Button>
      </div>

      {/* Stage Header */}
      {isLoading ? (
        <div className="space-y-4">
          <Skeleton className="h-8 w-[300px]" />
          <Skeleton className="h-5 w-[200px]" />
        </div>
      ) : stage ? (
        <div className="space-y-4">
          <div className="flex items-center gap-3 flex-wrap">
            <Layers className="h-7 w-7" />
            <h1 className="text-[28px] font-bold">{stage.title}</h1>
            <Badge
              variant="outline"
              className={`text-xs capitalize ${getStageTypeColor(stage.stage_type)}`}
            >
              {stage.stage_type}
            </Badge>
            {stage.is_certified && (
              <Badge className="bg-emerald-500/10 text-emerald-600 border-emerald-500/20">
                <ShieldCheck className="h-3 w-3 mr-1" />
                Certified
              </Badge>
            )}
          </div>
          
          {stage.stage_key && (
            <p className="text-sm text-muted-foreground font-mono">
              Key: {stage.stage_key}
            </p>
          )}

          {stage.description && (
            <p className="text-muted-foreground max-w-2xl">{stage.description}</p>
          )}
        </div>
      ) : (
        <div className="text-center py-8">
          <p className="text-muted-foreground">Stage not found</p>
        </div>
      )}

      {/* Coming in Phase 2 */}
      <div className="rounded-lg border-2 border-dashed border-muted-foreground/30 bg-muted/30 p-12">
        <div className="text-center space-y-4">
          <Construction className="h-16 w-16 mx-auto text-muted-foreground/50" />
          <h2 className="text-xl font-semibold text-muted-foreground">
            Stage Editor Coming in Phase 2
          </h2>
          <p className="text-muted-foreground max-w-md mx-auto">
            The full stage editor with tasks, emails, documents, and configuration
            options will be available in the next phase.
          </p>
        </div>
      </div>
    </div>
  );
}
