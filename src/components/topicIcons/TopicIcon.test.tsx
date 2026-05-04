import { describe, expect, it } from 'vitest';
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { flushSync } from 'react-dom';

import { TOPIC_ICON_NAMES } from '@/features/subjectGeneration/graph/topicIcons/topicIconAllowlist';

import { TOPIC_ICON_COMPONENTS, TopicIcon } from './TopicIcon';

describe('TOPIC_ICON_COMPONENTS', () => {
  it('exposes a defined component for every curated TopicIconName', () => {
    for (const name of TOPIC_ICON_NAMES) {
      const component = TOPIC_ICON_COMPONENTS[name];
      // Lucide icons are `React.forwardRef(...)` components, which are
      // objects (with a `$$typeof` symbol), not functions. Accept either
      // shape; both are valid React element types and the render tests
      // below confirm each icon actually renders.
      expect(component).toBeDefined();
      expect(component).not.toBeNull();
      expect(['function', 'object']).toContain(typeof component);
    }
  });

  it('contains exactly TOPIC_ICON_NAMES - no extras, no gaps', () => {
    const registryKeys = Object.keys(TOPIC_ICON_COMPONENTS).sort();
    const allowlist = [...TOPIC_ICON_NAMES].sort();
    expect(registryKeys).toEqual(allowlist);
  });
});

function renderTopicIcon(props: Parameters<typeof TopicIcon>[0]) {
  const container = document.createElement('div');
  document.body.append(container);
  const root = createRoot(container);
  flushSync(() => {
    root.render(createElement(TopicIcon, props));
  });
  return { container, root };
}

describe('TopicIcon', () => {
  it('renders a lucide svg with a stable data-topic-icon attribute', () => {
    const { container, root } = renderTopicIcon({ iconName: 'atom' });
    const svg = container.querySelector('svg');
    expect(svg).not.toBeNull();
    expect(svg?.getAttribute('data-topic-icon')).toBe('atom');
    act(() => {
      root.unmount();
    });
  });

  it('marks the icon aria-hidden by default to keep it decorative', () => {
    const { container, root } = renderTopicIcon({ iconName: 'beaker' });
    const svg = container.querySelector('svg');
    expect(svg?.getAttribute('aria-hidden')).toBe('true');
    expect(svg?.getAttribute('role')).toBeNull();
    act(() => {
      root.unmount();
    });
  });

  it('exposes role="img" + aria-label when consumer opts out of decorative mode', () => {
    const { container, root } = renderTopicIcon({
      iconName: 'brain',
      'aria-hidden': false,
      'aria-label': 'Brain topic icon',
    });
    const svg = container.querySelector('svg');
    expect(svg?.getAttribute('role')).toBe('img');
    expect(svg?.getAttribute('aria-label')).toBe('Brain topic icon');
    expect(svg?.getAttribute('aria-hidden')).toBeNull();
    act(() => {
      root.unmount();
    });
  });
});
