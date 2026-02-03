import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { 
  AlertTriangle, 
  Flame, 
  Clock, 
  TrendingUp,
  ExternalLink,
  Briefcase,
  Plus
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { cn } from '@/lib/utils';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { supabase } from '@/integrations/supabase/client';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';

export interface IDSSummary {
  newThisWeek: number;
  escalatedCount: number;
  criticalImpact: number;
  stuckOver14Days: number;
  recentItems: {
    id: string;
    title: string;
    type: 'risk' | 'opportunity';
    impact: string;
    status: string;
    isEscalated: boolean;
    isStuck: boolean;
    ageInDays: number;
    seatName: string | null;
    ownerName: string;
  }[];
}

interface IDSMasterPanelProps {
  summary: IDSSummary;
  tenantId?: number;
}

const VIVACITY_TENANT_ID = 6372;

export function IDSMasterPanel({ summary, tenantId = VIVACITY_TENANT_ID }: IDSMasterPanelProps) {
  const [isQuickAddOpen, setIsQuickAddOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [newItem, setNewItem] = useState({
    title: '',
    description: '',
    item_type: 'risk' as 'risk' | 'opportunity',
    impact: 'Medium' as 'Low' | 'Medium' | 'High' | 'Critical',
  });
  const queryClient = useQueryClient();

  const handleQuickAdd = async () => {
    if (!newItem.title.trim()) {
      toast.error('Title is required');
      return;
    }

    setIsSubmitting(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      
      const { error } = await supabase.from('eos_issues').insert({
        tenant_id: tenantId,
        title: newItem.title.trim(),
        description: newItem.description.trim() || null,
        item_type: newItem.item_type,
        impact: newItem.impact,
        status: 'Open',
        source: 'ro_page',
        created_by: user?.id,
      });

      if (error) throw error;

      toast.success(`${newItem.item_type === 'risk' ? 'Risk' : 'Opportunity'} added to IDS`);
      setIsQuickAddOpen(false);
      setNewItem({ title: '', description: '', item_type: 'risk', impact: 'Medium' });
      
      // Invalidate queries to refresh data
      queryClient.invalidateQueries({ queryKey: ['leadership-dashboard'] });
      queryClient.invalidateQueries({ queryKey: ['eos-issues'] });
    } catch (err) {
      console.error('Error adding IDS item:', err);
      toast.error('Failed to add item');
    } finally {
      setIsSubmitting(false);
    }
  };

  const tiles = [
    { 
      label: 'New This Week', 
      value: summary.newThisWeek, 
      icon: TrendingUp,
      color: 'text-blue-600',
      bgColor: 'bg-blue-50 dark:bg-blue-950/30',
    },
    { 
      label: 'Escalated', 
      value: summary.escalatedCount, 
      icon: Flame,
      color: 'text-destructive',
      bgColor: summary.escalatedCount > 0 ? 'bg-destructive/10' : 'bg-muted',
    },
    { 
      label: 'Critical Impact', 
      value: summary.criticalImpact, 
      icon: AlertTriangle,
      color: 'text-orange-600',
      bgColor: summary.criticalImpact > 0 ? 'bg-orange-50 dark:bg-orange-950/30' : 'bg-muted',
    },
    { 
      label: 'Stuck >14 Days', 
      value: summary.stuckOver14Days, 
      icon: Clock,
      color: 'text-amber-600',
      bgColor: summary.stuckOver14Days > 0 ? 'bg-amber-50 dark:bg-amber-950/30' : 'bg-muted',
    },
  ];

  return (
    <>
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-4">
          <div>
            <CardTitle>IDS Command Center</CardTitle>
            <CardDescription>Risks & Opportunities requiring attention</CardDescription>
          </div>
          <div className="flex items-center gap-2">
            <Button 
              variant="outline" 
              size="sm" 
              onClick={() => setIsQuickAddOpen(true)}
              className="gap-1"
            >
              <Plus className="h-4 w-4" />
              Quick Add
            </Button>
            <Link 
              to="/eos/risks-opportunities"
              className="text-sm text-primary hover:underline flex items-center gap-1"
            >
              View All
              <ExternalLink className="h-3 w-3" />
            </Link>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Summary Tiles */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {tiles.map((tile) => (
              <div 
                key={tile.label}
                className={cn('p-3 rounded-lg border', tile.bgColor)}
              >
                <div className="flex items-center gap-2 mb-1">
                  <tile.icon className={cn('h-4 w-4', tile.color)} />
                  <span className="text-xs text-muted-foreground">{tile.label}</span>
                </div>
                <div className={cn('text-2xl font-bold', tile.value > 0 && tile.color)}>
                  {tile.value}
                </div>
              </div>
            ))}
          </div>

          {/* Recent Items */}
          {summary.recentItems.length > 0 && (
            <div className="space-y-2">
              <h4 className="text-sm font-medium text-muted-foreground">Attention Required</h4>
              {summary.recentItems.slice(0, 5).map((item) => (
                <Link
                  key={item.id}
                  to={`/eos/risks-opportunities?item=${item.id}`}
                  className={cn(
                    'flex items-center gap-3 p-3 rounded-lg border transition-colors hover:bg-muted/50',
                    item.isEscalated && 'border-destructive/50 bg-destructive/5',
                    item.isStuck && !item.isEscalated && 'border-amber-300 dark:border-amber-700 bg-amber-50/50 dark:bg-amber-950/20'
                  )}
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      {item.isEscalated && <Flame className="h-3.5 w-3.5 text-destructive shrink-0" />}
                      {item.isStuck && !item.isEscalated && <Clock className="h-3.5 w-3.5 text-amber-600 shrink-0" />}
                      <span className="font-medium text-sm truncate">{item.title}</span>
                    </div>
                    <div className="flex items-center gap-2 text-xs text-muted-foreground mt-1">
                      {item.seatName ? (
                        <span className="flex items-center gap-1">
                          <Briefcase className="h-3 w-3" />
                          {item.seatName}
                        </span>
                      ) : (
                        <span className="text-amber-600">No seat</span>
                      )}
                      <span>·</span>
                      <span>{item.ownerName}</span>
                      {item.ageInDays > 0 && (
                        <>
                          <span>·</span>
                          <span>{item.ageInDays}d old</span>
                        </>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <Badge 
                      variant={item.type === 'risk' ? 'destructive' : 'secondary'} 
                      className="text-xs"
                    >
                      {item.type === 'risk' ? 'Risk' : 'Opp'}
                    </Badge>
                    <Badge variant="outline" className="text-xs">
                      {item.impact}
                    </Badge>
                  </div>
                </Link>
              ))}
            </div>
          )}

          {summary.recentItems.length === 0 && (
            <div className="text-center py-6 text-muted-foreground">
              <AlertTriangle className="h-8 w-8 mx-auto mb-2 opacity-50" />
              <p>No issues requiring immediate attention</p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Quick Add Dialog */}
      <Dialog open={isQuickAddOpen} onOpenChange={setIsQuickAddOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Quick Add to IDS</DialogTitle>
            <DialogDescription>
              Add a new risk or opportunity to the master IDS register
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4 py-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="item_type">Type</Label>
                <Select 
                  value={newItem.item_type} 
                  onValueChange={(v) => setNewItem({ ...newItem, item_type: v as 'risk' | 'opportunity' })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="risk">Risk</SelectItem>
                    <SelectItem value="opportunity">Opportunity</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="impact">Impact</Label>
                <Select 
                  value={newItem.impact} 
                  onValueChange={(v) => setNewItem({ ...newItem, impact: v as 'Low' | 'Medium' | 'High' | 'Critical' })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Low">Low</SelectItem>
                    <SelectItem value="Medium">Medium</SelectItem>
                    <SelectItem value="High">High</SelectItem>
                    <SelectItem value="Critical">Critical</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="title">Title *</Label>
              <Input
                id="title"
                placeholder="Brief description of the issue..."
                value={newItem.title}
                onChange={(e) => setNewItem({ ...newItem, title: e.target.value })}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="description">Why It Matters</Label>
              <Textarea
                id="description"
                placeholder="Impact and context..."
                value={newItem.description}
                onChange={(e) => setNewItem({ ...newItem, description: e.target.value })}
                rows={3}
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setIsQuickAddOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleQuickAdd} disabled={isSubmitting}>
              {isSubmitting ? 'Adding...' : 'Add to IDS'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
