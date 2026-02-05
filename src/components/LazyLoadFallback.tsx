 import { Loader2 } from "lucide-react";
 
 export const LazyLoadFallback = () => (
   <div className="flex items-center justify-center min-h-screen bg-background">
     <Loader2 className="h-8 w-8 animate-spin text-primary" />
   </div>
 );