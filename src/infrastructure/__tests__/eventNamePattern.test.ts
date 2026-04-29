import { describe, it, expect } from 'vitest';

import { APP_EVENT_NAMES } from '../eventBus';
import { PUB_SUB_EVENT_TYPES } from '../pubsub';
import { TelemetryEventTypeSchema } from '@/features/telemetry/types';
import { MENTOR_TRIGGER_IDS } from '@/features/mentor/mentorTypes';

/**
 * Canonical v1 event-name pattern (post hard-cut standardization).
 *
 *   <namespace>:<segment>
 *
 * - Each side of the colon is a kebab-cased token: lowercase a–z / 0–9,
 *   internal hyphens only.
 * - Exactly one colon separator. No dots, underscores, uppercase, or
 *   leading/trailing hyphens.
 */
const CANONICAL_EVENT_NAME = /^[a-z0-9]+(?:-[a-z0-9]+)*:[a-z0-9]+(?:-[a-z0-9]+)*$/;

describe('Event name canonical pattern (v1)', () => {
  describe('APP_EVENT_NAMES (app-bus)', () => {
    it.each(APP_EVENT_NAMES.map((name) => [name]))('%s matches pattern', (name) => {
      expect(name).toMatch(CANONICAL_EVENT_NAME);
    });
  });

  describe('PUB_SUB_EVENT_TYPES (cross-tab pubsub)', () => {
    it.each(PUB_SUB_EVENT_TYPES.map((name) => [name]))('%s matches pattern', (name) => {
      expect(name).toMatch(CANONICAL_EVENT_NAME);
    });
  });

  describe('TelemetryEventTypeSchema (telemetry)', () => {
    it.each(TelemetryEventTypeSchema.options.map((name) => [name]))('%s matches pattern', (name) => {
      expect(name).toMatch(CANONICAL_EVENT_NAME);
    });
  });

  describe('MENTOR_TRIGGER_IDS (mentor triggers)', () => {
    it.each(MENTOR_TRIGGER_IDS.map((name) => [name]))('%s matches pattern', (name) => {
      expect(name).toMatch(CANONICAL_EVENT_NAME);
    });
  });
});
