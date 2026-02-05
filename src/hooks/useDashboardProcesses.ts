 import { useEffect, useState } from 'react';
 import { supabase } from '@/integrations/supabase/client';
 import { useAuth } from '@/hooks/useAuth';
 
 export interface DashboardProcess {
   id: string;
   title: string;
   category: string;
   status: string;
   updated_at: string;
   owner_first_name: string | null;
   owner_last_name: string | null;
 }
 
 export function useDashboardProcesses() {
   const { user } = useAuth();
   const [processes, setProcesses] = useState<DashboardProcess[]>([]);
   const [loading, setLoading] = useState(true);
 
   useEffect(() => {
     if (!user) return;
 
     const fetchProcesses = async () => {
       const { data, error } = await supabase
         .from('processes')
         .select(`
           id,
           title,
           category,
           status,
           updated_at,
           owner:users!processes_owner_user_id_fkey (
             first_name,
             last_name
           )
         `)
         .neq('status', 'archived')
         .order('updated_at', { ascending: false })
         .limit(5);
 
       if (!error && data) {
         const mapped = data.map((p: any) => ({
           id: p.id,
           title: p.title,
           category: p.category,
           status: p.status,
           updated_at: p.updated_at,
           owner_first_name: p.owner?.first_name ?? null,
           owner_last_name: p.owner?.last_name ?? null,
         }));
         setProcesses(mapped);
       }
       setLoading(false);
     };
 
     fetchProcesses();
   }, [user]);
 
   return { processes, loading };
 }