/** Server-side review contract. Identity exists only on access grants, never answers. */
export type ReviewScope = {
  assigned: boolean; canClose: boolean; canReviewRaw: boolean;
  campaignId: string; business: 'vivacity' | 'complyhub'; year: number;
  state: 'draft' | 'open' | 'closed'; minimumResponses: number | null;
  privacyReviewApproved: boolean;
};
export function mayCloseCampaign(scope: ReviewScope): boolean {
  return scope.assigned && scope.canClose && (scope.state === 'open' || scope.state === 'closed');
}
export function mayReviewCampaign(scope: ReviewScope, count: number): boolean {
  return scope.assigned && scope.canReviewRaw && scope.state === 'closed' && scope.privacyReviewApproved
    && Number.isInteger(scope.minimumResponses) && Number(scope.minimumResponses) >= 2
    && Number.isInteger(count) && count >= Number(scope.minimumResponses) && count <= 10000;
}
/** Fisher-Yates; eliminates insert-order display, not every inferential identity risk. */
export function shuffleForReview<T>(rows: T[], randomIndex: (exclusive: number) => number): T[] {
  const output = [...rows];
  for (let i = output.length - 1; i > 0; i--) {
    const j = randomIndex(i + 1);
    if (!Number.isInteger(j) || j < 0 || j > i) throw new Error('Invalid random index');
    [output[i], output[j]] = [output[j], output[i]];
  }
  return output;
}
