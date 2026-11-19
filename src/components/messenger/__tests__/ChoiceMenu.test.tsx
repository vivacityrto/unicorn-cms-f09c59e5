import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ChoiceMenu } from '../ChoiceMenu';

const options = [{ value: 'general', label: 'General' }, { value: 'task', label: 'Task' }];

describe('ChoiceMenu', () => {
  it('shows the chosen option and changes it', async () => {
    const onChange = vi.fn();
    render(<ChoiceMenu id="c" value="general" options={options} onChange={onChange} />);
    await userEvent.click(screen.getByRole('button', { name: 'General' }));
    await userEvent.click(await screen.findByRole('menuitemradio', { name: 'Task' }));
    expect(onChange).toHaveBeenCalledWith('task');
  });

  it('does not lock the page scroll while open', async () => {
    render(<ChoiceMenu id="c" value="general" options={options} onChange={() => undefined} />);
    await userEvent.click(screen.getByRole('button', { name: 'General' }));
    await screen.findByRole('menuitemradio', { name: 'Task' });
    expect(document.body.style.overflow).not.toBe('hidden');
    expect(document.body.getAttribute('data-scroll-locked')).toBeNull();
  });
});
