import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createSurveyIngressBudget } from './planning-survey-budget.ts';
import { mayCloseCampaign, mayReviewCampaign, shuffleForReview, type ReviewScope } from './planning-survey-review.ts';
describe('survey ingress and review boundaries', () => {
  it('limits before database work without per-person identifiers', () => { let now=0;const admit=createSurveyIngressBudget(2,1000,()=>now);assert.equal(admit(),true);assert.equal(admit(),true);assert.equal(admit(),false);now=1000;assert.equal(admit(),true); });
  it('rejects invalid budgets and clocks',()=>{assert.equal(createSurveyIngressBudget(0,1000,()=>0)(),false);assert.equal(createSurveyIngressBudget(2,1000,()=>NaN)(),false);});
  const scope:ReviewScope={assigned:true,canClose:true,canReviewRaw:true,campaignId:'synthetic',business:'vivacity',year:2027,state:'closed',minimumResponses:5,privacyReviewApproved:true};
  it('requires every explicit review gate',()=>{assert.equal(mayReviewCampaign(scope,5),true);for(const diff of [{assigned:false},{canReviewRaw:false},{state:'open' as const},{minimumResponses:null},{privacyReviewApproved:false}])assert.equal(mayReviewCampaign({...scope,...diff},5),false);assert.equal(mayReviewCampaign(scope,4),false);});
  it('does not allow closing draft or unassigned campaigns',()=>{assert.equal(mayCloseCampaign(scope),true);assert.equal(mayCloseCampaign({...scope,state:'draft'}),false);assert.equal(mayCloseCampaign({...scope,assigned:false}),false);});
  it('shuffles without mutating input or adding identifiers',()=>{const rows=['a','b','c'];assert.deepEqual(shuffleForReview(rows,()=>0),['b','c','a']);assert.deepEqual(rows,['a','b','c']);assert.throws(()=>shuffleForReview(rows,()=>99));});
});
