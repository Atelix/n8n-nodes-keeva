import type { IDataObject, IExecutePaginationFunctions, IHttpRequestOptions } from 'n8n-workflow';
import { describe, expect, it, vi } from 'vitest';

import { paginateByNextOffset } from '../nodes/Keeva/shared/pagination';
import { apiRoot, fetchAllPages, type KeevaPage } from '../nodes/Keeva/shared/transport';

/** A fake Keeva list of `total` items that pages like the real API. */
function fakeList(total: number) {
	const calls: IDataObject[] = [];
	const fetchPage = vi.fn(async (qs: IDataObject): Promise<KeevaPage> => {
		calls.push(qs);
		const offset = Number(qs.offset ?? 0);
		const limit = Number(qs.limit ?? 50);
		const items = Array.from({ length: Math.max(0, Math.min(limit, total - offset)) }, (_, i) => ({
			id: `item-${offset + i}`,
		}));
		return { items, nextOffset: offset + limit < total ? offset + limit : null };
	});
	return { fetchPage, calls };
}

describe('fetchAllPages', () => {
	it('follows nextOffset until it is null, with the largest page size and the filters', async () => {
		const { fetchPage, calls } = fakeList(250);

		const items = await fetchAllPages(fetchPage, {
			groupId: 'g1',
			updatedSince: '2026-10-01T00:00:00.000Z',
		});

		expect(items).toHaveLength(250);
		expect(items[0]).toEqual({ id: 'item-0' });
		expect(items[249]).toEqual({ id: 'item-249' });
		expect(calls).toEqual([
			{ groupId: 'g1', updatedSince: '2026-10-01T00:00:00.000Z', offset: 0, limit: 100 },
			{ groupId: 'g1', updatedSince: '2026-10-01T00:00:00.000Z', offset: 100, limit: 100 },
			{ groupId: 'g1', updatedSince: '2026-10-01T00:00:00.000Z', offset: 200, limit: 100 },
		]);
	});

	it('makes one request for a list that fits on one page', async () => {
		const { fetchPage } = fakeList(3);
		expect(await fetchAllPages(fetchPage)).toHaveLength(3);
		expect(fetchPage).toHaveBeenCalledTimes(1);
	});

	it('returns nothing for an empty list', async () => {
		const { fetchPage } = fakeList(0);
		expect(await fetchAllPages(fetchPage)).toEqual([]);
	});

	it('uses the offset Keeva gives rather than counting itself', async () => {
		const pages: KeevaPage[] = [
			{ items: [{ id: 'a' }], nextOffset: 7 },
			{ items: [{ id: 'b' }], nextOffset: null },
		];
		const offsets: unknown[] = [];
		const fetchPage = vi.fn(async (qs: IDataObject) => {
			offsets.push(qs.offset);
			return pages.shift() as KeevaPage;
		});

		await fetchAllPages(fetchPage);

		expect(offsets).toEqual([0, 7]);
	});

	it('stops with an error instead of looping when nextOffset does not move forward', async () => {
		const fetchPage = vi.fn(async () => ({ items: [{ id: 'a' }], nextOffset: 0 }));
		await expect(fetchAllPages(fetchPage)).rejects.toThrow(/invalid nextOffset/);
	});
});

describe('paginateByNextOffset (Return All)', () => {
	it('requests every page with the node’s filters and returns the items as n8n items', async () => {
		const { fetchPage } = fakeList(130);
		const requests: IHttpRequestOptions[] = [];
		const httpRequestWithAuthentication = vi.fn(
			async (credential: string, options: IHttpRequestOptions) => {
				expect(credential).toBe('keevaApi');
				requests.push(options);
				return await fetchPage(options.qs as IDataObject);
			},
		);
		const context = {
			helpers: { httpRequestWithAuthentication },
		} as unknown as IExecutePaginationFunctions;

		const result = await paginateByNextOffset.call(context, {
			options: {
				baseURL: 'https://keeva.app/api/v1',
				url: '/members',
				method: 'GET',
				qs: { groupId: 'g1', limit: 50 },
			},
			paginate: true,
			preSend: [],
			postReceive: [],
			requestOperations: {},
		});

		expect(result).toHaveLength(130);
		expect(result[0]).toEqual({ json: { id: 'item-0' } });
		expect(requests.map((r) => r.qs)).toEqual([
			{ groupId: 'g1', offset: 0, limit: 100 },
			{ groupId: 'g1', offset: 100, limit: 100 },
		]);
		expect(
			requests.every((r) => r.url === '/members' && r.baseURL === 'https://keeva.app/api/v1'),
		).toBe(true);
	});
});

describe('apiRoot', () => {
	it.each([
		['https://keeva.app', 'https://keeva.app/api/v1'],
		['https://keeva.app/', 'https://keeva.app/api/v1'],
		['https://yourclub.keeva.app', 'https://yourclub.keeva.app/api/v1'],
		[' https://yourclub.keeva.app/api/v1/ ', 'https://yourclub.keeva.app/api/v1'],
	])('turns %s into %s', (input, expected) => {
		expect(apiRoot(input)).toBe(expected);
	});
});
