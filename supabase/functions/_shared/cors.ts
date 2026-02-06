/**
 * Standard CORS headers for all Supabase Edge Functions.
 * 
 * These headers allow the Unicorn 2.0 frontend to call edge functions
 * from any origin. The headers include support for:
 * - Authorization: JWT tokens for authenticated requests
 * - x-client-info: Supabase client identification
 * - apikey: Supabase anonymous key
 * - content-type: JSON and other content types
 * - x-supabase-client-*: Modern Supabase client headers for platform detection
 * 
 * Usage in edge functions:
 * ```ts
 * import { corsHeaders } from '../_shared/cors.ts';
 * 
 * Deno.serve(async (req) => {
 *   // Handle CORS preflight
 *   if (req.method === 'OPTIONS') {
 *     return new Response('ok', { headers: corsHeaders });
 *   }
 *   
 *   // ... function logic ...
 *   
 *   return new Response(JSON.stringify(data), {
 *     headers: { ...corsHeaders, 'Content-Type': 'application/json' },
 *   });
 * });
 * ```
 */
export const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};
