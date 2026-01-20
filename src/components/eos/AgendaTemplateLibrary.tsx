import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { 
  Plus, Clock, Edit, Copy, Star, Archive, Lock,
  Calendar, Zap, Target
} from 'lucide-react';
import { useEosAgendaTemplates } from '@/hooks/useEosAgendaTemplates';
import { useRBAC } from '@/hooks/useRBAC';
import { AgendaTemplateEditor } from './AgendaTemplateEditor';
import { format } from 'date-fns';
import type { EosAgendaTemplate, MeetingType, EosAgendaSegment } from '@/types/eos';

interface AgendaTemplateLibraryProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const MEETING_TYPE_CONFIG: Record<MeetingType, { label: string; icon: typeof Calendar; color: string }> = {
  L10: { label: 'Level 10', icon: Zap, color: 'text-blue-600' },
  Quarterly: { label: 'Quarterly', icon: Target, color: 'text-purple-600' },
  Annual: { label: 'Annual', icon: Calendar, color: 'text-emerald-600' },
  Same_Page: { label: 'Same Page', icon: Calendar, color: 'text-amber-600' },
  Focus_Day: { label: 'Focus Day', icon: Calendar, color: 'text-orange-600' },
  Custom: { label: 'Custom', icon: Calendar, color: 'text-gray-600' },
};

export const AgendaTemplateLibrary = ({ open, onOpenChange }: AgendaTemplateLibraryProps) => {
  const { templates, isLoading, duplicateTemplate, setAsDefault, archiveTemplate } = useEosAgendaTemplates();
  const { isSuperAdmin, canAccessAdmin } = useRBAC();
  const [activeTab, setActiveTab] = useState<'all' | MeetingType>('all');
  const [editorOpen, setEditorOpen] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<EosAgendaTemplate | null>(null);

  const canManageTemplates = isSuperAdmin || canAccessAdmin();

  const calculateTotalDuration = (segments: EosAgendaSegment[]) => {
    return segments?.reduce((sum, s) => sum + (s.duration_minutes || 0), 0) || 0;
  };

  const formatDuration = (minutes: number) => {
    if (minutes < 60) return `${minutes} min`;
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    return mins > 0 ? `${hours}h ${mins}m` : `${hours}h`;
  };

  const filteredTemplates = templates?.filter(t => 
    activeTab === 'all' || t.meeting_type === activeTab
  ) || [];

  const handleEdit = (template: EosAgendaTemplate) => {
    setEditingTemplate(template);
    setEditorOpen(true);
  };

  const handleCreate = () => {
    setEditingTemplate(null);
    setEditorOpen(true);
  };

  const handleDuplicate = async (template: EosAgendaTemplate) => {
    await duplicateTemplate.mutateAsync(template.id);
  };

  const handleSetDefault = async (template: EosAgendaTemplate) => {
    await setAsDefault.mutateAsync({ id: template.id, meetingType: template.meeting_type });
  };

  const handleArchive = async (template: EosAgendaTemplate) => {
    await archiveTemplate.mutateAsync(template.id);
  };

  const renderTemplateCard = (template: EosAgendaTemplate) => {
    const config = MEETING_TYPE_CONFIG[template.meeting_type] || MEETING_TYPE_CONFIG.Custom;
    const Icon = config.icon;
    const duration = calculateTotalDuration(template.segments);
    const segmentCount = template.segments?.length || 0;

    return (
      <Card key={template.id} className="hover:shadow-md transition-shadow">
        <CardHeader className="pb-3">
          <div className="flex items-start justify-between">
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-1">
                <Icon className={`w-4 h-4 ${config.color}`} />
                <CardTitle className="text-base">{template.template_name}</CardTitle>
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                <Badge variant="outline" className="text-xs">
                  {config.label}
                </Badge>
                {template.is_system && (
                  <Badge variant="secondary" className="text-xs">
                    <Lock className="w-3 h-3 mr-1" />
                    System
                  </Badge>
                )}
                {template.is_default && (
                  <Badge className="text-xs bg-amber-100 text-amber-800 hover:bg-amber-100">
                    <Star className="w-3 h-3 mr-1" />
                    Default
                  </Badge>
                )}
              </div>
            </div>
          </div>
          {template.description && (
            <CardDescription className="mt-2 text-sm">
              {template.description}
            </CardDescription>
          )}
        </CardHeader>
        <CardContent className="pt-0">
          <div className="flex items-center gap-4 text-sm text-muted-foreground mb-4">
            <span className="flex items-center gap-1">
              <Clock className="w-4 h-4" />
              {formatDuration(duration)}
            </span>
            <span>{segmentCount} segments</span>
            {template.updated_at && (
              <span className="text-xs">
                Updated {format(new Date(template.updated_at), 'MMM d, yyyy')}
              </span>
            )}
          </div>

          {canManageTemplates && (
            <div className="flex items-center gap-2 flex-wrap">
              {template.is_system ? (
                <Button 
                  variant="outline" 
                  size="sm"
                  onClick={() => handleDuplicate(template)}
                  disabled={duplicateTemplate.isPending}
                >
                  <Copy className="w-4 h-4 mr-1" />
                  Duplicate to Edit
                </Button>
              ) : (
                <>
                  <Button 
                    variant="outline" 
                    size="sm"
                    onClick={() => handleEdit(template)}
                  >
                    <Edit className="w-4 h-4 mr-1" />
                    Edit
                  </Button>
                  <Button 
                    variant="ghost" 
                    size="sm"
                    onClick={() => handleDuplicate(template)}
                    disabled={duplicateTemplate.isPending}
                  >
                    <Copy className="w-4 h-4 mr-1" />
                    Duplicate
                  </Button>
                </>
              )}
              {!template.is_default && (
                <Button 
                  variant="ghost" 
                  size="sm"
                  onClick={() => handleSetDefault(template)}
                  disabled={setAsDefault.isPending}
                >
                  <Star className="w-4 h-4 mr-1" />
                  Set as Default
                </Button>
              )}
              {!template.is_system && (
                <Button 
                  variant="ghost" 
                  size="sm"
                  className="text-muted-foreground hover:text-destructive"
                  onClick={() => handleArchive(template)}
                  disabled={archiveTemplate.isPending}
                >
                  <Archive className="w-4 h-4 mr-1" />
                  Archive
                </Button>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    );
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-4xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-xl flex items-center gap-2">
              Agenda Template Library
            </DialogTitle>
            <p className="text-sm text-muted-foreground">
              Manage reusable agenda templates for EOS meetings. System templates cannot be modified but can be duplicated.
            </p>
          </DialogHeader>

          <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as typeof activeTab)} className="mt-4">
            <div className="flex items-center justify-between mb-4">
              <TabsList>
                <TabsTrigger value="all">All</TabsTrigger>
                <TabsTrigger value="L10">Level 10</TabsTrigger>
                <TabsTrigger value="Quarterly">Quarterly</TabsTrigger>
                <TabsTrigger value="Annual">Annual</TabsTrigger>
              </TabsList>

              {canManageTemplates && (
                <Button onClick={handleCreate}>
                  <Plus className="w-4 h-4 mr-2" />
                  Create Template
                </Button>
              )}
            </div>

            <TabsContent value={activeTab} className="mt-0">
              {isLoading ? (
                <div className="flex items-center justify-center py-12">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
                </div>
              ) : filteredTemplates.length > 0 ? (
                <div className="grid gap-4">
                  {filteredTemplates.map(renderTemplateCard)}
                </div>
              ) : (
                <div className="text-center py-12 text-muted-foreground">
                  <Calendar className="w-12 h-12 mx-auto mb-4 opacity-50" />
                  <p>No templates found for this category.</p>
                  {canManageTemplates && (
                    <Button variant="outline" className="mt-4" onClick={handleCreate}>
                      <Plus className="w-4 h-4 mr-2" />
                      Create First Template
                    </Button>
                  )}
                </div>
              )}
            </TabsContent>
          </Tabs>
        </DialogContent>
      </Dialog>

      <AgendaTemplateEditor
        open={editorOpen}
        onOpenChange={setEditorOpen}
        template={editingTemplate}
      />
    </>
  );
};
