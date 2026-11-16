import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import { afterEach, describe, it, expect, vi } from 'vitest';
import { PlanningSurveyReview } from './PlanningSurveyReview';
import { PLANNING_QUESTIONS } from '@/lib/eos/planning-surveys/questionnaire';
afterEach(cleanup);
const response={campaignId:'test',business:'vivacity',year:2027,responseCount:2,answersByQuestion:Object.fromEntries(PLANNING_QUESTIONS.map(({id})=>[id,id==='strengths'?['Synthetic theme']:[]]))};
describe('restricted planning reviewer draft',()=>{
 it('does not fetch on mount and clears requested text',async()=>{const gateway={review:vi.fn().mockResolvedValue(response),close:vi.fn()};render(<PlanningSurveyReview campaignId="test" gateway={gateway}/>);expect(gateway.review).not.toHaveBeenCalled();fireEvent.click(screen.getByText('Request closed-campaign results'));await screen.findByText('Synthetic theme');expect(screen.getByText(/not a count of unique people/)).toBeInTheDocument();fireEvent.click(screen.getByText('Clear results'));expect(screen.queryByText('Synthetic theme')).toBeNull();});
 it('fails closed on wrong campaign and never echoes server errors',async()=>{const gateway={review:vi.fn().mockResolvedValue({...response,campaignId:'other'}),close:vi.fn()};render(<PlanningSurveyReview campaignId="test" gateway={gateway}/>);fireEvent.click(screen.getByText('Request closed-campaign results'));await screen.findByText(/Results unavailable/);expect(screen.queryByText('Synthetic theme')).toBeNull();});
 it('requires explicit closure intent and does not release automatically',async()=>{const gateway={review:vi.fn(),close:vi.fn().mockResolvedValue(undefined)};render(<PlanningSurveyReview campaignId="test" gateway={gateway}/>);expect(screen.getByRole('button',{name:'Close collection'})).toBeDisabled();fireEvent.click(screen.getByRole('checkbox'));fireEvent.click(screen.getByRole('button',{name:'Close collection'}));await waitFor(()=>expect(gateway.close).toHaveBeenCalledWith('test'));expect(gateway.review).not.toHaveBeenCalled();});
});
