import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { PlanningSurveyPreview } from './PlanningSurveyPreview';

afterEach(() => { cleanup(); vi.restoreAllMocks(); });
describe('unmounted planning preview', () => {
  it('reviews without submitting, retaining answers on return', () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    const storageSpy = vi.spyOn(Storage.prototype, 'setItem');
    render(<PlanningSurveyPreview business="vivacity" />);
    fireEvent.change(screen.getByLabelText(/^Strengths:/), { target: { value: 'Sample only' } });
    fireEvent.click(screen.getByText('Review sample answers'));
    expect(screen.getByText('Sample only')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Submit unavailable in preview' })).toBeDisabled();
    fireEvent.click(screen.getByText('Back to questions'));
    expect(screen.getByLabelText(/^Strengths:/)).toHaveValue('Sample only');
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(storageSpy).not.toHaveBeenCalled();
  });
  it('clears memory when business or year changes', () => {
    const { rerender } = render(<PlanningSurveyPreview business="vivacity" />);
    fireEvent.change(screen.getByLabelText(/^Strengths:/), { target: { value: 'Vivacity sample' } });
    rerender(<PlanningSurveyPreview business="complyhub" />);
    expect(screen.getByLabelText(/^Strengths:/)).toHaveValue('');
    fireEvent.change(screen.getByLabelText(/^Strengths:/), { target: { value: '2027 sample' } });
    rerender(<PlanningSurveyPreview business="complyhub" year={2028} />);
    expect(screen.getByLabelText(/^Strengths:/)).toHaveValue('');
  });
  it('clears sample answers and states the anonymity limit', () => {
    render(<PlanningSurveyPreview business="vivacity" />);
    fireEvent.change(screen.getByLabelText(/^Strengths:/), { target: { value: 'Sample' } });
    fireEvent.click(screen.getByText('Clear sample answers'));
    expect(screen.getByLabelText(/^Strengths:/)).toHaveValue('');
    expect(screen.getByRole('status')).toHaveTextContent('Anonymous collection is not yet available or verified');
  });
});
