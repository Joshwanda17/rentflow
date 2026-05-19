import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, cleanup } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import AgentNavFAB from './AgentNavFAB';

// useAuth → pretend the current user is an agent so the FAB mounts.
vi.mock('@/hooks/useAuth', () => ({
  useAuth: () => ({ role: 'agent' }),
}));

// Capture toast calls so we can assert the "Press back again to exit" hint.
const toastSpy = vi.fn();
vi.mock('@/hooks/use-toast', () => ({
  toast: (...args: unknown[]) => toastSpy(...args),
}));

// Framer-motion's AnimatePresence + motion.div aren't relevant to behaviour —
// the test only cares about effects. The real lib works in jsdom but mocking
// keeps tests fast and avoids RAF/timer churn.
vi.mock('framer-motion', () => ({
  AnimatePresence: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  motion: new Proxy(
    {},
    {
      get: () => (props: Record<string, unknown> & { children?: React.ReactNode }) => {
        const { children, ...rest } = props;
        return <div {...rest}>{children}</div>;
      },
    },
  ),
}));

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <AgentNavFAB />
    </MemoryRouter>,
  );
}

describe('AgentNavFAB — Android hardware Back handling', () => {
  beforeEach(() => {
    sessionStorage.clear();
    toastSpy.mockClear();
  });
  afterEach(() => {
    cleanup();
    // Drain any pending guard timeouts.
    vi.useRealTimers();
  });

  it('closes an open modal instead of navigating when system Back fires', () => {
    renderAt('/agent/tenants/abc-123');

    // Simulate a Radix dialog being open in the document.
    const modal = document.createElement('div');
    modal.setAttribute('role', 'dialog');
    modal.setAttribute('data-state', 'open');
    document.body.appendChild(modal);

    const pushSpy = vi.spyOn(window.history, 'pushState');
    const escapes: KeyboardEvent[] = [];
    const onKey = (e: Event) => {
      if ((e as KeyboardEvent).key === 'Escape') escapes.push(e as KeyboardEvent);
    };
    document.addEventListener('keydown', onKey);

    window.dispatchEvent(new PopStateEvent('popstate'));

    // The handler re-pushes a sentinel so the next press is also captured,
    // and dispatches Escape so Radix closes the modal.
    expect(pushSpy).toHaveBeenCalledTimes(1);
    expect(pushSpy.mock.calls[0][0]).toEqual({ welileNavGuard: true });
    expect(escapes).toHaveLength(1);

    document.removeEventListener('keydown', onKey);
    modal.remove();
    pushSpy.mockRestore();
  });

  it('requires two Back presses to exit from the dashboard', () => {
    vi.useFakeTimers();
    const pushSpy = vi.spyOn(window.history, 'pushState');

    renderAt('/dashboard');

    // Mount itself seeds one guard so the first hardware Back is captured.
    expect(pushSpy).toHaveBeenCalledTimes(1);

    // First press: re-arm, re-push guard, and toast the warning.
    window.dispatchEvent(new PopStateEvent('popstate'));
    expect(pushSpy).toHaveBeenCalledTimes(2);
    expect(toastSpy).toHaveBeenCalledTimes(1);
    expect(toastSpy.mock.calls[0][0]).toMatchObject({
      description: expect.stringMatching(/press back again/i),
    });

    // Second press within the 2s window: do NOT re-push — the browser is
    // allowed to actually exit. Toast is not re-shown.
    window.dispatchEvent(new PopStateEvent('popstate'));
    expect(pushSpy).toHaveBeenCalledTimes(2);
    expect(toastSpy).toHaveBeenCalledTimes(1);

    // After the disarm window elapses, the next press re-shows the warning.
    vi.advanceTimersByTime(2100);
    window.dispatchEvent(new PopStateEvent('popstate'));
    expect(pushSpy).toHaveBeenCalledTimes(3);
    expect(toastSpy).toHaveBeenCalledTimes(2);

    pushSpy.mockRestore();
  });
});
