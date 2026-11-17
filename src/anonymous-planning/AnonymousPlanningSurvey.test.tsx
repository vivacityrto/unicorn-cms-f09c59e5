import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AnonymousPlanningSurvey } from './AnonymousPlanningSurvey';
const link={campaignId:'c9cdfa38-4c2e-48c9-91a5-05720dd332fe',key:'a'.repeat(64)};
const metadata=()=>new Response(JSON.stringify({campaign:{id:link.campaignId,business:'vivacity',year:2027,questionnaireVersion:'2027-strategy-v1'}}));
afterEach(()=>{cleanup();vi.restoreAllMocks()});
describe('shared-link survey journey',()=>{
 it('makes no request when disabled or link missing',()=>{
   const fetcher=vi.spyOn(globalThis,'fetch');
   const {rerender}=render(<AnonymousPlanningSurvey link={link} enabled={false} endpoint="https://api.example.test/collect"/>);
   expect(screen.getByText('Survey collection is not open yet')).toBeInTheDocument();
   rerender(<AnonymousPlanningSurvey link={null} enabled endpoint="https://api.example.test/collect"/>);expect(fetcher).not.toHaveBeenCalled();
 });
 it('submits once after review and consent; never saves browser draft',async()=>{
   const storage=vi.spyOn(Storage.prototype,'setItem');
   const fetcher=vi.spyOn(globalThis,'fetch').mockResolvedValueOnce(metadata()).mockResolvedValueOnce(new Response(JSON.stringify({accepted:true})));
   render(<AnonymousPlanningSurvey link={link} enabled endpoint="https://api.example.test/collect"/>);
   const input=await screen.findByLabelText(/Strengths:/);fireEvent.change(input,{target:{value:'Synthetic QA'}});
   fireEvent.click(screen.getByText('Review answers'));
   expect(screen.getByText('Submit feedback')).toBeDisabled();fireEvent.click(screen.getByRole('checkbox'));
   fireEvent.click(screen.getByText('Submit feedback'));
   await screen.findByText('Thank you. Your response has been received.');expect(fetcher).toHaveBeenCalledTimes(2);expect(storage).not.toHaveBeenCalled();
 });
 it('keeps the exact ballot and prevents editing on uncertain retry',async()=>{
   const fetcher=vi.spyOn(globalThis,'fetch').mockResolvedValueOnce(metadata()).mockRejectedValueOnce(Error('network')).mockResolvedValueOnce(new Response(JSON.stringify({accepted:true})));
   render(<AnonymousPlanningSurvey link={link} enabled endpoint="https://api.example.test/collect"/>);
   fireEvent.change(await screen.findByLabelText(/Strengths:/),{target:{value:'Synthetic QA'}});fireEvent.click(screen.getByText('Review answers'));fireEvent.click(screen.getByRole('checkbox'));
   await act(async()=>{fireEvent.click(screen.getByText('Submit feedback'))});
   expect(await screen.findByRole('alert')).toHaveTextContent('could not confirm');expect(screen.getByText('Back to questions')).toBeDisabled();
   fireEvent.click(screen.getByText('Retry same submission'));await waitFor(()=>expect(fetcher).toHaveBeenCalledTimes(3));
   expect(fetcher.mock.calls[1][1]?.body).toEqual(fetcher.mock.calls[2][1]?.body);
 });
});
