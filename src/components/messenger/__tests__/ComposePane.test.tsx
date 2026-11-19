import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ComposePane } from '../ComposePane';
import { ThreadList } from '../ThreadList';
import type { MessengerThread } from '../types';

Element.prototype.scrollIntoView = vi.fn();

describe('ComposePane', () => {
  it('holds Send back, and says why, until what is above the box is filled in', () => {
    const onSend = vi.fn().mockResolvedValue(undefined);
    render(<ComposePane ready={false} notReadyReason="Choose a client to write to." onSend={onSend} draftScope="t1" />);
    expect(screen.getByText('Choose a client to write to.')).toBeInTheDocument();
    fireEvent.change(screen.getByRole('textbox', { name: 'Message' }), { target: { value: 'hello' } });
    expect(screen.getByRole('button', { name: 'Send message' })).toBeDisabled();
    fireEvent.keyDown(screen.getByRole('textbox', { name: 'Message' }), { key: 'Enter' });
    expect(onSend).not.toHaveBeenCalled();
  });

  it('sends the message and files once ready, and shows its fields and back button', async () => {
    const onSend = vi.fn().mockResolvedValue(undefined);
    const onBack = vi.fn();
    render(
      <ComposePane ready onSend={onSend} onBack={onBack} subtitle="To the Vivacity team" draftScope="t2" headerActions={<button>close</button>}>
        <p>a field</p>
      </ComposePane>,
    );
    expect(screen.getByRole('heading', { name: 'New message' })).toBeInTheDocument();
    expect(screen.getByText('To the Vivacity team')).toBeInTheDocument();
    expect(screen.getByText('a field')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'close' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Back to conversations' }));
    expect(onBack).toHaveBeenCalled();
    fireEvent.change(screen.getByRole('textbox', { name: 'Message' }), { target: { value: 'hello' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send message' }));
    await waitFor(() => expect(onSend).toHaveBeenCalledWith({ body: 'hello', files: [] }));
  });
});

describe('a hidden thread', () => {
  const t = (id: string, hidden = false): MessengerThread => ({ id, kind: 'general', title: `Thread ${id}`, unread: false, hidden });
  it('is never a row in the list, so the compose thread cannot be listed', () => {
    render(<ThreadList threads={[t('a'), t('compose:new', true)]} selectedId={null} onSelect={vi.fn()} />);
    expect(screen.getByText('Thread a')).toBeInTheDocument();
    expect(screen.queryByText('Thread compose:new')).not.toBeInTheDocument();
  });
});
