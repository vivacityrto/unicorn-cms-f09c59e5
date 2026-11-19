import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({
  create: vi.fn(),
  attach: vi.fn(),
  warn: vi.fn(),
}));

vi.mock('@/hooks/useClientCommunications', () => ({ useClientCommunications: () => ({ createConversation: { mutateAsync: h.create } }) }));
vi.mock('@/contexts/ClientTenantContext', () => ({ useClientTenant: () => ({ activeTenantId: 9 }) }));
vi.mock('@/lib/messageAttachmentsFirst', () => ({ attachmentProblem: () => null, attachToFirstMessage: h.attach }));
vi.mock('sonner', () => ({ toast: { warning: h.warn, error: vi.fn() } }));
Element.prototype.scrollIntoView = vi.fn();

import { NewMessagePane } from './NewMessagePane';

const api = () => ({ onBack: vi.fn(), select: vi.fn(), headerActions: <button>close</button> });

beforeEach(() => {
  h.create.mockReset().mockResolvedValue('conv-1');
  h.attach.mockReset().mockResolvedValue([]);
  h.warn.mockReset();
  window.localStorage.clear();
});

describe('a new message from the client portal, in the bubble', () => {
  it('creates the conversation with the subject, category and message, then opens it', async () => {
    const a = api();
    render(<NewMessagePane api={a} />);
    fireEvent.change(screen.getByLabelText(/Subject/), { target: { value: '  Audit dates ' } });
    fireEvent.change(screen.getByRole('textbox', { name: 'Message' }), { target: { value: 'When is it?' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send message' }));
    await waitFor(() => expect(h.create).toHaveBeenCalledWith({ subject: 'Audit dates', type: 'general', firstMessage: 'When is it?' }));
    await waitFor(() => expect(a.select).toHaveBeenCalledWith('conv-1'));
  });

  it('sends no subject when none is typed', async () => {
    render(<NewMessagePane api={api()} />);
    fireEvent.change(screen.getByRole('textbox', { name: 'Message' }), { target: { value: 'Hi' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send message' }));
    await waitFor(() => expect(h.create).toHaveBeenCalledWith({ subject: undefined, type: 'general', firstMessage: 'Hi' }));
  });

  it('says which file could not be attached, but still opens the sent conversation', async () => {
    h.attach.mockResolvedValue(['plan.pdf']);
    const a = api();
    render(<NewMessagePane api={a} />);
    const file = new File(['x'], 'plan.pdf', { type: 'application/pdf' });
    fireEvent.change(document.querySelector('input[type="file"]') as HTMLInputElement, { target: { files: [file] } });
    fireEvent.change(screen.getByRole('textbox', { name: 'Message' }), { target: { value: 'See attached' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send message' }));
    await waitFor(() => expect(h.warn).toHaveBeenCalledWith('Your message was sent, but plan.pdf could not be attached.'));
    expect(h.attach).toHaveBeenCalledWith('conv-1', 9, [file]);
    expect(a.select).toHaveBeenCalledWith('conv-1');
  });

  it('does not open anything, and keeps the text, when the conversation could not be created', async () => {
    h.create.mockRejectedValue(new Error('nope'));
    const a = api();
    render(<NewMessagePane api={a} />);
    fireEvent.change(screen.getByRole('textbox', { name: 'Message' }), { target: { value: 'Hi' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send message' }));
    await screen.findByRole('alert');
    expect(a.select).not.toHaveBeenCalled();
    expect(screen.getByRole('textbox', { name: 'Message' })).toHaveValue('Hi');
  });
});
