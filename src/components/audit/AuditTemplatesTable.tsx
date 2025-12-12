import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Search, FileText, Play, Pencil, Trash2, Users, CheckCircle, Lock, FileEdit, ArrowUpDown, Calendar } from 'lucide-react';
import { cn } from '@/lib/utils';
export interface AuditTemplateCreator {
  user_uuid: string;
  first_name: string | null;
  last_name: string | null;
  avatar_url: string | null;
}

export interface AuditTemplate {
  id: string;
  name: string;
  created_at?: string;
  last_published?: string;
  access: 'all_users' | 'restricted';
  status: 'active' | 'locked' | 'draft';
  icon_url?: string;
  created_by?: string;
  creator?: AuditTemplateCreator | null;
}
interface AuditTemplatesTableProps {
  templates: AuditTemplate[];
  isLoading?: boolean;
  onCreateTemplate?: () => void;
  onBrowseLibrary?: () => void;
  onStartInspection?: (template: AuditTemplate) => void;
  onEditTemplate?: (template: AuditTemplate) => void;
  onDuplicateTemplate?: (template: AuditTemplate) => void;
  onDeleteTemplate?: (template: AuditTemplate) => void;
}
export function AuditTemplatesTable({
  templates,
  isLoading,
  onCreateTemplate,
  onBrowseLibrary,
  onStartInspection,
  onEditTemplate,
  onDuplicateTemplate,
  onDeleteTemplate
}: AuditTemplatesTableProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'locked' | 'draft'>('all');
  const [statusSearchQuery, setStatusSearchQuery] = useState('');
  const filteredTemplates = templates.filter(template => {
    const matchesSearch = template.name.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesStatus = statusFilter === 'all' || template.status === statusFilter;
    return matchesSearch && matchesStatus;
  });
  const statusOptions = [{
    value: 'all',
    label: 'All statuses',
    icon: null
  }, {
    value: 'active',
    label: 'Active',
    icon: CheckCircle,
    color: 'text-green-600'
  }, {
    value: 'locked',
    label: 'Locked',
    icon: Lock,
    color: 'text-amber-600'
  }, {
    value: 'draft',
    label: 'Draft',
    icon: FileEdit,
    color: 'text-blue-600'
  }];
  const filteredStatusOptions = statusOptions.filter(option => option.label.toLowerCase().includes(statusSearchQuery.toLowerCase()));
  const getStatusLabel = () => {
    const option = statusOptions.find(o => o.value === statusFilter);
    return option?.label || 'All statuses';
  };
  const getStatusBadge = (status: AuditTemplate['status']) => {
    switch (status) {
      case 'active':
        return <Badge className="bg-green-500/10 text-green-600 hover:bg-green-500/20 border border-green-600 text-[0.75rem] py-[2px] px-[0.625rem] rounded-[11px] gap-1">
            <CheckCircle className="h-3 w-3" />
            Active
          </Badge>;
      case 'locked':
        return <Badge className="bg-amber-500/10 text-amber-600 hover:bg-amber-500/20 border border-amber-600 text-[0.75rem] py-[2px] px-[0.625rem] rounded-[11px] gap-1">
            <Lock className="h-3 w-3" />
            Locked
          </Badge>;
      case 'draft':
        return <Badge className="bg-blue-500/10 text-blue-600 hover:bg-blue-500/20 border border-blue-600 text-[0.75rem] py-[2px] px-[0.625rem] rounded-[11px] gap-1">
            <FileEdit className="h-3 w-3" />
            Draft
          </Badge>;
      default:
        return null;
    }
  };
  const formatDate = (dateString?: string) => {
    if (!dateString) return '-';
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / (1000 * 60));
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins} minute${diffMins !== 1 ? 's' : ''} ago`;
    if (diffHours < 24) return `${diffHours} hour${diffHours !== 1 ? 's' : ''} ago`;
    if (diffDays < 7) return `${diffDays} day${diffDays !== 1 ? 's' : ''} ago`;
    return date.toLocaleDateString('en-AU', {
      day: 'numeric',
      month: 'short',
      year: 'numeric'
    });
  };
  return <div className="space-y-4">
      {/* Header with search and actions */}
      <div className="flex flex-col md:flex-row gap-4">
        <div className="relative flex-1">
          <Search className="absolute left-4 top-1/2 transform -translate-y-1/2 h-5 w-5 text-muted-foreground/60" />
          <Input placeholder="Search templates..." value={searchQuery} onChange={e => setSearchQuery(e.target.value)} className="pl-12 h-12 bg-card border-border/50 focus:border-primary/50 focus:ring-2 focus:ring-primary/20 rounded-lg font-medium placeholder:text-muted-foreground/50" />
        </div>
        <div className="flex items-center gap-2">
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" className="w-[180px] h-12 bg-card border-border/50 hover:bg-muted hover:border-primary/30 font-semibold rounded-lg shadow-sm justify-between">
                <span className="text-foreground">{getStatusLabel()}</span>
                <ArrowUpDown className="ml-2 h-4 w-4 text-muted-foreground/60" />
              </Button>
            </PopoverTrigger>
            <PopoverContent className="p-2 min-w-[220px] rounded-lg shadow-lg border-border/50 bg-popover z-50" align="start">
              <div className="relative mb-2">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input placeholder="Search..." value={statusSearchQuery} onChange={e => setStatusSearchQuery(e.target.value)} className="pl-9 h-9 text-sm rounded-md" />
              </div>
              <div className="max-h-[200px] overflow-y-auto space-y-1">
                {filteredStatusOptions.map(option => {
                const Icon = option.icon;
                return <div key={option.value} className={cn("px-4 py-2.5 text-sm font-medium cursor-pointer rounded-md transition-all flex items-center gap-2", statusFilter === option.value ? "bg-primary/10 text-primary" : "text-foreground hover:bg-muted")} onClick={() => {
                  setStatusFilter(option.value as 'all' | 'active' | 'locked' | 'draft');
                  setStatusSearchQuery("");
                }}>
                      {Icon && <Icon className={cn("h-4 w-4", option.color)} />}
                      {option.label}
                    </div>;
              })}
                {filteredStatusOptions.length === 0 && statusSearchQuery && <p className="text-xs text-muted-foreground text-center py-2">No statuses found</p>}
              </div>
            </PopoverContent>
          </Popover>
        </div>
      </div>

      {/* Results count */}
      <div className="text-sm text-muted-foreground">
        Templates <span className="text-foreground font-medium">({filteredTemplates.length} of {templates.length})</span>
      </div>

      {/* Table */}
      <div className="rounded-lg border bg-card shadow-lg overflow-hidden">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="border-b-2 hover:bg-transparent">
                <TableHead className="bg-muted/30 font-semibold text-foreground h-14 whitespace-nowrap border-r border-border/50 text-center w-[80px]">
                  ID
                </TableHead>
                <TableHead className="bg-muted/30 font-semibold text-foreground h-14 whitespace-nowrap border-r border-border/50 min-w-[300px]">
                  Template
                </TableHead>
                <TableHead className="bg-muted/30 font-semibold text-foreground h-14 whitespace-nowrap border-r border-border/50 text-center">
                  Last published
                </TableHead>
                <TableHead className="bg-muted/30 font-semibold text-foreground h-14 whitespace-nowrap border-r border-border/50 text-center">
                  Access
                </TableHead>
                <TableHead className="bg-muted/30 font-semibold text-foreground h-14 whitespace-nowrap border-r border-border/50 text-center">
                  Status
                </TableHead>
                <TableHead className="bg-muted/30 font-semibold text-foreground h-14 whitespace-nowrap border-r border-border/50 text-center">
                  Created by
                </TableHead>
                <TableHead className="bg-muted/30 font-semibold text-foreground h-14 whitespace-nowrap text-center">
                  Actions
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? <TableRow>
                  <TableCell colSpan={7} className="text-center py-12 text-muted-foreground">
                    Loading templates...
                  </TableCell>
                </TableRow> : filteredTemplates.length === 0 ? <TableRow>
                  <TableCell colSpan={7} className="text-center py-12">
                    <FileText className="h-10 w-10 mx-auto mb-3 text-muted-foreground/50" />
                    <p className="text-muted-foreground">No templates found</p>
                    <Button variant="link" onClick={onCreateTemplate} className="mt-2">
                      Create your first template
                    </Button>
                  </TableCell>
                </TableRow> : filteredTemplates.map((template, index) => <TableRow key={template.id} className={cn('group transition-all duration-200 border-b border-border/50', index % 2 === 0 ? 'bg-background' : 'bg-muted/20', 'hover:bg-primary/5 animate-fade-in')}>
                    <TableCell className="py-6 border-r border-border/50 text-center w-[80px]">
                      <span className="font-mono text-sm text-muted-foreground">{template.id}</span>
                    </TableCell>
                    <TableCell className="py-6 border-r border-border/50 min-w-[300px] pr-8">
                      <div className="flex items-center gap-3">
                        
                        <div className="min-w-0">
                          <p className="font-semibold text-foreground truncate">{template.name}</p>
                          {template.created_at && <p className="text-[13px] text-muted-foreground truncate mt-1 flex items-center gap-1.5">
                              <Calendar className="h-3.5 w-3.5" />
                              Created: {new Date(template.created_at).toLocaleDateString('en-AU', {
                        day: '2-digit',
                        month: '2-digit',
                        year: 'numeric'
                      }).replace(/\//g, '/')}
                            </p>}
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className="py-6 border-r border-border/50 text-center whitespace-nowrap text-muted-foreground">
                      {formatDate(template.last_published)}
                    </TableCell>
                    <TableCell className="py-6 border-r border-border/50 text-center whitespace-nowrap">
                      <div className="flex items-center justify-center gap-1.5 text-muted-foreground">
                        <Users className="h-4 w-4" />
                        <span className="text-sm">
                          {template.access === 'all_users' ? 'All users' : 'Restricted'}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell className="py-6 border-r border-border/50 text-center whitespace-nowrap">
                      {getStatusBadge(template.status)}
                    </TableCell>
                    <TableCell className="py-6 border-r border-border/50 text-center whitespace-nowrap">
                      {template.creator ? (
                        <TooltipProvider>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <div className="flex items-center justify-center">
                                <Avatar className="h-8 w-8 cursor-pointer">
                                  <AvatarImage src={template.creator.avatar_url || undefined} alt={`${template.creator.first_name || ''} ${template.creator.last_name || ''}`} />
                                  <AvatarFallback className="bg-primary/10 text-primary text-xs">
                                    {(template.creator.first_name?.[0] || '') + (template.creator.last_name?.[0] || '') || '?'}
                                  </AvatarFallback>
                                </Avatar>
                              </div>
                            </TooltipTrigger>
                            <TooltipContent>
                              <p>{`${template.creator.first_name || ''} ${template.creator.last_name || ''}`.trim() || 'Unknown'}</p>
                            </TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                      ) : (
                        <span className="text-muted-foreground">-</span>
                      )}
                    </TableCell>
                    <TableCell className="py-6 px-4 text-center whitespace-nowrap">
                      <div className="flex items-center justify-center gap-2">
                        <Button variant="outline" size="sm" onClick={() => onStartInspection?.(template)} className="whitespace-nowrap hover:bg-[hsl(196deg_100%_93.53%)] hover:text-black hover:border-[#00000052]">
                          <Play className="h-3.5 w-3.5 mr-1.5" />
                          Start inspection
                        </Button>
                        <Button variant="ghost" size="icon" className="h-8 w-8 hover:bg-muted" onClick={() => onEditTemplate?.(template)}>
                          <Pencil className="h-4 w-4 text-muted-foreground hover:text-foreground" />
                        </Button>
                        <Button variant="ghost" size="icon" className="h-8 w-8 hover:bg-destructive/10" onClick={() => onDeleteTemplate?.(template)}>
                          <Trash2 className="h-4 w-4 text-muted-foreground hover:text-destructive" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>)}
            </TableBody>
          </Table>
        </div>
      </div>
    </div>;
}