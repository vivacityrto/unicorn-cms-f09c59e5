/** Runs the real canonical requireCaller through the review handler with a fake
 * Supabase transport. No network, credentials or hosted JWT validity is tested. */
import { describe,it } from 'node:test';
import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import { createPlanningReviewHandler } from './planning-survey-review-handler.ts';
const hooks=registerHooks({resolve(specifier,context,next){
 if(specifier.startsWith('https://esm.sh/@supabase/supabase-js'))return {url:'data:text/javascript,export function createClient(){throw new Error("Unexpected SDK construction in injected test")}',shortCircuit:true};
 return next(specifier,context);
}});
const {requireCaller}=await import('./requireCaller.ts');
hooks.deregister();
const campaign='c9cdfa38-4c2e-48c9-91a5-05720dd332fe';
const req=(token)=>new Request('https://qa.invalid/review',{method:'POST',headers:{'Content-Type':'application/json',...(token?{Authorization:token}:{})},body:JSON.stringify({campaignId:campaign,action:'review'})});
describe('real requireCaller wired into planning review',()=>{
 it('rejects missing/malformed/invalid auth, checks canonical full permission and revocation',async()=>{
   let permission=true;let authCalls=0;let writes=0;const permissionCalls=[];
   const client={auth:{getUser:async(token)=>{authCalls++;return token==='valid-synthetic'?{data:{user:{id:'actor-from-auth'}},error:null}:{data:{user:null},error:null};}},rpc:async(name,args)=>{permissionCalls.push([name,args]);return {data:permission,error:null};}};
   const handler=createPlanningReviewHandler({enabled:true,headers:()=>({}),authorize:(request,options)=>requireCaller(request,client,options),act:async(_id,actor)=>{assert.equal(actor,'actor-from-auth');writes++;return {closed:true};}});
   for(const token of [undefined,'valid-synthetic','Bearerinvalid','Bearer invalid'])assert.equal((await handler(req(token))).status,401);
   assert.equal(writes,0);assert.equal(permissionCalls.length,0);assert.equal(authCalls,1);
   assert.equal((await handler(req('Bearer valid-synthetic'))).status,200);
   assert.deepEqual(permissionCalls[0],['check_permission',{p_user_id:'actor-from-auth',p_feature_key:'eos.configurations.manage',p_min_level:'full'}]);
   permission=false;assert.equal((await handler(req('Bearer valid-synthetic'))).status,403);assert.equal(writes,1);
 });
});

it('executes production reviewer adapter with synthetic Deno/Supabase transport only',async()=>{
 let captured;let granted=true;let acts=0;
 const previousDeno=globalThis.Deno;
 const client={auth:{getUser:async()=>({data:{user:{id:'verified-actor'}},error:null})},rpc:async(name,args)=>{
   if(name==='check_permission') {assert.equal(args.p_feature_key,'eos.configurations.manage');assert.equal(args.p_min_level,'full');return {data:granted,error:null};}
   assert.equal(name,'review_anonymous_planning_campaign');assert.equal(args.p_actor_user_id,'verified-actor');acts++;return {data:{closed:true},error:null};
 }};
 globalThis.__planningSyntheticClient=client;
 globalThis.Deno={env:{get:name=>({SUPABASE_URL:'https://qa.invalid',SUPABASE_SERVICE_ROLE_KEY:'synthetic-not-a-key',PLANNING_SURVEY_REVIEW_ENABLED:'true',PLANNING_SURVEY_REVIEW_PRIVACY_VERIFIED:'true'})[name]},serve:handler=>{captured=handler;}};
 const adapterHook=registerHooks({resolve(specifier,context,next){
   if(specifier.startsWith('https://esm.sh/@supabase/supabase-js'))return {url:'data:text/javascript,export function createClient(){return globalThis.__planningSyntheticClient}',shortCircuit:true};
   return next(specifier,context);
 }});
 try {
   await import('../planning-survey-review/index.ts');
   assert.equal(typeof captured,'function');
   assert.equal((await captured(req(undefined))).status,401);assert.equal(acts,0);
   assert.equal((await captured(req('Bearer synthetic'))).status,200);assert.equal(acts,1);
   granted=false;assert.equal((await captured(req('Bearer synthetic'))).status,403);assert.equal(acts,1);
 } finally {adapterHook.deregister();globalThis.Deno=previousDeno;delete globalThis.__planningSyntheticClient;}
});
