import { describe,it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createPlanningReviewHandler,type ReviewDependencies } from './planning-survey-review-handler.ts';
const id='c9cdfa38-4c2e-48c9-91a5-05720dd332fe';
const request=(body:object={campaignId:id,action:'review'})=>new Request('https://qa.invalid/review',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer synthetic'},body:JSON.stringify(body)});
function setup(overrides:Partial<ReviewDependencies>={}) {
 const calls:unknown[][]=[];
 const handler=createPlanningReviewHandler({enabled:true,headers:()=>({}),authorize:async(_req,options)=>{assert.equal(options.featureKey,'eos.configurations.manage');assert.equal(options.minLevel,'full');return {ok:true,user:{id:'verified-actor'}};},act:async(...args)=>{calls.push(args);return {closed:true};},...overrides});
 return {handler,calls};
}
describe('authenticated review request integration',()=>{
 it('calls canonical permission dependency before RPC and only uses verified identity',async()=>{const {handler,calls}=setup();assert.equal((await handler(request())).status,200);assert.deepEqual(calls,[[id,'verified-actor','review']]);});
 it('denied callers never reach data or close operations',async()=>{const {handler,calls}=setup({authorize:async()=>({ok:false,response:new Response('Forbidden',{status:403})})});for(const action of ['review','close'])assert.equal((await handler(request({campaignId:id,action}))).status,403);assert.equal(calls.length,0);});
 it('rechecks permission on each request after revocation',async()=>{let revoked=false;const {handler,calls}=setup({authorize:async()=>revoked?{ok:false,response:new Response(null,{status:403})}:{ok:true,user:{id:'verified-actor'}}});assert.equal((await handler(request())).status,200);revoked=true;assert.equal((await handler(request())).status,403);assert.equal(calls.length,1);});
 it('rejects forged actor, release actions and oversized payloads',async()=>{const {handler,calls}=setup();for(const body of [{campaignId:id,action:'review',actorId:'other'},{campaignId:id,action:'publish'},{campaignId:id,action:'x'.repeat(2000)}])assert.equal((await handler(request(body))).status,400);assert.equal(calls.length,0);});
 it('respects disabled and database-denial gates with generic failures',async()=>{const off=setup({enabled:false});assert.equal((await off.handler(request())).status,503);assert.equal(off.calls.length,0);const denied=setup({act:async()=>null});assert.equal((await denied.handler(request())).status,403);const failed=setup({act:async()=>{throw Error('ANSWER_CANARY');}});const response=await failed.handler(request());assert.equal((await response.text()).includes('CANARY'),false);});
 it('returns no-store headers for successful responses',async()=>{const {handler}=setup();const response=await handler(request());assert.equal(response.headers.get('cache-control'),'no-store');});
 it('production adapter delegates to real requireCaller and server actor RPC binding',()=>{const source=readFileSync(new URL('../planning-survey-review/index.ts',import.meta.url),'utf8');assert.match(source,/return requireCaller\(req,client,options\)/);assert.match(source,/p_actor_user_id:actorId/);assert.match(source,/PLANNING_SURVEY_REVIEW_PRIVACY_VERIFIED/);});
});
