'use client';

import { useEffect } from 'react';

import { bootstrapMentor } from '@/features/mentor/mentorBootstrap';

/**
 * Client-only mount that runs the mentor bootstrap exactly once. The bootstrap
 * subscribes to the app event bus and schedules the deferred onboarding
 * welcome enqueue.
 *
 * Mirrors `EventBusHandlersMount`: layouts are Server Components, but the
 * subscriptions must run in the browser to attach to `window`.
 */
export function MentorBootstrapMount() {
  useEffect(() => {
    bootstrapMentor();
  }, []);
  return null;
}
