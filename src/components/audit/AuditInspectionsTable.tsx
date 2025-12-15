import { useState, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Search, MoreHorizontal, FileText, ArrowUpDown, Settings, Calendar, Pencil, Trash2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';

export interface AuditInspection {
  id: number;
  template_id: number;
  template_name: string;
  conducted_by: string;
  conducted_by_name: string;
  conducted_by_avatar?: string;
  status: string;
  doc_number?: string;
  compliance_score?: number;
  started_at?: string;
  completed_at?: string;
  created_at: string;
}

interface AuditInspectionsTableProps {
  inspections: AuditInspection[];
  isLoading?: boolean;
  onEditInspection?: (inspection: AuditInspection) => void;
  onDeleteInspection?: (inspection: AuditInspection) => void;
}

export function AuditInspectionsTable({
  inspections,
  isLoading,
  onEditInspection,
  onDeleteInspection
}: AuditInspectionsTableProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'draft' | 'in_progress' | 'completed'>('all');
  const [statusSearchQuery, setStatusSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState<'created_at' | 'completed_at'>('created_at');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
  
  const filteredInspections = useMemo(() => {
    return inspections
      .filter(inspection => {
        const matchesSearch = 
          inspection.template_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
          (inspection.doc_number && inspection.doc_number.toLowerCase().includes(searchQuery.toLowerCase())) ||
          inspection.conducted_by_name.toLowerCase().includes(searchQuery.toLowerCase());
        const matchesStatus = statusFilter === 'all' || inspection.status === statusFilter;
        return matchesSearch && matchesStatus;
      })
      .sort((a, b) => {
        const dateA = new Date(sortBy === 'created_at' ? a.created_at : (a.completed_at || a.created_at)).getTime();
        const dateB = new Date(sortBy === 'created_at' ? b.created_at : (b.completed_at || b.created_at)).getTime();
        return sortOrder === 'desc' ? dateB - dateA : dateA - dateB;
      });
  }, [inspections, searchQuery, statusFilter, sortBy, sortOrder]);

  const statusOptions = [
    { value: 'all', label: 'All statuses' },
    { value: 'draft', label: 'Draft' },
    { value: 'in_progress', label: 'In Progress' },
    { value: 'completed', label: 'Completed' },
  ];

  const filteredStatusOptions = statusOptions.filter(option => 
    option.label.toLowerCase().includes(statusSearchQuery.toLowerCase())
  );

  const getStatusLabel = () => {
    const option = statusOptions.find(o => o.value === statusFilter);
    return option?.label || 'All statuses';
  };

  const formatDate = (dateString?: string) => {
    if (!dateString) return '-';
    return new Date(dateString).toLocaleDateString('en-AU', {
      day: 'numeric',
      month: 'short',
      year: 'numeric'
    });
  };

  const handleSort = (column: 'created_at' | 'completed_at') => {
    if (sortBy === column) {
      setSortOrder(sortOrder === 'desc' ? 'asc' : 'desc');
    } else {
      setSortBy(column);
      setSortOrder('desc');
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'completed':
        return (
          <Badge className="bg-green-500/10 text-green-600 hover:bg-green-500/20 border border-green-600 text-[0.75rem] py-[2px] px-[0.625rem] rounded-[11px]">
            Completed
          </Badge>
        );
      case 'in_progress':
        return (
          <Badge className="bg-blue-500/10 text-blue-600 hover:bg-blue-500/20 border border-blue-600 text-[0.75rem] py-[2px] px-[0.625rem] rounded-[11px]">
            In Progress
          </Badge>
        );
      default:
        return (
          <Badge variant="outline" className="text-[0.75rem] py-[2px] px-[0.625rem] rounded-[11px]">
            {status}
          </Badge>
        );
    }
  };

  return (
    <div className="space-y-4">
      {/* Header with search and filters */}
      <div className="flex flex-col md:flex-row gap-4">
        <div className="relative flex-1">
          <Search className="absolute left-4 top-1/2 transform -translate-y-1/2 h-5 w-5 text-muted-foreground/60" />
          <Input 
            placeholder="Search inspections..." 
            value={searchQuery} 
            onChange={e => setSearchQuery(e.target.value)} 
            className="pl-12 h-12 bg-card border-border/50 focus:border-primary/50 focus:ring-2 focus:ring-primary/20 rounded-lg font-medium placeholder:text-muted-foreground/50" 
          />
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
                <Input 
                  placeholder="Search..." 
                  value={statusSearchQuery} 
                  onChange={e => setStatusSearchQuery(e.target.value)} 
                  className="pl-9 h-9 text-sm rounded-md" 
                />
              </div>
              <div className="max-h-[200px] overflow-y-auto space-y-1">
                {filteredStatusOptions.map((option) => (
                  <div 
                    key={option.value}
                    className={cn(
                      "px-4 py-2.5 text-sm font-medium cursor-pointer rounded-md transition-all flex items-center gap-2", 
                      statusFilter === option.value 
                        ? "bg-primary/10 text-primary" 
                        : "text-foreground hover:bg-muted"
                    )} 
                    onClick={() => {
                      setStatusFilter(option.value as 'all' | 'draft' | 'in_progress' | 'completed');
                      setStatusSearchQuery("");
                    }}
                  >
                    {option.label}
                  </div>
                ))}
                {filteredStatusOptions.length === 0 && statusSearchQuery && (
                  <p className="text-xs text-muted-foreground text-center py-2">No statuses found</p>
                )}
              </div>
            </PopoverContent>
          </Popover>
        </div>
      </div>

      {/* Results count */}
      <div className="text-sm text-muted-foreground">
        Inspections <span className="text-foreground font-medium">({filteredInspections.length} of {inspections.length})</span>
      </div>

      {/* Table */}
      <div className="rounded-lg border bg-card shadow-lg overflow-hidden">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="border-b-2 hover:bg-transparent">
                <TableHead className="bg-muted/30 font-semibold text-foreground h-14 whitespace-nowrap border-r border-border/50 text-center w-12">
                  #
                </TableHead>
                <TableHead className="bg-muted/30 font-semibold text-primary h-14 whitespace-nowrap border-r border-border/50 min-w-[250px]">
                  Inspection
                </TableHead>
                <TableHead className="bg-muted/30 font-semibold text-foreground h-14 whitespace-nowrap border-r border-border/50 text-center">
                  Doc Number
                </TableHead>
                <TableHead className="bg-muted/30 font-semibold text-foreground h-14 whitespace-nowrap border-r border-border/50 text-center">
                  Score
                </TableHead>
                <TableHead className="bg-muted/30 font-semibold text-foreground h-14 whitespace-nowrap border-r border-border/50 text-center">
                  Status
                </TableHead>
                <TableHead 
                  className="bg-muted/30 font-semibold text-foreground h-14 whitespace-nowrap border-r border-border/50 text-center cursor-pointer hover:bg-muted/50"
                  onClick={() => handleSort('created_at')}
                >
                  <div className="flex items-center justify-center gap-1">
                    Conducted By
                    {sortBy === 'created_at' && (
                      <ArrowUpDown className="h-3.5 w-3.5" />
                    )}
                  </div>
                </TableHead>
                <TableHead className="bg-muted/30 font-semibold text-foreground h-14 whitespace-nowrap text-center w-[100px]">
                  Actions
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center py-12 text-muted-foreground">
                    Loading inspections...
                  </TableCell>
                </TableRow>
              ) : filteredInspections.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center py-12">
                    <FileText className="h-10 w-10 mx-auto mb-3 text-muted-foreground/50" />
                    <p className="text-muted-foreground">No inspections found</p>
                  </TableCell>
                </TableRow>
              ) : (
                filteredInspections.map((inspection, index) => (
                  <TableRow 
                    key={inspection.id} 
                    className={cn(
                      'group transition-all duration-200 border-b border-border/50', 
                      index % 2 === 0 ? 'bg-background' : 'bg-muted/20', 
                      'hover:bg-primary/5'
                    )}
                  >
                    <TableCell className="py-5 border-r border-border/50 text-center text-muted-foreground font-medium">
                      {index + 1}
                    </TableCell>
                    <TableCell className="py-5 border-r border-border/50 min-w-[250px]">
                      <div>
                        <p className="font-semibold text-foreground">
                          {inspection.template_name}
                        </p>
                        <div className="flex items-center gap-1 text-xs text-muted-foreground mt-1">
                          <Calendar className="h-3 w-3" />
                          <span>{formatDate(inspection.created_at)}</span>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className="py-5 border-r border-border/50 text-center whitespace-nowrap text-muted-foreground">
                      {inspection.doc_number ? `#${inspection.id} ${inspection.doc_number}` : '-'}
                    </TableCell>
                    <TableCell className="py-5 border-r border-border/50 text-center whitespace-nowrap">
                      {inspection.compliance_score !== undefined && inspection.compliance_score !== null ? (
                        <Badge 
                          className={cn(
                            "text-[0.75rem] py-[2px] px-[0.625rem] rounded-[11px]",
                            inspection.compliance_score >= 80 
                              ? "bg-green-500/10 text-green-600 border border-green-600" 
                              : inspection.compliance_score >= 50 
                                ? "bg-yellow-500/10 text-yellow-600 border border-yellow-600"
                                : "bg-red-500/10 text-red-600 border border-red-600"
                          )}
                        >
                          {inspection.compliance_score.toFixed(0)}%
                        </Badge>
                      ) : (
                        <span className="text-muted-foreground">-</span>
                      )}
                    </TableCell>
                    <TableCell className="py-5 border-r border-border/50 text-center whitespace-nowrap">
                      {getStatusBadge(inspection.status)}
                    </TableCell>
                    <TableCell className="py-5 border-r border-border/50 text-center">
                      <div className="flex items-center justify-center gap-2">
                        <Avatar className="h-7 w-7">
                          <AvatarImage src={inspection.conducted_by_avatar} />
                          <AvatarFallback className="text-xs bg-primary/10 text-primary">
                            {inspection.conducted_by_name?.split(' ').map(n => n[0]).join('').toUpperCase() || '?'}
                          </AvatarFallback>
                        </Avatar>
                        <span className="text-sm text-foreground">{inspection.conducted_by_name}</span>
                      </div>
                    </TableCell>
                    <TableCell className="py-5 px-4 text-center whitespace-nowrap">
                      <div className="flex items-center justify-center gap-1">
                        <Button 
                          variant="ghost" 
                          size="icon" 
                          className="h-8 w-8 text-muted-foreground hover:text-primary hover:bg-primary/10"
                          onClick={() => onEditInspection?.(inspection)}
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button 
                          variant="ghost" 
                          size="icon" 
                          className="h-8 w-8 text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                          onClick={() => onDeleteInspection?.(inspection)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </div>
    </div>
  );
}
