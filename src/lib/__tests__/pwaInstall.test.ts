import { describe, it, expect, beforeEach, vi } from 'vitest';
import { canPromptInstall, promptInstall, subscribeInstall, setupInstallSupport } from '@/lib/pwaInstall';

function fakeInstallEvent(outcome: 'accepted' | 'dismissed') {
  const event = new Event('beforeinstallprompt', { cancelable: true }) as Event & Record<string, unknown>;
  event.prompt = vi.fn(async () => {});
  event.userChoice = Promise.resolve({ outcome });
  return event;
}

describe('pwaInstall', () => {
  beforeEach(() => {
    setupInstallSupport();
  });

  it('reports no prompt until the browser offers one', () => {
    expect(canPromptInstall()).toBe(false);
  });

  it('captures the browser prompt, notifies subscribers and resolves on accept', async () => {
    const listener = vi.fn();
    const unsubscribe = subscribeInstall(listener);
    const event = fakeInstallEvent('accepted');
    window.dispatchEvent(event);

    expect(event.defaultPrevented).toBe(true);
    expect(canPromptInstall()).toBe(true);
    expect(listener).toHaveBeenCalled();

    await expect(promptInstall()).resolves.toBe(true);
    expect(event.prompt).toHaveBeenCalledTimes(1);
    expect(canPromptInstall()).toBe(false);
    unsubscribe();
  });

  it('resolves false when the person dismisses the prompt', async () => {
    window.dispatchEvent(fakeInstallEvent('dismissed'));
    await expect(promptInstall()).resolves.toBe(false);
  });

  it('does nothing when no prompt is available', async () => {
    await expect(promptInstall()).resolves.toBe(false);
  });
});
