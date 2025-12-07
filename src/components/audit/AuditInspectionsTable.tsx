import { useState, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Search, MoreHorizontal, FileText, ArrowUpDown, Settings, ArrowRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Link } from 'react-router-dom';

export interface AuditInspection {
  id: number;
  audit_title: string;
  client_name: string;
  client_rto_id?: string;
  client_logo?: string;
  status: string;
  open_actions: number;
  closed_actions: number;
  doc_number?: number;
  score?: number;
  started_at?: string;
  completed_at?: string;
  created_at: string;
}

interface AuditInspectionsTableProps {
  inspections: AuditInspection[];
  isLoading?: boolean;
  onContinue?: (inspection: AuditInspection) => void;
  onViewReport?: (inspection: AuditInspection) => void;
  onDeleteInspection?: (inspection: AuditInspection) => void;
}

export function AuditInspectionsTable({
  inspections,
  isLoading,
  onContinue,
  onViewReport,
  onDeleteInspection
}: AuditInspectionsTableProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'draft' | 'in_progress' | 'complete'>('all');
  const [statusSearchQuery, setStatusSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState<'started_at' | 'completed_at'>('started_at');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
  
  const filteredInspections = useMemo(() => {
    return inspections
      .filter(inspection => {
        const matchesSearch = 
          inspection.client_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
          inspection.audit_title.toLowerCase().includes(searchQuery.toLowerCase()) ||
          (inspection.client_rto_id && inspection.client_rto_id.includes(searchQuery));
        const matchesStatus = statusFilter === 'all' || inspection.status === statusFilter;
        return matchesSearch && matchesStatus;
      })
      .sort((a, b) => {
        const dateA = new Date(sortBy === 'started_at' ? (a.started_at || a.created_at) : (a.completed_at || a.created_at)).getTime();
        const dateB = new Date(sortBy === 'started_at' ? (b.started_at || b.created_at) : (b.completed_at || b.created_at)).getTime();
        return sortOrder === 'desc' ? dateB - dateA : dateA - dateB;
      });
  }, [inspections, searchQuery, statusFilter, sortBy, sortOrder]);

  // Group inspections by date
  const groupedInspections = useMemo(() => {
    const groups: { [key: string]: AuditInspection[] } = {};
    filteredInspections.forEach(inspection => {
      const date = new Date(inspection.started_at || inspection.created_at);
      const dateKey = date.toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' });
      if (!groups[dateKey]) {
        groups[dateKey] = [];
      }
      groups[dateKey].push(inspection);
    });
    return groups;
  }, [filteredInspections]);

  const statusOptions = [
    { value: 'all', label: 'All statuses' },
    { value: 'draft', label: 'Draft' },
    { value: 'in_progress', label: 'In Progress' },
    { value: 'complete', label: 'Complete' },
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

  const formatActionsDisplay = (open: number, closed: number) => {
    if (open === 0 && closed === 0) return '-';
    if (closed === 0) return `${open} Open`;
    if (open === 0) return `${closed} Closed`;
    return `${open} Open, ${closed} Closed`;
  };

  const handleSort = (column: 'started_at' | 'completed_at') => {
    if (sortBy === column) {
      setSortOrder(sortOrder === 'desc' ? 'asc' : 'desc');
    } else {
      setSortBy(column);
      setSortOrder('desc');
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
                      setStatusFilter(option.value as 'all' | 'draft' | 'in_progress' | 'complete');
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
                <TableHead className="bg-muted/30 font-semibold text-primary h-14 whitespace-nowrap border-r border-border/50 min-w-[300px]">
                  Inspection
                </TableHead>
                <TableHead className="bg-muted/30 font-semibold text-foreground h-14 whitespace-nowrap border-r border-border/50 text-center">
                  Actions
                </TableHead>
                <TableHead className="bg-muted/30 font-semibold text-foreground h-14 whitespace-nowrap border-r border-border/50 text-center">
                  Doc number
                </TableHead>
                <TableHead className="bg-muted/30 font-semibold text-primary h-14 whitespace-nowrap border-r border-border/50 text-center">
                  Score
                </TableHead>
                <TableHead 
                  className="bg-muted/30 font-semibold text-primary h-14 whitespace-nowrap border-r border-border/50 text-center cursor-pointer hover:bg-muted/50"
                  onClick={() => handleSort('started_at')}
                >
                  <div className="flex items-center justify-center gap-1">
                    Conducted
                    {sortBy === 'started_at' && (
                      <ArrowUpDown className="h-3.5 w-3.5" />
                    )}
                  </div>
                </TableHead>
                <TableHead 
                  className="bg-muted/30 font-semibold text-primary h-14 whitespace-nowrap border-r border-border/50 text-center cursor-pointer hover:bg-muted/50"
                  onClick={() => handleSort('completed_at')}
                >
                  <div className="flex items-center justify-center gap-1">
                    Completed
                  </div>
                </TableHead>
                <TableHead className="bg-muted/30 font-semibold text-foreground h-14 whitespace-nowrap text-center w-[140px]">
                  <div className="flex items-center justify-center gap-2">
                    <Settings className="h-4 w-4 text-muted-foreground" />
                  </div>
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
                Object.entries(groupedInspections).map(([dateGroup, groupInspections]) => (
                  <>
                    {/* Date Group Header */}
                    <TableRow key={`header-${dateGroup}`} className="bg-muted/10 hover:bg-muted/10">
                      <TableCell colSpan={7} className="py-3 font-semibold text-foreground text-sm">
                        {dateGroup}
                      </TableCell>
                    </TableRow>
                    {/* Inspection Rows */}
                    {groupInspections.map((inspection, index) => (
                      <TableRow 
                        key={inspection.id} 
                        className={cn(
                          'group transition-all duration-200 border-b border-border/50', 
                          index % 2 === 0 ? 'bg-background' : 'bg-muted/20', 
                          'hover:bg-primary/5 animate-fade-in'
                        )}
                      >
                        <TableCell className="py-5 border-r border-border/50 min-w-[300px] pr-8">
                          <div className="flex items-center gap-3">
                            <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0 overflow-hidden">
                              {inspection.client_logo ? (
                                <img src={inspection.client_logo} alt="" className="h-full w-full object-cover" />
                              ) : (
                                <span className="text-xs font-bold text-primary">viva</span>
                              )}
                            </div>
                            <div className="min-w-0">
                              <p className="font-semibold text-foreground truncate">
                                {inspection.client_name}
                                {inspection.client_rto_id && (
                                  <span className="text-primary"> / {inspection.client_rto_id}</span>
                                )}
                              </p>
                              <p className="text-[13px] text-muted-foreground truncate mt-0.5">
                                {inspection.audit_title}
                              </p>
                            </div>
                          </div>
                        </TableCell>
                        <TableCell className="py-5 border-r border-border/50 text-center whitespace-nowrap text-muted-foreground">
                          {formatActionsDisplay(inspection.open_actions, inspection.closed_actions)}
                        </TableCell>
                        <TableCell className="py-5 border-r border-border/50 text-center whitespace-nowrap text-muted-foreground">
                          {inspection.doc_number || '-'}
                        </TableCell>
                        <TableCell className="py-5 border-r border-border/50 text-center whitespace-nowrap text-muted-foreground">
                          {inspection.score !== undefined ? `${inspection.score.toFixed(2)}%` : '-'}
                        </TableCell>
                        <TableCell className="py-5 border-r border-border/50 text-center whitespace-nowrap text-muted-foreground">
                          {formatDate(inspection.started_at)}
                        </TableCell>
                        <TableCell className="py-5 border-r border-border/50 text-center whitespace-nowrap text-muted-foreground">
                          {formatDate(inspection.completed_at)}
                        </TableCell>
                        <TableCell className="py-5 px-4 text-center whitespace-nowrap">
                          <div className="flex items-center justify-center gap-2">
                            {inspection.status === 'complete' ? (
                              <Link to={`/audits/${inspection.id}/report`}>
                                <Button 
                                  variant="link" 
                                  size="sm" 
                                  className="text-primary hover:text-primary/80 p-0 h-auto font-medium"
                                >
                                  View report
                                </Button>
                              </Link>
                            ) : (
                              <Link to={`/audits/${inspection.id}`}>
                                <Button 
                                  variant="link" 
                                  size="sm" 
                                  className="text-primary hover:text-primary/80 p-0 h-auto font-medium"
                                >
                                  Continue
                                </Button>
                              </Link>
                            )}
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button variant="ghost" size="icon" className="h-8 w-8">
                                  <MoreHorizontal className="h-4 w-4" />
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end" className="bg-popover border border-border shadow-lg z-50">
                                <DropdownMenuItem asChild>
                                  <Link to={`/audits/${inspection.id}`}>
                                    <ArrowRight className="h-4 w-4 mr-2" />
                                    Open inspection
                                  </Link>
                                </DropdownMenuItem>
                                {inspection.status === 'complete' && (
                                  <DropdownMenuItem asChild>
                                    <Link to={`/audits/${inspection.id}/report`}>
                                      <FileText className="h-4 w-4 mr-2" />
                                      View report
                                    </Link>
                                  </DropdownMenuItem>
                                )}
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </div>
    </div>
  );
}
