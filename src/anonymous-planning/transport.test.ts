import { describe, expect, it, vi } from 'vitest';
import { createAnonymousTransport, parseSurveyLink } from './transport';
import { emptyPlanningAnswers } from '@/lib/eos/planning-surveys/questionnaire';
const link = { campaignId: 'c9cdfa38-4c2e-48c9-91a5-05720dd332fe', key: 'a'.repeat(64) };
describe('isolated anonymous transport',()=>{
 it('accepts only a complete fragment with no duplicate fields',()=>{
   expect(parseSurveyLink(`#campaign=${link.campaignId}&key=${link.key}`)).toEqual(link);
   expect(parseSurveyLink(`#campaign=${link.campaignId}&key=${link.key}&email=canary`)).toBeNull();
   expect(parseSurveyLink(`#campaign=${link.campaignId}&campaign=${link.campaignId}`)).toBeNull();
 });
 it('omits cookies and auth and rejects redirects',async()=>{
   const fetcher=vi.fn().mockResolvedValue(new Response(JSON.stringify({accepted:true}),{status:200}));
   await createAnonymousTransport('https://api.example.test/collect',fetcher).submit(link,{campaignId:link.campaignId,questionnaireVersion:'2027-strategy-v1',idempotencyKey:crypto.randomUUID(),answers:{...emptyPlanningAnswers(),strengths:'Sample'}});
   const [url,config]=fetcher.mock.calls[0]; expect(url).toBe('https://api.example.test/collect');
   expect(config.credentials).toBe('omit'); expect(config.referrerPolicy).toBe('no-referrer'); expect(config.redirect).toBe('error');
   expect(config.headers).toEqual({'Content-Type':'application/json'});
 });
 it('rejects wrong campaign metadata or unconfirmed receipt',async()=>{
   const fetcher=vi.fn().mockResolvedValue(new Response(JSON.stringify({campaign:{id:'other',business:'vivacity',year:2027,questionnaireVersion:'2027-strategy-v1'}})));
   await expect(createAnonymousTransport('https://api.example.test/collect',fetcher).load(link)).rejects.toThrow();
   expect(()=>createAnonymousTransport('http://api.example.test/collect')).toThrow();
 });
});
