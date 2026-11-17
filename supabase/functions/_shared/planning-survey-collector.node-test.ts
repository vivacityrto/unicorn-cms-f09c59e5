import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createPlanningSurveyCollector, type CollectionCampaign, type CollectorDependencies } from './planning-survey-collector.ts';
import { ANONYMOUS_QUESTION_IDS } from './anonymous-planning-survey.ts';
const origin = 'https://surveys.example.test';
const campaign: CollectionCampaign = {
  id: 'c9cdfa38-4c2e-48c9-91a5-05720dd332fe', business: 'vivacity', year: 2027,
  questionnaireVersion: '2027-strategy-v1', state: 'open', opensAtMs: 100, closesAtMs: 200,
  keyHash: 'hash', collectionApproved: true,
};
const payload = () => ({ campaignId: campaign.id, key: 'a'.repeat(64), submission: {
  campaignId: campaign.id, questionnaireVersion: campaign.questionnaireVersion,
  idempotencyKey: '9d4c20e4-0265-4cd1-b4ba-7f6fd3b6517c',
  answers: Object.fromEntries(ANONYMOUS_QUESTION_IDS.map(id => [id, id === 'strengths' ? 'Synthetic' : ''])),
} });
function setup(overrides: Partial<CollectorDependencies> = {}) {
  let accepted = 0;
  const handler = createPlanningSurveyCollector({ enabled: true, allowedOrigins: new Set([origin]),
    findCampaign: async () => campaign, verifyKey: async key => key === 'a'.repeat(64),
    accept: async () => { accepted++; return true; }, now: () => 150, ...overrides });
  const request = (body: unknown = payload(), extra: Record<string,string> = {}) => new Request('https://api.example.test/collect', {
    method: 'POST', headers: { Origin: origin, 'Content-Type': 'application/json', ...extra }, body: JSON.stringify(body),
  });
  return {handler, request, count: () => accepted};
}
describe('capability-gated collection HTTP boundary', () => {
  it('accepts a valid synthetic response without returning identifiers/counts', async () => {
    const {handler,request,count} = setup(); const response = await handler(request());
    assert.equal(response.status,200); assert.deepEqual(await response.json(),{accepted:true}); assert.equal(count(),1);
    assert.equal(response.headers.get('cache-control'),'no-store');
  });
  it('returns public questionnaire context only after key verification', async () => {
    const {handler,request,count}=setup();
    const response=await handler(request({campaignId:campaign.id,key:'a'.repeat(64)}));
    const value=await response.json(); assert.equal(value.campaign.business,'vivacity');
    assert.equal(JSON.stringify(value).includes('keyHash'),false); assert.equal(count(),0);
  });
  it('fails closed when deployment or campaign approval is absent', async () => {
    for(const changes of [{enabled:false},{findCampaign:async()=>({...campaign,collectionApproved:false})}]) {
      const {handler,request,count}=setup(changes); assert.notEqual((await handler(request())).status,200); assert.equal(count(),0);
    }
  });
  it('rejects wrong keys, cross-origin calls and account-bearing requests', async () => {
    const {handler,request,count}=setup();
    for(const headers of [{Authorization:'Bearer USER_CANARY'},{Cookie:'USER_CANARY'},{Origin:'https://evil.test'}])
      assert.equal((await handler(request(payload(),headers))).ok,false);
    assert.equal((await handler(request({...payload(),key:'b'.repeat(64)}))).status,403); assert.equal(count(),0);
  });
  it('does not call storage for injected metadata or closed campaigns', async () => {
    const {handler,request,count}=setup();
    assert.equal((await handler(request({...payload(),email:'USER_CANARY'}))).status,400);
    const closed=setup({findCampaign:async()=>({...campaign,state:'closed'})});
    assert.equal((await closed.handler(closed.request({campaignId:campaign.id,key:'a'.repeat(64)}))).ok,false); assert.equal(closed.count()+count(),0);
  });
  it('bounds untrusted request bytes',async()=>{
    const {handler,request,count}=setup(); assert.equal((await handler(request({huge:'x'.repeat(100001)}))).status,400); assert.equal(count(),0);
  });
  it('never reflects internal errors or answers to the response',async()=>{
    const {handler,request}=setup({accept:async()=>{throw Error('USER_CANARY SECRET ANSWER');}});
    const response=await handler(request()); assert.equal(response.status,400); assert.equal((await response.text()).includes('CANARY'),false);
  });
  it('does not report accepted for an uncertain or rejected storage outcome',async()=>{
    const {handler,request}=setup({accept:async()=>false}); assert.equal((await handler(request())).status,409);
  });
});
