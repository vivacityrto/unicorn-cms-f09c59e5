 import { useNavigate } from 'react-router-dom';
 import { formatDistanceToNow } from 'date-fns';
 import { FileText, ChevronRight } from 'lucide-react';
 import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
 import { Badge } from '@/components/ui/badge';
 import { Button } from '@/components/ui/button';
 import { Skeleton } from '@/components/ui/skeleton';
 import { useDashboardProcesses, DashboardProcess } from '@/hooks/useDashboardProcesses';
 import { cn } from '@/lib/utils';
 
 const statusStyles: Record<string, string> = {
   draft: 'bg-muted text-muted-foreground border-border',
   under_review: 'bg-yellow-500/10 text-yellow-600 border-yellow-500',
   approved: 'bg-green-500/10 text-green-600 border-green-500',
 };
 
 const categoryLabels: Record<string, string> = {
   eos: 'EOS',
   operations: 'Operations',
   compliance: 'Compliance',
   client_delivery: 'Client Delivery',
   sales_marketing: 'Sales & Mktg',
   finance: 'Finance',
   hr_people: 'HR & People',
   it_systems: 'IT Systems',
   governance: 'Governance',
   risk_management: 'Risk Mgmt',
 };
 
 function ProcessRow({ process }: { process: DashboardProcess }) {
   const navigate = useNavigate();
   const ownerName = [process.owner_first_name, process.owner_last_name]
     .filter(Boolean)
     .join(' ') || 'Unassigned';
 
   const statusLabel = process.status.replace('_', ' ');
   const categoryLabel = categoryLabels[process.category] || process.category;
 
   return (
     <button
       onClick={() => navigate(`/processes/${process.id}`)}
       className="w-full text-left flex items-start gap-3 p-3 rounded-lg border transition-colors hover:bg-muted/50"
     >
       <div className="flex-1 min-w-0">
         <div className="flex items-center gap-2 mb-1">
           <Badge
             variant="outline"
             className={cn('text-[10px] px-1.5 py-0 capitalize', statusStyles[process.status])}
           >
             {statusLabel}
           </Badge>
           <span className="font-medium text-sm truncate">{process.title}</span>
         </div>
         <div className="flex items-center gap-2 text-xs text-muted-foreground">
           <span className="truncate max-w-[140px]">{ownerName}</span>
           <span>•</span>
           <span>Updated {formatDistanceToNow(new Date(process.updated_at), { addSuffix: true })}</span>
         </div>
       </div>
       <span className="text-xs text-muted-foreground shrink-0">{categoryLabel}</span>
     </button>
   );
 }
 
 export function ProcessesWidget() {
   const navigate = useNavigate();
   const { processes, loading } = useDashboardProcesses();
 
   if (loading) {
     return (
       <Card>
         <CardHeader className="pb-3">
           <Skeleton className="h-5 w-36" />
         </CardHeader>
         <CardContent className="space-y-2">
           <Skeleton className="h-14 w-full" />
           <Skeleton className="h-14 w-full" />
           <Skeleton className="h-14 w-full" />
         </CardContent>
       </Card>
     );
   }
 
   return (
     <Card>
       <CardHeader className="pb-3">
         <div className="flex items-center justify-between">
           <div className="flex items-center gap-2">
             <FileText className="h-4 w-4 text-primary" />
             <CardTitle className="text-base">Process Documents</CardTitle>
           </div>
           <Button
             variant="ghost"
             size="sm"
             className="text-xs gap-1"
             onClick={() => navigate('/processes')}
           >
             View all
             <ChevronRight className="h-3 w-3" />
           </Button>
         </div>
       </CardHeader>
       <CardContent className="pt-0">
         <div className="space-y-2">
           {processes.length === 0 ? (
             <div className="text-center py-8 text-muted-foreground">
               <FileText className="h-8 w-8 mx-auto mb-2 opacity-50" />
               <p className="text-sm">No processes created yet.</p>
             </div>
           ) : (
             processes.map((process) => (
               <ProcessRow key={process.id} process={process} />
             ))
           )}
         </div>
       </CardContent>
     </Card>
   );
 }