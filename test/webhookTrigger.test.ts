import type { IDataObject, IWebhookFunctions } from 'n8n-workflow';
import { describe, expect, it, vi } from 'vitest';

import { KeevaWebhookTrigger } from '../nodes/KeevaWebhookTrigger/KeevaWebhookTrigger.node';
import {
	createWebhook,
	deleteWebhook,
	httpStatus,
	NOT_FOUND,
	recordPath,
	signKeevaPayload,
	verifyKeevaSignature,
	webhookExists,
	webhookName,
	WEBHOOK_EVENT_TYPES,
	type KeevaRequest,
	type WebhookState,
} from '../nodes/KeevaWebhookTrigger/webhook';

const SECRET = 'whsec_test-secret';
const TIMESTAMP = '1761393600';
const NOW = Number(TIMESTAMP) * 1000;
const BODY =
	'{"id":"1f0c6e5a-8a4e-4c55-9d43-6f1f6b7c2a10","type":"event.updated","occurredAt":"2026-10-25T12:00:00Z","clubId":"c1","data":{"id":"e1","externalId":"match-7","url":"https://rowing.keeva.app/api/v1/events/e1"}}';
/** Computed independently: `printf '%s' "$TIMESTAMP.$BODY" | openssl dgst -sha256 -hmac "$SECRET"`. */
const SIGNATURE = 'sha256=ce4f5fb49de3c8bfad6f16f2be3f40bd56e8f4c4a641d978a273100c2f3fcf16';

const HOOK_URL = 'https://n8n.example.com/webhook/0b6f/webhook';

describe('verifyKeevaSignature', () => {
	const valid = {
		secret: SECRET,
		timestamp: TIMESTAMP,
		signature: SIGNATURE,
		body: BODY,
		now: NOW,
	};

	it('signs like Keeva: sha256= and the hex HMAC-SHA256 of "{timestamp}.{body}"', () => {
		expect(signKeevaPayload(SECRET, TIMESTAMP, BODY)).toBe(SIGNATURE);
		expect(signKeevaPayload(SECRET, TIMESTAMP, Buffer.from(BODY, 'utf8'))).toBe(SIGNATURE);
	});

	it('accepts a valid signature over the raw body, as a string or a buffer', () => {
		expect(verifyKeevaSignature(valid)).toBe('valid');
		expect(verifyKeevaSignature({ ...valid, body: Buffer.from(BODY, 'utf8') })).toBe('valid');
	});

	it('accepts a timestamp up to five minutes off either way', () => {
		expect(verifyKeevaSignature({ ...valid, now: NOW + 300_000 })).toBe('valid');
		expect(verifyKeevaSignature({ ...valid, now: NOW - 300_000 })).toBe('valid');
	});

	it('refuses a tampered body', () => {
		expect(
			verifyKeevaSignature({ ...valid, body: BODY.replace('event.updated', 'event.deleted') }),
		).toBe('invalidSignature');
	});

	it('refuses a tampered signature, a signature of another length and another secret', () => {
		const flipped = SIGNATURE.slice(0, -1) + (SIGNATURE.endsWith('6') ? '7' : '6');
		expect(verifyKeevaSignature({ ...valid, signature: flipped })).toBe('invalidSignature');
		expect(verifyKeevaSignature({ ...valid, signature: SIGNATURE.slice(0, -2) })).toBe(
			'invalidSignature',
		);
		expect(verifyKeevaSignature({ ...valid, signature: SIGNATURE.toUpperCase() })).toBe(
			'invalidSignature',
		);
		expect(verifyKeevaSignature({ ...valid, secret: 'whsec_other' })).toBe('invalidSignature');
	});

	it('refuses a timestamp more than five minutes old or ahead, even when correctly signed', () => {
		expect(verifyKeevaSignature({ ...valid, now: NOW + 301_000 })).toBe('staleTimestamp');
		expect(verifyKeevaSignature({ ...valid, now: NOW - 301_000 })).toBe('staleTimestamp');
	});

	it('refuses a timestamp that was changed, since it is part of what is signed', () => {
		expect(verifyKeevaSignature({ ...valid, timestamp: String(Number(TIMESTAMP) + 1) })).toBe(
			'invalidSignature',
		);
	});

	it('refuses missing headers, a missing secret and a timestamp that is not unix seconds', () => {
		expect(verifyKeevaSignature({ ...valid, signature: undefined })).toBe('missing');
		expect(verifyKeevaSignature({ ...valid, timestamp: undefined })).toBe('missing');
		expect(verifyKeevaSignature({ ...valid, secret: '' })).toBe('missing');
		expect(verifyKeevaSignature({ ...valid, timestamp: '1761393600.5' })).toBe('staleTimestamp');
		expect(verifyKeevaSignature({ ...valid, timestamp: '2026-10-25T12:00:00Z' })).toBe(
			'staleTimestamp',
		);
	});
});

function fakeRequest(responses: Record<string, unknown> = {}) {
	return vi.fn<KeevaRequest>(async (method, path) => {
		const key = `${method} ${path}`;
		return key in responses ? responses[key] : undefined;
	});
}

const EVENTS = ['event.created', 'member.updated'];

describe('the webhook lifecycle', () => {
	it('creates the webhook with POST /webhooks {name, url, events} and keeps its id and secret', async () => {
		const request = fakeRequest({
			'POST /webhooks': {
				id: 'w1',
				name: 'n8n: Sync',
				url: HOOK_URL,
				events: EVENTS,
				isActive: true,
				createdAt: '2026-10-25T12:00:00Z',
				secret: SECRET,
			},
		});
		const state: WebhookState = {};

		await createWebhook(request, state, { name: 'n8n: Sync', url: HOOK_URL, events: EVENTS });

		expect(request).toHaveBeenCalledTimes(1);
		expect(request).toHaveBeenCalledWith('POST', '/webhooks', {
			name: 'n8n: Sync',
			url: HOOK_URL,
			events: EVENTS,
		});
		expect(state).toEqual({ webhookId: 'w1', webhookSecret: SECRET });
	});

	it('refuses a create response without a secret, so deliveries are never accepted unverified', async () => {
		const request = fakeRequest({ 'POST /webhooks': { id: 'w1', url: HOOK_URL, events: EVENTS } });
		const state: WebhookState = {};

		await expect(
			createWebhook(request, state, { name: 'n8n', url: HOOK_URL, events: EVENTS }),
		).rejects.toThrow();
		expect(state).toEqual({});
	});

	it('deletes with DELETE /webhooks/{id} and forgets the webhook', async () => {
		const request = fakeRequest();
		const state: WebhookState = { webhookId: 'w1', webhookSecret: SECRET };

		await deleteWebhook(request, state);

		expect(request).toHaveBeenCalledTimes(1);
		expect(request).toHaveBeenCalledWith('DELETE', '/webhooks/w1');
		expect(state).toEqual({});
	});

	it('treats a webhook that is already gone (404) as deleted', async () => {
		const request = fakeRequest({ 'DELETE /webhooks/w1': NOT_FOUND });
		const state: WebhookState = { webhookId: 'w1', webhookSecret: SECRET };

		await deleteWebhook(request, state);

		expect(state).toEqual({});
	});

	it('sends nothing on delete when no webhook was created', async () => {
		const request = fakeRequest();

		await deleteWebhook(request, {});

		expect(request).not.toHaveBeenCalled();
	});

	it('reports a matching webhook as existing', async () => {
		const request = fakeRequest({
			'GET /webhooks/w1': { id: 'w1', url: HOOK_URL, events: [...EVENTS].reverse() },
		});
		const state: WebhookState = { webhookId: 'w1', webhookSecret: SECRET };

		expect(await webhookExists(request, state, { url: HOOK_URL, events: EVENTS })).toBe(true);
		expect(request).toHaveBeenCalledTimes(1);
		expect(state.webhookSecret).toBe(SECRET);
	});

	it('replaces a webhook whose event types or address no longer match', async () => {
		for (const existing of [
			{ id: 'w1', url: HOOK_URL, events: ['event.created'] },
			{ id: 'w1', url: 'https://n8n.example.com/webhook-test/0b6f/webhook', events: EVENTS },
		]) {
			const request = fakeRequest({ 'GET /webhooks/w1': existing });
			const state: WebhookState = { webhookId: 'w1', webhookSecret: SECRET };

			expect(await webhookExists(request, state, { url: HOOK_URL, events: EVENTS })).toBe(false);
			expect(request).toHaveBeenCalledWith('DELETE', '/webhooks/w1');
			expect(state).toEqual({});
		}
	});

	it('replaces a webhook whose secret was lost', async () => {
		const request = fakeRequest({
			'GET /webhooks/w1': { id: 'w1', url: HOOK_URL, events: EVENTS },
		});
		const state: WebhookState = { webhookId: 'w1' };

		expect(await webhookExists(request, state, { url: HOOK_URL, events: EVENTS })).toBe(false);
		expect(request).toHaveBeenCalledWith('DELETE', '/webhooks/w1');
	});

	it('forgets a webhook Keeva no longer has (404)', async () => {
		const request = fakeRequest({ 'GET /webhooks/w1': NOT_FOUND });
		const state: WebhookState = { webhookId: 'w1', webhookSecret: SECRET };

		expect(await webhookExists(request, state, { url: HOOK_URL, events: EVENTS })).toBe(false);
		expect(request).toHaveBeenCalledTimes(1);
		expect(state).toEqual({});
	});

	it('without a recorded webhook, removes the key’s webhooks at this address, reading every page', async () => {
		const request = vi.fn<KeevaRequest>(async (method, path, _body, qs) => {
			if (method === 'GET' && path === '/webhooks') {
				return qs?.offset === 0
					? {
							items: [
								{ id: 'w1', url: HOOK_URL, events: EVENTS },
								{ id: 'w2', url: 'https://other.example.com/hook', events: EVENTS },
							],
							nextOffset: 2,
						}
					: { items: [{ id: 'w3', url: HOOK_URL, events: EVENTS }], nextOffset: null };
			}
			return undefined;
		});

		expect(await webhookExists(request, {}, { url: HOOK_URL, events: EVENTS })).toBe(false);
		const deletes = request.mock.calls.filter(([method]) => method === 'DELETE');
		expect(deletes.map(([, path]) => path)).toEqual(['/webhooks/w1', '/webhooks/w3']);
	});

	it('names the webhook after the workflow, within Keeva’s 100 characters', () => {
		expect(webhookName('Member sync')).toBe('n8n: Member sync');
		expect(webhookName(undefined)).toBe('n8n');
		expect(webhookName('x'.repeat(200))).toHaveLength(100);
	});
});

describe('helpers', () => {
	it('reads the HTTP status of n8n request errors', () => {
		expect(httpStatus({ httpCode: '404' })).toBe(404);
		expect(httpStatus({ response: { status: 403 } })).toBe(403);
		expect(httpStatus({ cause: { statusCode: 400 } })).toBe(400);
		expect(httpStatus(new Error('offline'))).toBeUndefined();
	});

	it('reads records through their /api/v1 path only', () => {
		expect(recordPath({ data: { url: 'https://rowing.keeva.app/api/v1/events/e1' } })).toBe(
			'/events/e1',
		);
		expect(recordPath({ data: { url: null } })).toBeNull();
		expect(recordPath({ data: { url: 'https://evil.example.com/steal' } })).toBeNull();
		expect(recordPath({ data: { url: 'not a url' } })).toBeNull();
	});

	it('offers every subscribable Keeva event type, and not ping', () => {
		expect(WEBHOOK_EVENT_TYPES.map((o) => o.value).sort()).toEqual(
			[
				'event.created',
				'event.updated',
				'event.cancelled',
				'event.deleted',
				'task.created',
				'task.updated',
				'task.deleted',
				'group.created',
				'group.updated',
				'group.deleted',
				'member.created',
				'member.updated',
				'member.archived',
				'member.deleted',
				'member.groups_changed',
				'news.published',
				'news.updated',
				'news.deleted',
			].sort(),
		);
	});
});

interface Delivery {
	body?: string;
	timestamp?: string;
	signature?: string;
	events?: string[];
	options?: IDataObject;
	secret?: string;
	api?: KeevaRequest;
}

function deliver(delivery: Delivery) {
	const body = delivery.body ?? BODY;
	const timestamp = delivery.timestamp ?? String(Math.floor(Date.now() / 1000));
	const signature = delivery.signature ?? signKeevaPayload(SECRET, timestamp, body);
	const status = vi.fn();
	const json = vi.fn();
	const response = { status: status.mockImplementation(() => response), json };
	const httpRequestWithAuthentication = vi.fn(async (_credential: string, options: IDataObject) => {
		const url = String(options.url);
		const result = await (delivery.api ?? (async () => ({})))(
			'GET',
			url.replace('https://keeva.app/api/v1', ''),
		);
		if (result === NOT_FOUND) throw Object.assign(new Error('Not found'), { httpCode: '404' });
		return result;
	});
	const context = {
		getRequestObject: () => ({ rawBody: Buffer.from(body, 'utf8') }),
		getResponseObject: () => response,
		getHeaderData: () => ({
			'keeva-webhook-id': 'd1',
			'keeva-webhook-timestamp': timestamp,
			'keeva-webhook-signature': signature,
		}),
		getBodyData: () => JSON.parse(body) as IDataObject,
		getWorkflowStaticData: () => ({ webhookId: 'w1', webhookSecret: delivery.secret ?? SECRET }),
		getNodeParameter: (name: string, fallback: unknown) =>
			name === 'events'
				? (delivery.events ?? ['event.updated'])
				: name === 'options'
					? (delivery.options ?? {})
					: fallback,
		getCredentials: async () => ({ apiKey: 'kva_test', baseUrl: 'https://keeva.app' }),
		getNode: () => ({ name: 'Keeva Instant Trigger', type: 'keevaWebhookTrigger' }),
		logger: { warn: vi.fn() },
		helpers: {
			httpRequestWithAuthentication,
			returnJsonArray: (items: IDataObject[]) => items.map((json) => ({ json })),
		},
	};
	const run = new KeevaWebhookTrigger().webhook.call(context as unknown as IWebhookFunctions);
	return { run, status, json, httpRequestWithAuthentication };
}

describe('KeevaWebhookTrigger.webhook', () => {
	it('emits the payload of a correctly signed delivery', async () => {
		const { run } = deliver({});
		const result = await run;
		expect(result.workflowData?.[0]).toEqual([{ json: JSON.parse(BODY) }]);
	});

	it('answers 401 and starts nothing for a tampered delivery', async () => {
		const { run, status } = deliver({
			signature: signKeevaPayload(SECRET, String(Math.floor(Date.now() / 1000)), '{}'),
		});
		const result = await run;
		expect(result).toEqual({ noWebhookResponse: true });
		expect(status).toHaveBeenCalledWith(401);
	});

	it('answers 401 for an old delivery replayed with its original signature', async () => {
		const old = String(Math.floor(Date.now() / 1000) - 600);
		const { run, status } = deliver({ timestamp: old });
		expect(await run).toEqual({ noWebhookResponse: true });
		expect(status).toHaveBeenCalledWith(401);
	});

	it('ignores pings unless asked, and event types that were not chosen', async () => {
		const ping = BODY.replace('event.updated', 'ping');
		expect((await deliver({ body: ping }).run).workflowData).toBeUndefined();
		expect(
			(await deliver({ body: ping, options: { includePing: true } }).run).workflowData?.[0],
		).toHaveLength(1);
		expect((await deliver({ events: ['event.created'] }).run).workflowData).toBeUndefined();
	});

	it('reads the full record through the credential’s base URL when asked', async () => {
		const api = vi.fn<KeevaRequest>(async () => ({ id: 'e1', title: 'Match' }));
		const { run, httpRequestWithAuthentication } = deliver({
			options: { fetchRecord: true },
			api,
		});
		const result = await run;
		expect(httpRequestWithAuthentication).toHaveBeenCalledWith(
			'keevaApi',
			expect.objectContaining({ method: 'GET', url: 'https://keeva.app/api/v1/events/e1' }),
		);
		expect(result.workflowData?.[0][0].json.record).toEqual({ id: 'e1', title: 'Match' });
	});

	it('adds a null record for deletions and for items the key can no longer read', async () => {
		const deleted = BODY.replace('event.updated', 'event.deleted').replace(
			'"https://rowing.keeva.app/api/v1/events/e1"',
			'null',
		);
		const gone = deliver({
			body: deleted,
			events: ['event.deleted'],
			options: { fetchRecord: true },
		});
		expect((await gone.run).workflowData?.[0][0].json.record).toBeNull();
		expect(gone.httpRequestWithAuthentication).not.toHaveBeenCalled();

		const hidden = deliver({ options: { fetchRecord: true }, api: async () => NOT_FOUND });
		expect((await hidden.run).workflowData?.[0][0].json.record).toBeNull();
	});
});
