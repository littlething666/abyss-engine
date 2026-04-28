import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as React from 'react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';

// Mock the global TTS toggle hook so we can flip enableTts deterministically.
let enableTtsValue = false;
vi.mock('@/hooks/useInferenceTtsToggle', () => ({
  useInferenceTtsToggle: () => ({
    enableTts: enableTtsValue,
    toggleTts: vi.fn(),
  }),
}));

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
  enableTtsValue = false;
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
  it('enabled is false when the global TTS toggle is off', () => {
    enableTtsValue = false;
    useMentorStore.setState({ ttsMuted: false });
    const hook = renderHook(useMentorSpeech);
    expect(hook.current.enabled).toBe(false);
    hook.unmount();
  });

  it('enabled is false when mentor mute is on, even with the global toggle on', () => {
    enableTtsValue = true;
    useMentorStore.setState({ ttsMuted: true });
    const hook = renderHook(useMentorSpeech);
    expect(hook.current.enabled).toBe(false);
    hook.unmount();
  });

  it('enabled is true when both gates are on', () => {
    enableTtsValue = true;
    useMentorStore.setState({ ttsMuted: false });
    const hook = renderHook(useMentorSpeech);
    expect(hook.current.enabled).toBe(true);
    hook.unmount();
  });

  it('speak is a no-op when disabled', () => {
    enableTtsValue = false;
    useMentorStore.setState({ ttsMuted: false });
    const hook = renderHook(useMentorSpeech);

    act(() => {
      hook.current.speak('hello');
    });

    expect(speakSpy).not.toHaveBeenCalled();
    expect(hook.current.isSpeaking).toBe(false);
    hook.unmount();
  });

  it('speak is a no-op when text is empty', () => {
    enableTtsValue = true;
    useMentorStore.setState({ ttsMuted: false });
    const hook = renderHook(useMentorSpeech);

    act(() => {
      hook.current.speak('');
    });

    expect(speakSpy).not.toHaveBeenCalled();
    hook.unmount();
  });

  it('speak hands off to window.speechSynthesis.speak when enabled', () => {
    enableTtsValue = true;
    useMentorStore.setState({ ttsMuted: false });
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
    enableTtsValue = true;
    useMentorStore.setState({ ttsMuted: false });
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
    enableTtsValue = true;
    useMentorStore.setState({ ttsMuted: false });
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
    enableTtsValue = true;
    useMentorStore.setState({ ttsMuted: false });
    const hook = renderHook(useMentorSpeech);

    act(() => {
      hook.current.cancel();
    });
    expect(cancelSpy).not.toHaveBeenCalled();

    hook.unmount();
  });

  it('cancels any in-flight utterance on unmount', () => {
    enableTtsValue = true;
    useMentorStore.setState({ ttsMuted: false });
    const hook = renderHook(useMentorSpeech);

    act(() => {
      hook.current.speak('still talking');
    });
    expect(cancelSpy).not.toHaveBeenCalled();

    hook.unmount();

    expect(cancelSpy).toHaveBeenCalledTimes(1);
  });

  it('cancels in-flight speech when the gate flips off mid-utterance', () => {
    enableTtsValue = true;
    useMentorStore.setState({ ttsMuted: false });
    const hook = renderHook(useMentorSpeech);

    act(() => {
      hook.current.speak('mid-sentence');
    });
    expect(cancelSpy).not.toHaveBeenCalled();

    // Flip mentor mute on. Re-render so the hook observes the new gate value.
    act(() => {
      useMentorStore.setState({ ttsMuted: true });
    });
    hook.rerender();

    expect(cancelSpy).toHaveBeenCalled();
    expect(hook.current.enabled).toBe(false);
    expect(hook.current.isSpeaking).toBe(false);

    hook.unmount();
  });

  it('speak is a silent no-op when window.speechSynthesis is unavailable', () => {
    uninstallSpeechSynthesis();
    enableTtsValue = true;
    useMentorStore.setState({ ttsMuted: false });

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
    enableTtsValue = true;
    useMentorStore.setState({ ttsMuted: false });
    const hook = renderHook(useMentorSpeech);
    const result: UseMentorSpeechResult = hook.current;
    expect(typeof result.speak).toBe('function');
    expect(typeof result.cancel).toBe('function');
    expect(typeof result.isSpeaking).toBe('boolean');
    expect(typeof result.enabled).toBe('boolean');
    hook.unmount();
  });
});
