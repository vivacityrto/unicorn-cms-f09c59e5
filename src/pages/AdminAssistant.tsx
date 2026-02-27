 import { useState, useEffect, useRef } from 'react';
 import { DashboardLayout } from '@/components/DashboardLayout';
 import { useAuth } from '@/hooks/useAuth';
 import { useRBAC } from '@/hooks/useRBAC';
 import { supabase } from '@/integrations/supabase/client';
 import { Button } from '@/components/ui/button';
 import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
 import { Input } from '@/components/ui/input';
 import { Textarea } from '@/components/ui/textarea';
 import { ScrollArea } from '@/components/ui/scroll-area';
 import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
 import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
 import { Badge } from '@/components/ui/badge';
 import { toast } from '@/hooks/use-toast';
 import { 
   MessageSquare, 
   Plus, 
   Send, 
   FileText, 
   ChevronDown, 
   ChevronRight,
   Search,
   Copy,
   Bot,
   User,
   Loader2,
   AlertTriangle,
   FileJson,
   Calendar
 } from 'lucide-react';
 import { format } from 'date-fns';
import { AssistantTestChecklist } from '@/components/admin/AssistantTestChecklist';
 
 interface Thread {
   id: string;
   title: string;
   created_at: string;
   updated_at: string;
 }
 
 interface Message {
   id: string;
   thread_id: string;
   role: 'user' | 'assistant' | 'system';
   content: string;
   sources_used?: any[];
   created_at: string;
 }
 
 interface Tenant {
   id: number;
   name: string;
   status: string;
 }
 
 const REPORT_TYPES = [
   { value: 'client_engagement_overview', label: 'Client Engagement Overview' },
   { value: 'package_utilisation_summary', label: 'Package Utilisation Summary' },
   { value: 'phase_progression_timeline', label: 'Stage Progression Timeline' },
   { value: 'decisions_approvals_log', label: 'Decisions and Approvals Log' },
   { value: 'risks_unresolved_actions', label: 'Risks and Unresolved Actions Summary' },
   { value: 'eos_engagement_summary', label: 'EOS Engagement Summary' },
 ];
 
 export default function AdminAssistant() {
   const { user } = useAuth();
   const { isSuperAdmin } = useRBAC();
   
   // Thread state
   const [threads, setThreads] = useState<Thread[]>([]);
   const [selectedThread, setSelectedThread] = useState<Thread | null>(null);
   const [messages, setMessages] = useState<Message[]>([]);
   const [threadSearch, setThreadSearch] = useState('');
   
   // Chat state
   const [inputMessage, setInputMessage] = useState('');
   const [isLoading, setIsLoading] = useState(false);
   
   // Report state
   const [reportType, setReportType] = useState<string>('');
   const [selectedTenant, setSelectedTenant] = useState<number | null>(null);
   const [tenants, setTenants] = useState<Tenant[]>([]);
   const [tenantSearch, setTenantSearch] = useState('');
   const [dateStart, setDateStart] = useState('');
   const [dateEnd, setDateEnd] = useState('');
   const [reportResult, setReportResult] = useState<any>(null);
   const [isGeneratingReport, setIsGeneratingReport] = useState(false);
   
   const messagesEndRef = useRef<HTMLDivElement>(null);
 
   // Load threads
   useEffect(() => {
    if (!isSuperAdmin) return;
     loadThreads();
     loadTenants();
  }, [isSuperAdmin]);
 
   // Load messages when thread changes
   useEffect(() => {
     if (selectedThread) {
       loadMessages(selectedThread.id);
     } else {
       setMessages([]);
     }
   }, [selectedThread]);
 
   // Scroll to bottom on new messages
   useEffect(() => {
     messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
   }, [messages]);
 
   async function loadThreads() {
     const { data, error } = await supabase
       .from('assistant_threads')
       .select('*')
       .order('updated_at', { ascending: false });
     
     if (error) {
       console.error('Error loading threads:', error);
       return;
     }
     
     setThreads(data || []);
   }
 
   async function loadMessages(threadId: string) {
     const { data, error } = await supabase
       .from('assistant_messages')
       .select('*')
       .eq('thread_id', threadId)
       .order('created_at', { ascending: true });
     
     if (error) {
       console.error('Error loading messages:', error);
       return;
     }
     
    // Cast role to the correct type
    const typedMessages: Message[] = (data || []).map(msg => ({
      ...msg,
      role: msg.role as 'user' | 'assistant' | 'system',
      sources_used: msg.sources_used as any[] | undefined,
    }));
    setMessages(typedMessages);
   }
 
   async function loadTenants() {
     const { data, error } = await supabase
       .from('tenants')
       .select('id, name, status')
       .order('name');
     
     if (error) {
       console.error('Error loading tenants:', error);
       return;
     }
     
     setTenants(data || []);
   }
 
  // Check access - render unauthorized view
  if (!isSuperAdmin) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center h-full">
          <Card className="max-w-md">
            <CardContent className="pt-6">
              <div className="flex flex-col items-center gap-4 text-center">
                <AlertTriangle className="h-12 w-12 text-destructive" />
                <h2 className="text-xl font-semibold">Not Authorised</h2>
                <p className="text-muted-foreground">
                  The AI Assistant is only available to SuperAdmins.
                </p>
              </div>
            </CardContent>
          </Card>
        </div>
      </DashboardLayout>
    );
  }
 
   async function createNewThread() {
     const { data, error } = await supabase
       .from('assistant_threads')
       .insert({ viewer_user_id: user?.id, title: 'New chat' })
       .select()
       .single();
     
     if (error) {
       toast({ title: 'Error creating thread', variant: 'destructive' });
       return;
     }
     
     setThreads(prev => [data, ...prev]);
     setSelectedThread(data);
     setMessages([]);
     setReportResult(null);
   }
 
   async function sendMessage() {
     if (!inputMessage.trim() || !selectedThread) return;
     
     setIsLoading(true);
     const userMessage = inputMessage;
     setInputMessage('');
     
     // Add user message to UI immediately
     const tempUserMessage: Message = {
       id: 'temp-user',
       thread_id: selectedThread.id,
       role: 'user',
       content: userMessage,
       created_at: new Date().toISOString(),
     };
     setMessages(prev => [...prev, tempUserMessage]);
     
     try {
       // Save user message
       const { data: savedUserMsg } = await supabase
         .from('assistant_messages')
         .insert({
           thread_id: selectedThread.id,
           role: 'user',
           content: userMessage,
         })
         .select()
         .single();
       
       // Call assistant API
       const { data: session } = await supabase.auth.getSession();
       const response = await fetch(
         `https://yxkgdalkbrriasiyyrwk.supabase.co/functions/v1/assistant-answer`,
         {
           method: 'POST',
           headers: {
             'Content-Type': 'application/json',
             'Authorization': `Bearer ${session?.session?.access_token}`,
           },
           body: JSON.stringify({
             type: 'chat',
             query: userMessage,
             threadId: selectedThread.id,
           }),
         }
       );
       
       if (!response.ok) {
         const errorData = await response.json();
         throw new Error(errorData.error || 'Failed to get response');
       }
       
       const result = await response.json();
       
       // Save assistant message
       const { data: savedAssistantMsg } = await supabase
         .from('assistant_messages')
         .insert({
           thread_id: selectedThread.id,
           role: 'assistant',
           content: result.answer,
           sources_used: result.sources,
         })
         .select()
         .single();
       
       // Update thread title if first message
       if (messages.length === 0) {
         const newTitle = userMessage.substring(0, 50) + (userMessage.length > 50 ? '...' : '');
         await supabase
           .from('assistant_threads')
           .update({ title: newTitle, updated_at: new Date().toISOString() })
           .eq('id', selectedThread.id);
         
         setSelectedThread(prev => prev ? { ...prev, title: newTitle } : null);
         loadThreads();
       }
       
       // Reload messages to get proper IDs
       loadMessages(selectedThread.id);
       
     } catch (error) {
       console.error('Error sending message:', error);
       toast({
         title: 'Error',
         description: error instanceof Error ? error.message : 'Failed to send message',
         variant: 'destructive',
       });
       // Remove temp message on error
       setMessages(prev => prev.filter(m => m.id !== 'temp-user'));
     } finally {
       setIsLoading(false);
     }
   }
 
   async function generateReport() {
     if (!reportType || !selectedTenant) {
       toast({ title: 'Please select a report type and client', variant: 'destructive' });
       return;
     }
     
     setIsGeneratingReport(true);
     setReportResult(null);
     
     try {
       const { data: session } = await supabase.auth.getSession();
       const response = await fetch(
         `https://yxkgdalkbrriasiyyrwk.supabase.co/functions/v1/assistant-answer`,
         {
           method: 'POST',
           headers: {
             'Content-Type': 'application/json',
             'Authorization': `Bearer ${session?.session?.access_token}`,
           },
           body: JSON.stringify({
             type: 'report',
             reportType,
             clientTenantId: selectedTenant,
             dateRange: dateStart || dateEnd ? { start: dateStart, end: dateEnd } : undefined,
           }),
         }
       );
       
       if (!response.ok) {
         const errorData = await response.json();
         throw new Error(errorData.error || 'Failed to generate report');
       }
       
       const result = await response.json();
       setReportResult(result);
       
       toast({ title: 'Report generated successfully' });
       
     } catch (error) {
       console.error('Error generating report:', error);
       toast({
         title: 'Error',
         description: error instanceof Error ? error.message : 'Failed to generate report',
         variant: 'destructive',
       });
     } finally {
       setIsGeneratingReport(false);
     }
   }
 
   function copyReportToClipboard() {
     if (!reportResult) return;
     navigator.clipboard.writeText(JSON.stringify(reportResult, null, 2));
     toast({ title: 'Report copied to clipboard' });
   }
 
   const filteredThreads = threads.filter(t => 
     t.title.toLowerCase().includes(threadSearch.toLowerCase())
   );
 
   const filteredTenants = tenants.filter(t =>
     t.name.toLowerCase().includes(tenantSearch.toLowerCase())
   );
 
   return (
     <DashboardLayout>
       <div className="flex h-[calc(100vh-120px)] gap-4 p-4">
         {/* Left Panel - Thread List */}
         <Card className="w-80 flex flex-col">
           <CardHeader className="pb-2">
             <div className="flex items-center justify-between">
               <CardTitle className="text-lg flex items-center gap-2">
                 <Bot className="h-5 w-5" />
                 AI Assistant
               </CardTitle>
               <Button size="sm" onClick={createNewThread}>
                 <Plus className="h-4 w-4 mr-1" />
                 New
               </Button>
             </div>
             <div className="relative mt-2">
               <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
               <Input
                 placeholder="Search chats..."
                 value={threadSearch}
                 onChange={(e) => setThreadSearch(e.target.value)}
                 className="pl-8"
               />
             </div>
           </CardHeader>
           <CardContent className="flex-1 overflow-hidden p-2">
             <ScrollArea className="h-full">
               <div className="space-y-1">
                 {filteredThreads.map(thread => (
                   <button
                     key={thread.id}
                     onClick={() => {
                       setSelectedThread(thread);
                       setReportResult(null);
                     }}
                     className={`w-full text-left p-3 rounded-lg transition-colors ${
                       selectedThread?.id === thread.id
                         ? 'bg-primary text-primary-foreground'
                         : 'hover:bg-muted'
                     }`}
                   >
                     <div className="flex items-center gap-2">
                       <MessageSquare className="h-4 w-4 flex-shrink-0" />
                       <span className="truncate text-sm">{thread.title}</span>
                     </div>
                     <div className="text-xs opacity-70 mt-1">
                       {format(new Date(thread.updated_at), 'MMM d, yyyy')}
                     </div>
                   </button>
                 ))}
               </div>
             </ScrollArea>
           </CardContent>
         </Card>
 
         {/* Right Panel - Conversation / Report */}
         <div className="flex-1 flex flex-col gap-4">
           {/* Messages Area */}
           <Card className="flex-1 flex flex-col overflow-hidden">
             <CardHeader className="pb-2 border-b">
               <CardTitle className="text-lg">
                 {selectedThread ? selectedThread.title : 'Select or create a chat'}
               </CardTitle>
             </CardHeader>
             <CardContent className="flex-1 overflow-hidden p-0">
               <ScrollArea className="h-full p-4">
                 {!selectedThread ? (
                   <div className="flex flex-col items-center justify-center h-full text-muted-foreground">
                     <Bot className="h-16 w-16 mb-4 opacity-50" />
                     <p>Create a new chat to get started</p>
                   </div>
                 ) : messages.length === 0 ? (
                   <div className="flex flex-col items-center justify-center h-full text-muted-foreground">
                     <MessageSquare className="h-12 w-12 mb-4 opacity-50" />
                     <p>Ask a question about Unicorn procedures or internal processes</p>
                   </div>
                 ) : (
                   <div className="space-y-4">
                     {messages.map(message => (
                       <div
                         key={message.id}
                         className={`flex gap-3 ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}
                       >
                         {message.role !== 'user' && (
                           <div className="w-8 h-8 rounded-full bg-primary flex items-center justify-center flex-shrink-0">
                             <Bot className="h-5 w-5 text-primary-foreground" />
                           </div>
                         )}
                         <div className={`max-w-[70%] ${message.role === 'user' ? 'order-first' : ''}`}>
                           <div
                             className={`rounded-lg p-3 ${
                               message.role === 'user'
                                 ? 'bg-primary text-primary-foreground'
                                 : 'bg-muted'
                             }`}
                           >
                             <p className="whitespace-pre-wrap text-sm">{message.content}</p>
                           </div>
                           {message.sources_used && message.sources_used.length > 0 && (
                             <Collapsible className="mt-2">
                               <CollapsibleTrigger className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
                                 <FileText className="h-3 w-3" />
                                 {message.sources_used.length} sources used
                                 <ChevronRight className="h-3 w-3" />
                               </CollapsibleTrigger>
                               <CollapsibleContent className="mt-1">
                                 <div className="space-y-1">
                                   {message.sources_used.map((source: any, idx: number) => (
                                     <div key={idx} className="text-xs bg-muted/50 rounded p-2">
                                       <Badge variant="outline" className="text-xs mb-1">
                                         {source.type}
                                       </Badge>
                                       <p className="font-medium">{source.title}</p>
                                       <p className="text-muted-foreground">v{source.version}</p>
                                     </div>
                                   ))}
                                 </div>
                               </CollapsibleContent>
                             </Collapsible>
                           )}
                         </div>
                         {message.role === 'user' && (
                           <div className="w-8 h-8 rounded-full bg-secondary flex items-center justify-center flex-shrink-0">
                             <User className="h-5 w-5" />
                           </div>
                         )}
                       </div>
                     ))}
                     {isLoading && (
                       <div className="flex gap-3">
                         <div className="w-8 h-8 rounded-full bg-primary flex items-center justify-center flex-shrink-0">
                           <Loader2 className="h-5 w-5 text-primary-foreground animate-spin" />
                         </div>
                         <div className="bg-muted rounded-lg p-3">
                           <p className="text-sm text-muted-foreground">Thinking...</p>
                         </div>
                       </div>
                     )}
                     <div ref={messagesEndRef} />
                   </div>
                 )}
               </ScrollArea>
             </CardContent>
             
             {/* Input Area */}
             {selectedThread && (
               <div className="p-4 border-t">
                 <div className="flex gap-2">
                   <Textarea
                     placeholder="Ask about Unicorn procedures, EOS processes, or internal policies..."
                     value={inputMessage}
                     onChange={(e) => setInputMessage(e.target.value)}
                     onKeyDown={(e) => {
                       if (e.key === 'Enter' && !e.shiftKey) {
                         e.preventDefault();
                         sendMessage();
                       }
                     }}
                     className="resize-none"
                     rows={2}
                     disabled={isLoading}
                   />
                   <Button
                     onClick={sendMessage}
                     disabled={!inputMessage.trim() || isLoading}
                     className="self-end"
                   >
                     {isLoading ? (
                       <Loader2 className="h-4 w-4 animate-spin" />
                     ) : (
                       <Send className="h-4 w-4" />
                     )}
                   </Button>
                 </div>
               </div>
             )}
           </Card>
 
           {/* Report Generation Panel */}
           <Card>
             <CardHeader className="pb-2">
               <CardTitle className="text-lg flex items-center gap-2">
                 <FileText className="h-5 w-5" />
                 Generate Report
               </CardTitle>
             </CardHeader>
             <CardContent>
               <div className="flex flex-wrap gap-4 items-end">
                 <div className="flex-1 min-w-[200px]">
                   <label className="text-sm font-medium mb-1 block">Report Type</label>
                   <Select value={reportType} onValueChange={setReportType}>
                     <SelectTrigger>
                       <SelectValue placeholder="Select report type" />
                     </SelectTrigger>
                     <SelectContent>
                       {REPORT_TYPES.map(rt => (
                         <SelectItem key={rt.value} value={rt.value}>
                           {rt.label}
                         </SelectItem>
                       ))}
                     </SelectContent>
                   </Select>
                 </div>
                 
                 <div className="flex-1 min-w-[200px]">
                   <label className="text-sm font-medium mb-1 block">Client</label>
                   <Select 
                     value={selectedTenant?.toString() || ''} 
                     onValueChange={(v) => setSelectedTenant(parseInt(v))}
                   >
                     <SelectTrigger>
                       <SelectValue placeholder="Select client" />
                     </SelectTrigger>
                     <SelectContent>
                       <div className="p-2">
                         <Input
                           placeholder="Search clients..."
                           value={tenantSearch}
                           onChange={(e) => setTenantSearch(e.target.value)}
                           className="mb-2"
                         />
                       </div>
                       {filteredTenants.slice(0, 50).map(t => (
                         <SelectItem key={t.id} value={t.id.toString()}>
                           <span className="flex items-center gap-2">
                             {t.name}
                             {t.status === 'archived' && (
                               <Badge variant="secondary" className="text-xs">Archived</Badge>
                             )}
                           </span>
                         </SelectItem>
                       ))}
                     </SelectContent>
                   </Select>
                 </div>
                 
                 <div className="min-w-[150px]">
                   <label className="text-sm font-medium mb-1 block">Start Date</label>
                   <Input
                     type="date"
                     value={dateStart}
                     onChange={(e) => setDateStart(e.target.value)}
                   />
                 </div>
                 
                 <div className="min-w-[150px]">
                   <label className="text-sm font-medium mb-1 block">End Date</label>
                   <Input
                     type="date"
                     value={dateEnd}
                     onChange={(e) => setDateEnd(e.target.value)}
                   />
                 </div>
                 
                 <Button
                   onClick={generateReport}
                   disabled={!reportType || !selectedTenant || isGeneratingReport}
                 >
                   {isGeneratingReport ? (
                     <>
                       <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                       Generating...
                     </>
                   ) : (
                     <>
                       <FileJson className="h-4 w-4 mr-2" />
                       Generate
                     </>
                   )}
                 </Button>
               </div>
               
               {/* Report Result */}
               {reportResult && (
                 <div className="mt-4 border rounded-lg p-4">
                   <div className="flex items-center justify-between mb-4">
                     <div>
                       <h3 className="font-semibold">{reportResult.reportType}</h3>
                       <p className="text-sm text-muted-foreground">
                         {reportResult.clientIdentifier} • {reportResult.timePeriod}
                       </p>
                     </div>
                     <Button variant="outline" size="sm" onClick={copyReportToClipboard}>
                       <Copy className="h-4 w-4 mr-1" />
                       Copy JSON
                     </Button>
                   </div>
                   
                   <div className="space-y-4">
                     {reportResult.sections?.map((section: any, idx: number) => (
                       <Collapsible key={idx} defaultOpen>
                         <CollapsibleTrigger className="flex items-center gap-2 font-medium hover:text-primary">
                           <ChevronDown className="h-4 w-4" />
                           {section.title}
                         </CollapsibleTrigger>
                         <CollapsibleContent className="mt-2 pl-6">
                           <pre className="text-xs bg-muted p-3 rounded overflow-auto max-h-[200px]">
                             {JSON.stringify(section.data, null, 2)}
                           </pre>
                         </CollapsibleContent>
                       </Collapsible>
                     ))}
                     
                     {reportResult.knownGaps?.length > 0 && (
                       <div className="border-t pt-4">
                         <h4 className="font-medium text-sm flex items-center gap-2 text-amber-600">
                           <AlertTriangle className="h-4 w-4" />
                           Known Gaps
                         </h4>
                         <ul className="text-sm mt-2 space-y-1">
                           {reportResult.knownGaps.map((gap: string, idx: number) => (
                             <li key={idx} className="text-muted-foreground">• {gap}</li>
                           ))}
                         </ul>
                       </div>
                     )}
                     
                     <div className="border-t pt-4 text-xs text-muted-foreground">
                       <p><strong>Generated:</strong> {format(new Date(reportResult.generatedAt), 'PPpp')}</p>
                       <p><strong>Data Sources:</strong> {reportResult.dataSources?.join(', ')}</p>
                       {reportResult.redactions?.length > 0 && (
                         <p><strong>Redactions Applied:</strong> {reportResult.redactions.join(', ')}</p>
                       )}
                     </div>
                   </div>
                 </div>
               )}
             </CardContent>
           </Card>

          {/* Test Checklist (Dev) */}
          <AssistantTestChecklist />
         </div>
       </div>
     </DashboardLayout>
   );
 }