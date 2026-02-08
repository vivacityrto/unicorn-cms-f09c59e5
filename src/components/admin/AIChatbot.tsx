/**
 * @deprecated This component has been replaced by Ask Viv.
 * Use AskVivPanel and AskVivButton from '@/components/ask-viv' instead.
 * This file is kept for reference only.
 */
import { useState, useEffect, useRef, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useRBAC } from '@/hooks/useRBAC';
import { Button } from '@/components/ui/button';
 import { Input } from '@/components/ui/input';
 import { ScrollArea } from '@/components/ui/scroll-area';
 import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
 import { Badge } from '@/components/ui/badge';
 import { toast } from '@/hooks/use-toast';
 import { 
   Bot, 
   X, 
   Send, 
   MessageSquare, 
   Loader2, 
   FileText,
   ChevronRight,
   Minimize2,
   Maximize2
 } from 'lucide-react';
 import { cn } from '@/lib/utils';
 
 interface Message {
   id: string;
   role: 'user' | 'assistant' | 'system';
   content: string;
   sources_used?: any[];
   created_at: string;
 }
 
 interface Thread {
   id: string;
   title: string;
 }
 
 export function AIChatbot() {
  const { user, profile, loading } = useAuth();
  const { isSuperAdmin } = useRBAC();
   
   const [isOpen, setIsOpen] = useState(false);
   const [isExpanded, setIsExpanded] = useState(false);
   const [currentThread, setCurrentThread] = useState<Thread | null>(null);
   const [messages, setMessages] = useState<Message[]>([]);
   const [inputMessage, setInputMessage] = useState('');
   const [isLoading, setIsLoading] = useState(false);
   
   const messagesEndRef = useRef<HTMLDivElement>(null);
   const inputRef = useRef<HTMLInputElement>(null);
 
   // Scroll to bottom on new messages
   useEffect(() => {
     messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
   }, [messages]);
 
   // Focus input when opening
   useEffect(() => {
     if (isOpen) {
       setTimeout(() => inputRef.current?.focus(), 100);
     }
   }, [isOpen]);
 
  // Wait for auth to load before checking access
  if (loading || !profile) {
    return null;
  }

  // Only render for SuperAdmins
  if (!isSuperAdmin) {
    console.debug('[AIChatbot] Access denied:', { 
      isSuperAdmin, 
      unicorn_role: profile?.unicorn_role,
      global_role: profile?.global_role 
    });
     return null;
   }
 
   async function createNewThread() {
     const { data, error } = await supabase
       .from('assistant_threads')
       .insert({ viewer_user_id: user?.id, title: 'New chat' })
       .select()
       .single();
     
     if (error) {
       console.error('Error creating thread:', error);
       return null;
     }
     
     setCurrentThread(data);
     setMessages([]);
     return data;
   }
 
   async function sendMessage() {
     if (!inputMessage.trim()) return;
     
     setIsLoading(true);
     const userMessage = inputMessage;
     setInputMessage('');
     
     // Ensure we have a thread
     let thread = currentThread;
     if (!thread) {
       thread = await createNewThread();
       if (!thread) {
         setIsLoading(false);
         toast({ title: 'Error creating chat', variant: 'destructive' });
         return;
       }
     }
     
     // Add user message to UI immediately
     const tempUserMessage: Message = {
       id: 'temp-user-' + Date.now(),
       role: 'user',
       content: userMessage,
       created_at: new Date().toISOString(),
     };
     setMessages(prev => [...prev, tempUserMessage]);
     
     try {
       // Save user message
       await supabase
         .from('assistant_messages')
         .insert({
           thread_id: thread.id,
           role: 'user',
           content: userMessage,
         });
       
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
             threadId: thread.id,
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
           thread_id: thread.id,
           role: 'assistant',
           content: result.answer,
           sources_used: result.sources,
         })
         .select()
         .single();
       
       // Add assistant message to UI
       if (savedAssistantMsg) {
         setMessages(prev => [
           ...prev.filter(m => !m.id.startsWith('temp-')),
           { ...tempUserMessage, id: 'user-' + Date.now() },
           {
             id: savedAssistantMsg.id,
             role: 'assistant' as const,
             content: result.answer,
             sources_used: result.sources,
             created_at: savedAssistantMsg.created_at,
           }
         ]);
       }
       
       // Update thread title if first message
       if (messages.length === 0) {
         const newTitle = userMessage.substring(0, 50) + (userMessage.length > 50 ? '...' : '');
         await supabase
           .from('assistant_threads')
           .update({ title: newTitle, updated_at: new Date().toISOString() })
           .eq('id', thread.id);
         
         setCurrentThread(prev => prev ? { ...prev, title: newTitle } : null);
       }
       
     } catch (error) {
       console.error('Error sending message:', error);
       toast({
         title: 'Error',
         description: error instanceof Error ? error.message : 'Failed to send message',
         variant: 'destructive',
       });
       // Remove temp message on error
       setMessages(prev => prev.filter(m => !m.id.startsWith('temp-')));
     } finally {
       setIsLoading(false);
     }
   }
 
   function handleKeyDown(e: React.KeyboardEvent) {
     if (e.key === 'Enter' && !e.shiftKey) {
       e.preventDefault();
       sendMessage();
     }
   }
 
   function startNewChat() {
     setCurrentThread(null);
     setMessages([]);
   }
 
   return (
     <>
       {/* Floating Chat Button */}
       {!isOpen && (
         <button
           onClick={() => setIsOpen(true)}
           className="fixed bottom-6 right-6 z-50 h-14 w-14 rounded-full bg-gradient-to-br from-primary to-purple-600 text-primary-foreground shadow-lg hover:shadow-xl transition-all duration-300 flex items-center justify-center group hover:scale-105"
           aria-label="Open AI Assistant"
         >
           <Bot className="h-7 w-7 group-hover:scale-110 transition-transform" />
           <span className="absolute -top-1 -right-1 h-4 w-4 rounded-full bg-green-500 border-2 border-background animate-pulse" />
         </button>
       )}
 
       {/* Chat Window */}
       {isOpen && (
         <div
           className={cn(
             "fixed z-50 bg-card border border-border rounded-2xl shadow-2xl flex flex-col transition-all duration-300",
             isExpanded 
               ? "bottom-4 right-4 left-4 top-4 md:left-auto md:top-4 md:w-[500px] md:h-[calc(100vh-2rem)]"
               : "bottom-6 right-6 w-[380px] h-[520px]"
           )}
         >
           {/* Header */}
           <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-gradient-to-r from-primary/10 to-purple-500/10 rounded-t-2xl">
             <div className="flex items-center gap-3">
               <div className="h-10 w-10 rounded-full bg-gradient-to-br from-primary to-purple-600 flex items-center justify-center">
                 <Bot className="h-5 w-5 text-primary-foreground" />
               </div>
               <div>
                 <h3 className="font-semibold text-foreground">AI Assistant</h3>
                 <p className="text-xs text-muted-foreground">Internal knowledge only</p>
               </div>
             </div>
             <div className="flex items-center gap-1">
               <Button
                 variant="ghost"
                 size="icon"
                 className="h-8 w-8"
                 onClick={() => setIsExpanded(!isExpanded)}
               >
                 {isExpanded ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
               </Button>
               <Button
                 variant="ghost"
                 size="icon"
                 className="h-8 w-8"
                 onClick={() => setIsOpen(false)}
               >
                 <X className="h-4 w-4" />
               </Button>
             </div>
           </div>
 
           {/* Messages */}
           <ScrollArea className="flex-1 p-4">
             {messages.length === 0 ? (
               <div className="flex flex-col items-center justify-center h-full text-center px-4 py-8">
                 <div className="h-16 w-16 rounded-full bg-gradient-to-br from-primary/20 to-purple-500/20 flex items-center justify-center mb-4">
                   <MessageSquare className="h-8 w-8 text-primary" />
                 </div>
                 <h4 className="font-medium text-foreground mb-2">How can I help you?</h4>
                 <p className="text-sm text-muted-foreground">
                   Ask about Unicorn procedures, EOS processes, or internal policies.
                 </p>
               </div>
             ) : (
               <div className="space-y-4">
                 {messages.map(message => (
                   <div
                     key={message.id}
                     className={cn(
                       "flex gap-2",
                       message.role === 'user' ? 'justify-end' : 'justify-start'
                     )}
                   >
                     {message.role !== 'user' && (
                       <div className="h-8 w-8 rounded-full bg-gradient-to-br from-primary to-purple-600 flex items-center justify-center flex-shrink-0">
                         <Bot className="h-4 w-4 text-primary-foreground" />
                       </div>
                     )}
                     <div className={cn("max-w-[80%]", message.role === 'user' && 'order-first')}>
                       <div
                         className={cn(
                           "rounded-2xl px-4 py-2.5 text-sm",
                           message.role === 'user'
                             ? 'bg-primary text-primary-foreground rounded-br-md'
                             : 'bg-muted text-foreground rounded-bl-md'
                         )}
                       >
                         <p className="whitespace-pre-wrap">{message.content}</p>
                       </div>
                       {message.sources_used && message.sources_used.length > 0 && (
                         <Collapsible className="mt-1.5">
                           <CollapsibleTrigger className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors">
                             <FileText className="h-3 w-3" />
                             {message.sources_used.length} source{message.sources_used.length > 1 ? 's' : ''}
                             <ChevronRight className="h-3 w-3" />
                           </CollapsibleTrigger>
                           <CollapsibleContent className="mt-1">
                             <div className="space-y-1">
                               {message.sources_used.map((source: any, idx: number) => (
                                 <div key={idx} className="text-xs bg-muted/50 rounded-lg p-2">
                                   <Badge variant="outline" className="text-[10px] mb-1">
                                     {source.type}
                                   </Badge>
                                   <p className="font-medium text-foreground">{source.title}</p>
                                   <p className="text-muted-foreground">v{source.version}</p>
                                 </div>
                               ))}
                             </div>
                           </CollapsibleContent>
                         </Collapsible>
                       )}
                     </div>
                   </div>
                 ))}
                 {isLoading && (
                   <div className="flex gap-2 items-start">
                     <div className="h-8 w-8 rounded-full bg-gradient-to-br from-primary to-purple-600 flex items-center justify-center flex-shrink-0">
                       <Bot className="h-4 w-4 text-primary-foreground" />
                     </div>
                     <div className="bg-muted rounded-2xl rounded-bl-md px-4 py-3">
                       <div className="flex gap-1">
                         <span className="h-2 w-2 bg-muted-foreground/50 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                         <span className="h-2 w-2 bg-muted-foreground/50 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                         <span className="h-2 w-2 bg-muted-foreground/50 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                       </div>
                     </div>
                   </div>
                 )}
                 <div ref={messagesEndRef} />
               </div>
             )}
           </ScrollArea>
 
           {/* Input Area */}
           <div className="p-3 border-t border-border bg-muted/30 rounded-b-2xl">
             {messages.length > 0 && (
               <div className="flex justify-center mb-2">
                 <Button
                   variant="ghost"
                   size="sm"
                   className="text-xs h-7"
                   onClick={startNewChat}
                 >
                   <MessageSquare className="h-3 w-3 mr-1" />
                   New conversation
                 </Button>
               </div>
             )}
             <div className="flex gap-2">
               <Input
                 ref={inputRef}
                 value={inputMessage}
                 onChange={(e) => setInputMessage(e.target.value)}
                 onKeyDown={handleKeyDown}
                 placeholder="Ask about procedures..."
                 disabled={isLoading}
                 className="flex-1 bg-background border-border/50"
               />
               <Button
                 onClick={sendMessage}
                 disabled={isLoading || !inputMessage.trim()}
                 size="icon"
                 className="bg-gradient-to-br from-primary to-purple-600 hover:from-primary/90 hover:to-purple-600/90"
               >
                 {isLoading ? (
                   <Loader2 className="h-4 w-4 animate-spin" />
                 ) : (
                   <Send className="h-4 w-4" />
                 )}
               </Button>
             </div>
           </div>
         </div>
       )}
     </>
   );
 }