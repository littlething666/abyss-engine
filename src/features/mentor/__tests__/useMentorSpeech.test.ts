import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as React from 'react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';

import {
  DEFAULT_EPHEMERAL_STATE,
  DEFAULT_PERSISTED_STATE,
  useMentorStore,
} from '../mentorStore';
import { useMentorSpeech, type UseMentorSpeechResult } from '../useMentorSpeech';

// ---- speechSynthesis test double -------------------------------------------

interface FakeUtterance {
  text: string;
  onend: ((e?: unknown) => void) | null;
  onerror: ((e?: unknown) => void) | null;
}

let utterances: FakeUtterance[] = [];
let speakSpy: ReturnType<typeof vi.fn>;
let cancelSpy: ReturnType<typeof vi.fn>;

function installSpeechSynthesis(): void {
  utterances = [];
  speakSpy = vi.fn((u: FakeUtterance) => {
    utterances.push(u);
  });
  cancelSpy = vi.fn(() => {
    // Mirror real browser behavior: pending utterances do not get onend.
    utterances = [];
  });
  Object.defineProperty(window, 'speechSynthesis', {
    configurable: true,
    value: { speak: speakSpy, cancel: cancelSpy },
  });
  class FakeSpeechSynthesisUtterance implements FakeUtterance {
    text: string;
    onend: ((e?: unknown) => void) | null = null;
    onerror: ((e?: unknown) => void) | null = null;
    constructor(text: string) {
      this.text = text;
    }
  }
  Object.defineProperty(window, 'SpeechSynthesisUtterance', {
    configurable: true,
    value: FakeSpeechSynthesisUtterance,
  });
}

function uninstallSpeechSynthesis(): void {
  // Setting to undefined matches the no-Web-Speech-API code path checked by
  // useMentorSpeech (`!window.speechSynthesis` / `typeof ... === 'undefined'`).
  Object.defineProperty(window, 'speechSynthesis', {
    configurable: true,
    value: undefined,
  });
  Object.defineProperty(window, 'SpeechSynthesisUtterance', {
    configurable: true,
    value: undefined,
  });
}

// ---- minimal renderHook ----------------------------------------------------

interface HookHandle<T> {
  current: T;
  rerender: () => void;
  unmount: () => void;
}

function renderHook<T>(useHook: () => T): HookHandle<T> {
  const ref: { current: T } = { current: undefined as unknown as T };
  const container = document.createElement('div');
  document.body.appendChild(container);
  let root: Root;

  function HookProbe(): null {
    ref.current = useHook();
    return null;
  }

  act(() => {
    root = createRoot(container);
    root.render(React.createElement(HookProbe));
  });

  return {
    get current() {
      return ref.current;
    },
    rerender() {
      act(() => {
        root.render(React.createElement(HookProbe));
      });
    },
    unmount() {
      act(() => {
        root.unmount();
      });
      container.remove();
    },
  } as HookHandle<T>;
}

// ---- tests -----------------------------------------------------------------

beforeEach(() => {
  useMentorStore.setState({
    ...DEFAULT_PERSISTED_STATE,
    ...DEFAULT_EPHEMERAL_STATE,
  });
  installSpeechSynthesis();
});

afterEach(() => {
  // Clean up any straggler utterances and the speechSynthesis stub.
  uninstallSpeechSynthesis();
});

describe('useMentorSpeech', () => {
  it('enabled is false when mentor narration is disabled', () => {
    useMentorStore.setState({ narrationEnabled: false });
    const hook = renderHook(useMentorSpeech);
    expect(hook.current.enabled).toBe(false);
    hook.unmount();
  });

  it('enabled is true when mentor narration is enabled', () => {
    useMentorStore.setState({ narrationEnabled: true });
    const hook = renderHook(useMentorSpeech);
    expect(hook.current.enabled).toBe(true);
    hook.unmount();
  });

  it('enabled is false when narrator is disabled mid-utterance', () => {
    useMentorStore.setState({ narrationEnabled: true });
    const hook = renderHook(useMentorSpeech);

    act(() => {
      hook.current.speak('mid-sentence');
    });
    expect(cancelSpy).not.toHaveBeenCalled();

    act(() => {
      useMentorStore.setState({ narrationEnabled: false });
    });
    hook.rerender();

    expect(cancelSpy).toHaveBeenCalled();
    expect(hook.current.enabled).toBe(false);
    expect(hook.current.isSpeaking).toBe(false);
    hook.unmount();
  });

  it('speak is a no-op when disabled', () => {
    useMentorStore.setState({ narrationEnabled: false });
    const hook = renderHook(useMentorSpeech);

    act(() => {
      hook.current.speak('hello');
    });

    expect(speakSpy).not.toHaveBeenCalled();
    expect(hook.current.isSpeaking).toBe(false);
    hook.unmount();
  });

  it('speak is a no-op when text is empty', () => {
    useMentorStore.setState({ narrationEnabled: true });
    const hook = renderHook(useMentorSpeech);

    act(() => {
      hook.current.speak('');
    });

    expect(speakSpy).not.toHaveBeenCalled();
    hook.unmount();
  });

  it('speak hands off to window.speechSynthesis.speak when enabled', () => {
    useMentorStore.setState({ narrationEnabled: true });
    const hook = renderHook(useMentorSpeech);

    act(() => {
      hook.current.speak('first line');
    });

    expect(speakSpy).toHaveBeenCalledTimes(1);
    const u = utterances[0]!;
    expect(u.text).toBe('first line');
    expect(hook.current.isSpeaking).toBe(true);

    // onend resets isSpeaking back to false when the utterance count hits 0.
    act(() => {
      u.onend?.();
    });
    expect(hook.current.isSpeaking).toBe(false);

    hook.unmount();
  });

  it('onerror also resets isSpeaking to false', () => {
    useMentorStore.setState({ narrationEnabled: true });
    const hook = renderHook(useMentorSpeech);

    act(() => {
      hook.current.speak('whoops');
    });
    expect(hook.current.isSpeaking).toBe(true);

    act(() => {
      utterances[0]!.onerror?.();
    });
    expect(hook.current.isSpeaking).toBe(false);

    hook.unmount();
  });

  it('cancel cancels in-flight speech and resets isSpeaking', () => {
    useMentorStore.setState({ narrationEnabled: true });
    const hook = renderHook(useMentorSpeech);

    act(() => {
      hook.current.speak('one');
      hook.current.speak('two');
    });
    expect(speakSpy).toHaveBeenCalledTimes(2);
    expect(hook.current.isSpeaking).toBe(true);

    act(() => {
      hook.current.cancel();
    });
    expect(cancelSpy).toHaveBeenCalledTimes(1);
    expect(hook.current.isSpeaking).toBe(false);

    hook.unmount();
  });

  it('cancel does NOT call window.speechSynthesis.cancel when no utterance is in flight', () => {
    useMentorStore.setState({ narrationEnabled: true });
    const hook = renderHook(useMentorSpeech);

    act(() => {
      hook.current.cancel();
    });
    expect(cancelSpy).not.toHaveBeenCalled();

    hook.unmount();
  });

  it('cancels any in-flight utterance on unmount', () => {
    useMentorStore.setState({ narrationEnabled: true });
    const hook = renderHook(useMentorSpeech);

    act(() => {
      hook.current.speak('still talking');
    });
    expect(cancelSpy).not.toHaveBeenCalled();

    hook.unmount();

    expect(cancelSpy).toHaveBeenCalledTimes(1);
  });

  it('speak is a silent no-op when window.speechSynthesis is unavailable', () => {
    uninstallSpeechSynthesis();
    useMentorStore.setState({ narrationEnabled: true });

    const hook = renderHook(useMentorSpeech);

    expect(() => {
      act(() => {
        hook.current.speak('hello');
      });
    }).not.toThrow();

    // Reinstall so afterEach's uninstall is symmetric.
    installSpeechSynthesis();

    expect(hook.current.isSpeaking).toBe(false);
    hook.unmount();
  });

  it('returns a stable shape', () => {
    useMentorStore.setState({ narrationEnabled: true });
    const hook = renderHook(useMentorSpeech);
    const result: UseMentorSpeechResult = hook.current;
    expect(typeof result.speak).toBe('function');
    expect(typeof result.cancel).toBe('function');
    expect(typeof result.isSpeaking).toBe('boolean');
    expect(typeof result.enabled).toBe('boolean');
    hook.unmount();
  });
});
