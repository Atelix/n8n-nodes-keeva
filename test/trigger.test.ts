import type { IDataObject } from 'n8n-workflow';
import { describe, expect, it, vi } from 'vitest';

import { MANUAL_ITEM_LIMIT, pollKeeva, type PollState } from '../nodes/KeevaTrigger/poll';
import type { KeevaPage } from '../nodes/Keeva/shared/transport';

const NOW = new Date('2026-10-19T12:00:00.000Z');

function pagedFetcher(items: IDataObject[]) {
	return vi.fn(async (qs: IDataObject): Promise<KeevaPage> => {
		const offset = Number(qs.offset ?? 0);
		const limit = Number(qs.limit ?? 50);
		return {
			items: items.slice(offset, offset + limit),
			nextOffset: offset + limit < items.length ? offset + limit : null,
		};
	});
}

function changes(count: number, start = Date.parse('2026-10-19T11:00:00.000Z')): IDataObject[] {
	return Array.from({ length: count }, (_, i) => ({
		id: `m${i}`,
		updatedAt: new Date(start + i * 1000).toISOString(),
	}));
}

describe('pollKeeva in an active workflow', () => {
	it('only records the time on the first poll after activation', async () => {
		const staticData: PollState = {};
		const fetchPage = pagedFetcher(changes(5));

		const result = await pollKeeva({ mode: 'trigger', staticData, now: NOW, fetchPage });

		expect(result).toBeNull();
		expect(fetchPage).not.toHaveBeenCalled();
		expect(staticData.lastTimeChecked).toBe(NOW.toISOString());
	});

	it('asks for changes since the last poll, reads every page and records the new time', async () => {
		const staticData: PollState = { lastTimeChecked: '2026-10-19T11:00:00.000Z' };
		const fetchPage = pagedFetcher(changes(230));

		const result = await pollKeeva({
			mode: 'trigger',
			staticData,
			now: NOW,
			fetchPage,
			query: { groupId: 'g1' },
		});

		expect(result).toHaveLength(230);
		expect(fetchPage).toHaveBeenCalledTimes(3);
		for (const [qs] of fetchPage.mock.calls) {
			expect(qs).toMatchObject({
				groupId: 'g1',
				updatedSince: '2026-10-19T11:00:00.000Z',
				limit: 100,
			});
		}
		expect(fetchPage.mock.calls.map(([qs]) => qs.offset)).toEqual([0, 100, 200]);
		expect(staticData.lastTimeChecked).toBe(NOW.toISOString());
	});

	it('emits the changes oldest first', async () => {
		const staticData: PollState = { lastTimeChecked: '2026-10-19T11:00:00.000Z' };
		const fetchPage = pagedFetcher([
			{ id: 'b', updatedAt: '2026-10-19T11:30:00.000Z' },
			{ id: 'a', updatedAt: '2026-10-19T11:10:00.000Z' },
		]);

		const result = await pollKeeva({ mode: 'trigger', staticData, now: NOW, fetchPage });

		expect(result?.map((item) => item.id)).toEqual(['a', 'b']);
	});

	it('returns null when nothing changed, and still moves the time forward', async () => {
		const staticData: PollState = { lastTimeChecked: '2026-10-19T11:00:00.000Z' };

		const result = await pollKeeva({
			mode: 'trigger',
			staticData,
			now: NOW,
			fetchPage: pagedFetcher([]),
		});

		expect(result).toBeNull();
		expect(staticData.lastTimeChecked).toBe(NOW.toISOString());
	});

	it('keeps the old time when the request fails, so the next poll retries the same window', async () => {
		const staticData: PollState = { lastTimeChecked: '2026-10-19T11:00:00.000Z' };
		const fetchPage = vi.fn(async () => {
			throw new Error('429 Too Many Requests');
		});

		await expect(pollKeeva({ mode: 'trigger', staticData, now: NOW, fetchPage })).rejects.toThrow(
			'429',
		);
		expect(staticData.lastTimeChecked).toBe('2026-10-19T11:00:00.000Z');
	});
});

describe('pollKeeva in a manual test run', () => {
	it('returns the most recently changed items without touching the recorded time', async () => {
		const staticData: PollState = {};
		const fetchPage = pagedFetcher(changes(25));

		const result = await pollKeeva({ mode: 'manual', staticData, now: NOW, fetchPage });

		expect(result).toHaveLength(MANUAL_ITEM_LIMIT);
		expect(result?.[0].id).toBe('m24');
		expect(fetchPage.mock.calls[0][0]).toMatchObject({ updatedSince: '2026-09-19T12:00:00.000Z' });
		expect(staticData).toEqual({});
	});

	it('falls back to any items when nothing changed recently', async () => {
		const items = changes(3, Date.parse('2025-01-01T00:00:00.000Z'));
		const fetchPage = vi.fn(
			async (qs: IDataObject): Promise<KeevaPage> => ({
				items: qs.updatedSince ? [] : items,
				nextOffset: null,
			}),
		);

		const result = await pollKeeva({ mode: 'manual', staticData: {}, now: NOW, fetchPage });

		expect(fetchPage).toHaveBeenCalledTimes(2);
		expect(fetchPage.mock.calls[1][0]).not.toHaveProperty('updatedSince');
		expect(result?.map((item) => item.id)).toEqual(['m2', 'm1', 'm0']);
	});

	it('returns null for an empty club', async () => {
		const result = await pollKeeva({
			mode: 'manual',
			staticData: {},
			now: NOW,
			fetchPage: pagedFetcher([]),
		});
		expect(result).toBeNull();
	});
});
