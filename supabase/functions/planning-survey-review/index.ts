import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.108.2';
import { requireCaller } from '../_shared/requireCaller.ts';
import { corsHeaders } from '../_shared/cors.ts';
import { createPlanningReviewHandler } from '../_shared/planning-survey-review-handler.ts';

const url=Deno.env.get('SUPABASE_URL');const key=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
const client=url && key ? createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}}) : null;
Deno.serve(createPlanningReviewHandler({
  enabled:Boolean(client) && Deno.env.get('PLANNING_SURVEY_REVIEW_ENABLED')==='true'
    && Deno.env.get('PLANNING_SURVEY_REVIEW_PRIVACY_VERIFIED')==='true',
  headers:corsHeaders,
  authorize:async(req,options)=>{
    if (!client) return {ok:false,response:new Response('Unavailable',{status:503})};
    return requireCaller(req,client,options);
  },
  act:async(campaignId,actorId,action)=>{
    if (!client) return null;
    const {data,error}=await client.rpc('review_anonymous_planning_campaign',{
      p_campaign_id:campaignId,p_actor_user_id:actorId,p_action:action,
    });
    if(error)throw new Error('Unavailable');
    return data;
  },
}));
