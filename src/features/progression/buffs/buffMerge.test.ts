/**
 * Follow-up plan §2.3 — buffMerge module interface (Fix #4).
 *
 * Centralized in `buffMerge.ts` after three privately-duplicated copies
 * were consolidated. Tests verify the three core invariants the call
 * sites depend on:
 *
 *   - Dedupe by `(buffId | source | condition)` keeps the LAST occurrence,
 *     so concatenating `[...current, ...incoming]` ends up with the
 *     freshly-granted entry.
 *   - `normalizeActiveBuffs` drops session-scoped buffs from the prior
 *     set before merging in the incoming set (session-end filter).
 *   - Repeat application is idempotent.
 */
import { describe, expect, it } from 'vitest';

import type { Buff } from '@/types/progression';

import { dedupeBuffsById, normalizeActiveBuffs } from './buffMerge';

const nowMs = 1_700_000_000_000;

function makeBuff(overrides: Partial<Buff> = {}): Buff {
	return {
		buffId: 'xp-multiplier',
		modifierType: 'xp_multiplier',
		magnitude: 1.5,
		condition: 'manual',
		source: 'ritual',
		issuedAt: nowMs,
		instanceId: 'inst-1',
		stacks: 1,
		...overrides,
	} as Buff;
}

describe('dedupeBuffsById', () => {
	it('keeps the last occurrence per (buffId | source | condition) key', () => {
		const stale = makeBuff({ instanceId: 'inst-old', magnitude: 1.2 });
		const fresh = makeBuff({ instanceId: 'inst-new', magnitude: 1.8 });
		const result = dedupeBuffsById([stale, fresh]);
		expect(result).toHaveLength(1);
		expect(result[0]?.instanceId).toBe('inst-new');
		expect(result[0]?.magnitude).toBe(1.8);
	});

	it('treats different sources or conditions as distinct keys', () => {
		const ritualBuff = makeBuff({ source: 'ritual', instanceId: 'inst-r' });
		const devBuff = makeBuff({ source: 'dev', instanceId: 'inst-d' });
		const sessionEndBuff = makeBuff({
			source: 'ritual',
			condition: 'session_end',
			instanceId: 'inst-s',
		});
		const result = dedupeBuffsById([ritualBuff, devBuff, sessionEndBuff]);
		expect(result).toHaveLength(3);
		expect(result.map((b) => b.instanceId)).toEqual(['inst-r', 'inst-d', 'inst-s']);
	});

	it('preserves original ordering of distinct keys', () => {
		const a = makeBuff({ buffId: 'a', source: 'src-a', instanceId: 'a-1' });
		const b = makeBuff({ buffId: 'b', source: 'src-b', instanceId: 'b-1' });
		const c = makeBuff({ buffId: 'c', source: 'src-c', instanceId: 'c-1' });
		const result = dedupeBuffsById([a, b, c]);
		expect(result.map((x) => x.buffId)).toEqual(['a', 'b', 'c']);
	});

	it('returns an empty array for empty input', () => {
		expect(dedupeBuffsById([])).toEqual([]);
	});
});

describe('normalizeActiveBuffs', () => {
	it('drops session-scoped buffs from the prior set before merging incoming', () => {
		const priorSessionEnd = makeBuff({
			condition: 'session_end',
			instanceId: 'inst-prior-session',
		});
		const priorManual = makeBuff({
			condition: 'manual',
			instanceId: 'inst-prior-manual',
			source: 'dev',
		});
		const incoming = makeBuff({
			condition: 'manual',
			instanceId: 'inst-incoming',
			source: 'ritual',
		});

		const result = normalizeActiveBuffs([priorSessionEnd, priorManual], [incoming]);
		const instanceIds = result.map((b) => b.instanceId);
		expect(instanceIds).toContain('inst-prior-manual');
		expect(instanceIds).toContain('inst-incoming');
		expect(instanceIds).not.toContain('inst-prior-session');
	});

	it('collapses two simultaneous grants from the same (source, condition) to one entry', () => {
		const a = makeBuff({ instanceId: 'inst-a', magnitude: 1.5 });
		const b = makeBuff({ instanceId: 'inst-b', magnitude: 2.0 });
		const result = normalizeActiveBuffs([], [a, b]);
		expect(result).toHaveLength(1);
		expect(result[0]?.instanceId).toBe('inst-b');
	});

	it('is idempotent under repeat application with the same incoming set', () => {
		const current = makeBuff({
			condition: 'manual',
			source: 'ritual',
			instanceId: 'inst-current',
		});
		const incoming = makeBuff({
			condition: 'manual',
			source: 'ritual',
			instanceId: 'inst-incoming',
		});
		const pass1 = normalizeActiveBuffs([current], [incoming]);
		const pass2 = normalizeActiveBuffs(pass1, [incoming]);
		expect(pass2).toHaveLength(pass1.length);
		expect(pass2.map((b) => b.instanceId).sort()).toEqual(
			pass1.map((b) => b.instanceId).sort(),
		);
	});

	it('returns the incoming set when current is empty', () => {
		const incoming = [
			makeBuff({ buffId: 'a', source: 'src-a', instanceId: 'a' }),
			makeBuff({ buffId: 'b', source: 'src-b', instanceId: 'b' }),
		];
		const result = normalizeActiveBuffs([], incoming);
		expect(result).toHaveLength(2);
	});

	it('returns the non-session-end subset of current when incoming is empty', () => {
		const current = [
			makeBuff({
				condition: 'session_end',
				instanceId: 'inst-session',
			}),
			makeBuff({
				condition: 'manual',
				instanceId: 'inst-manual',
				source: 'dev',
			}),
		];
		const result = normalizeActiveBuffs(current, []);
		expect(result).toHaveLength(1);
		expect(result[0]?.instanceId).toBe('inst-manual');
	});
});
