import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const chat = vi.hoisted(() => ({
  conversationId: null as string | null,
  messages: [] as Array<{ id: string; role: string; content: string }>,
  isSending: false,
  conversationList: [] as Array<{ id: string; title: string | null }>,
  sendMessage: vi.fn(),
  startNewConversation: vi.fn(),
  loadConversationHistory: vi.fn(),
  openConversation: vi.fn(),
  deleteConversation: vi.fn(),
  refetchUsage: vi.fn(),
  closeDock: vi.fn(),
  toast: vi.fn(),
}));

vi.mock('@/hooks/useAskVivAssistantChat', () => ({
  useAskVivAssistantChat: () => ({
    conversationId: chat.conversationId,
    messages: chat.messages,
    isSending: chat.isSending,
    conversationList: chat.conversationList,
    loadingHistory: false,
    pageTenantName: 'Acme Training',
    startNewConversation: chat.startNewConversation,
    loadConversationHistory: chat.loadConversationHistory,
    openConversation: chat.openConversation,
    deleteConversation: chat.deleteConversation,
    sendMessage: chat.sendMessage,
  }),
}));
vi.mock('@/hooks/useAskVivAssistantUsage', () => ({ useAskVivAssistantUsage: () => ({ refetchUsage: chat.refetchUsage }) }));
vi.mock('@/hooks/useAskVivSuggestedFaqs', () => ({ useAskVivSuggestedFaqs: () => ({ faqs: [{ id: 'f1', prompt: 'Summarise this client' }, { id: 'f2', prompt: 'What is overdue?' }] }) }));
vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast: chat.toast }) }));
vi.mock('@/components/ask-viv-assistant/AssistantMessageBubble', () => ({ AssistantMessageBubble: ({ message }: { message: { content: string } }) => <p>{message.content}</p> }));
vi.mock('@/components/ask-viv-assistant/AssistantUsageGauge', () => ({ AssistantUsageGauge: () => <span>usage</span> }));
vi.mock('@/components/messenger', () => ({ useMessengerDock: () => ({ closeDock: chat.closeDock }) }));
Element.prototype.scrollIntoView = vi.fn();

import { StaffAskVivChat } from './StaffAskVivChat';

function Where() {
  const loc = useLocation();
  return <output data-testid="where">{loc.pathname + loc.search}</output>;
}

const show = (props: Partial<React.ComponentProps<typeof StaffAskVivChat>> = {}) =>
  render(
    <MemoryRouter>
      <StaffAskVivChat onBack={vi.fn()} headerActions={<button>close</button>} {...props} />
      <Where />
    </MemoryRouter>,
  );

beforeEach(() => {
  Object.assign(chat, { conversationId: null, messages: [], isSending: false, conversationList: [] });
  for (const k of ['sendMessage', 'startNewConversation', 'loadConversationHistory', 'openConversation', 'deleteConversation', 'refetchUsage', 'closeDock', 'toast'] as const) chat[k].mockReset();
  chat.sendMessage.mockResolvedValue(undefined);
  chat.deleteConversation.mockResolvedValue(undefined);
});

describe('Ask Viv for staff inside the bubble', () => {
  it('shows the client being viewed, the usage gauge, the header actions and a way back', () => {
    show();
    expect(screen.getByRole('heading', { level: 2, name: 'Ask Viv' })).toBeInTheDocument();
    expect(screen.getByText('Viewing Acme Training')).toBeInTheDocument();
    expect(screen.getByText('usage')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'close' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Back to conversations' })).toBeInTheDocument();
  });

  it('offers suggested questions that fill the box but are not sent until you send them', async () => {
    const user = userEvent.setup();
    show();
    await user.click(screen.getByRole('button', { name: 'Summarise this client' }));
    expect(screen.getByRole('textbox', { name: 'Ask Viv' })).toHaveValue('Summarise this client');
    expect(chat.sendMessage).not.toHaveBeenCalled();
  });

  it('sends only when you press Send or Enter, then refreshes the usage figure', async () => {
    const user = userEvent.setup();
    show();
    await user.type(screen.getByRole('textbox', { name: 'Ask Viv' }), 'Is Acme on track?{Enter}');
    await waitFor(() => expect(chat.sendMessage).toHaveBeenCalledWith('Is Acme on track?'));
    expect(chat.refetchUsage).toHaveBeenCalled();
    expect(screen.getByRole('textbox', { name: 'Ask Viv' })).toHaveValue('');
  });

  it('does not send an empty question, or a second one while an answer is on its way', async () => {
    const user = userEvent.setup();
    const { unmount } = show();
    expect(screen.getByRole('button', { name: 'Send' })).toBeDisabled();
    await user.type(screen.getByRole('textbox', { name: 'Ask Viv' }), '   {Enter}');
    expect(chat.sendMessage).not.toHaveBeenCalled();
    unmount();
    chat.isSending = true;
    chat.messages = [{ id: 'm0', role: 'user', content: 'Earlier question' }];
    show();
    expect(screen.getByRole('textbox', { name: 'Ask Viv' })).toBeDisabled();
    expect(screen.getByLabelText('Ask Viv is thinking')).toBeInTheDocument();
  });

  it('says so when a question could not be sent', async () => {
    const user = userEvent.setup();
    chat.sendMessage.mockRejectedValue(new Error('Daily limit reached'));
    show();
    await user.type(screen.getByRole('textbox', { name: 'Ask Viv' }), 'hello{Enter}');
    await waitFor(() => expect(chat.toast).toHaveBeenCalledWith(expect.objectContaining({ description: 'Daily limit reached', variant: 'destructive' })));
  });

  it('lists past conversations, opens one and deletes one', async () => {
    const user = userEvent.setup();
    chat.conversationList = [{ id: 'a', title: 'Acme audit' }, { id: 'b', title: null }];
    show();
    await user.click(screen.getByRole('button', { name: 'Conversation history' }));
    expect(chat.loadConversationHistory).toHaveBeenCalled();
    expect(screen.getByText('Acme audit')).toBeInTheDocument();
    expect(screen.getByText('Untitled conversation')).toBeInTheDocument();
    await user.click(screen.getByText('Acme audit'));
    expect(chat.openConversation).toHaveBeenCalledWith('a');
    await user.click(screen.getByRole('button', { name: 'Conversation history' }));
    await user.click(screen.getAllByRole('button', { name: 'Delete conversation' })[1]);
    expect(chat.deleteConversation).toHaveBeenCalledWith('b');
    expect(chat.openConversation).toHaveBeenCalledTimes(1);
  });

  it('starts a new conversation once there is something to leave', async () => {
    const user = userEvent.setup();
    chat.messages = [{ id: 'm1', role: 'assistant', content: 'Hello there' }];
    show();
    expect(screen.getByText('Hello there')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /New conversation/ }));
    expect(chat.startNewConversation).toHaveBeenCalled();
  });

  it('opens the full page with the conversation, and closes the bubble', async () => {
    const user = userEvent.setup();
    chat.conversationId = 'conv-9';
    show();
    await user.click(screen.getByRole('button', { name: 'Open Ask Viv full page' }));
    expect(screen.getByTestId('where')).toHaveTextContent('/ask-viv?conversation=conv-9');
    expect(chat.closeDock).toHaveBeenCalled();
  });

  it('opens the full page without a conversation when there is none yet', async () => {
    const user = userEvent.setup();
    show();
    await user.click(screen.getByRole('button', { name: 'Open Ask Viv full page' }));
    expect(screen.getByTestId('where')).toHaveTextContent(/^\/ask-viv$/);
  });
});
