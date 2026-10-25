import { createHmac, timingSafeEqual } from 'crypto';
import type { IDataObject, IHttpRequestMethods, INodePropertyOptions } from 'n8n-workflow';

import { fetchAllPages, type KeevaPage } from '../Keeva/shared/transport';

/** The event types a Keeva webhook can subscribe to, in the order of Keeva's documentation. */
export const WEBHOOK_EVENT_TYPES: INodePropertyOptions[] = [
	{ name: 'Event Cancelled', value: 'event.cancelled', description: 'An event is cancelled' },
	{
		name: 'Event Created',
		value: 'event.created',
		description:
			'An event is published: planned straight away, a draft published or a scheduled one live',
	},
	{ name: 'Event Deleted', value: 'event.deleted', description: 'A published event is removed' },
	{
		name: 'Event Updated',
		value: 'event.updated',
		description: 'A field the API shows changes, including taking a cancellation back',
	},
	{ name: 'Group Created', value: 'group.created', description: 'A group is added' },
	{ name: 'Group Deleted', value: 'group.deleted', description: 'A group is deleted' },
	{
		name: 'Group Updated',
		value: 'group.updated',
		description: 'Name, description, type or External ID of a group changes',
	},
	{
		name: 'Member Archived',
		value: 'member.archived',
		description: 'A platform administrator archives a member',
	},
	{ name: 'Member Created', value: 'member.created', description: 'A member is added' },
	{ name: 'Member Deleted', value: 'member.deleted', description: 'A member is deleted for good' },
	{
		name: 'Member Groups Changed',
		value: 'member.groups_changed',
		description: 'A member is put in a group, taken out of one, or gets another role there',
	},
	{
		name: 'Member Updated',
		value: 'member.updated',
		description:
			'Name, infix or External ID change; contact and personal data changes need the matching scopes',
	},
	{
		name: 'News Deleted',
		value: 'news.deleted',
		description: 'Published public news is removed',
	},
	{
		name: 'News Published',
		value: 'news.published',
		description: 'News is published with the Public visibility',
	},
	{
		name: 'News Updated',
		value: 'news.updated',
		description: 'Title, description, content or group of published public news changes',
	},
	{ name: 'Task Created', value: 'task.created', description: 'A task is added' },
	{ name: 'Task Deleted', value: 'task.deleted', description: 'A task is removed' },
	{
		name: 'Task Updated',
		value: 'task.updated',
		description: 'A field the API shows changes; accepting a task is not reported',
	},
];

/** The test delivery a club manager sends from the club app; never subscribed to. */
export const PING_EVENT = 'ping';

export const ID_HEADER = 'keeva-webhook-id';
export const TIMESTAMP_HEADER = 'keeva-webhook-timestamp';
export const SIGNATURE_HEADER = 'keeva-webhook-signature';

/** How far a delivery's timestamp may be from now, either way, before it is refused as a replay. */
export const SIGNATURE_TOLERANCE_SECONDS = 5 * 60;

/** The longest webhook name Keeva accepts. */
export const MAX_WEBHOOK_NAME_LENGTH = 100;

/** What the trigger keeps in the workflow's static data about the webhook it created in Keeva. */
export interface WebhookState {
	webhookId?: string;
	/** The `whsec_…` signing secret, which Keeva returns only when the webhook is created. */
	webhookSecret?: string;
}

/** A webhook as `GET /api/v1/webhooks` returns it. */
export interface KeevaWebhook {
	id: string;
	name?: string;
	url: string;
	events: string[];
	isActive?: boolean;
	createdAt?: string;
}

/** The response of `POST /api/v1/webhooks`: the webhook and the only copy of its secret. */
export interface KeevaCreatedWebhook extends KeevaWebhook {
	secret: string;
}

/** Returned by a {@link KeevaRequest} when Keeva answers `404 Not Found`. */
export const NOT_FOUND = Symbol('notFound');

/** An authenticated request to `/api/v1`; resolves to {@link NOT_FOUND} on a 404 and throws on any other failure. */
export type KeevaRequest = (
	method: IHttpRequestMethods,
	path: string,
	body?: IDataObject,
	qs?: IDataObject,
) => Promise<unknown>;

/** The HTTP status of a failed request, from the shapes n8n's request helpers and `NodeApiError` use. */
export function httpStatus(error: unknown): number | undefined {
	if (!error || typeof error !== 'object') return undefined;
	const e = error as {
		httpCode?: unknown;
		statusCode?: unknown;
		status?: unknown;
		response?: { status?: unknown; statusCode?: unknown };
		cause?: unknown;
	};
	for (const value of [
		e.httpCode,
		e.statusCode,
		e.status,
		e.response?.status,
		e.response?.statusCode,
	]) {
		const status = Number(value);
		if (Number.isInteger(status) && status >= 100 && status <= 599) return status;
	}
	return e.cause && e.cause !== error ? httpStatus(e.cause) : undefined;
}

export type SignatureResult = 'valid' | 'missing' | 'staleTimestamp' | 'invalidSignature';

export interface SignatureInput {
	secret: string;
	/** The `Keeva-Webhook-Timestamp` header: unix seconds. */
	timestamp: string | undefined;
	/** The `Keeva-Webhook-Signature` header: `sha256=` and the lower-case hex HMAC-SHA256. */
	signature: string | undefined;
	/** The raw request body, exactly as received. */
	body: Buffer | string;
	/** Now, in milliseconds since the epoch. */
	now: number;
}

/** `sha256=` and the lower-case hex HMAC-SHA256 of `{timestamp}.{body}`, keyed with the whole secret. */
export function signKeevaPayload(secret: string, timestamp: string, body: Buffer | string): string {
	const hmac = createHmac('sha256', secret);
	hmac.update(`${timestamp}.`, 'utf8');
	hmac.update(typeof body === 'string' ? Buffer.from(body, 'utf8') : body);
	return `sha256=${hmac.digest('hex')}`;
}

/**
 * Checks a delivery's `Keeva-Webhook-Signature` against the raw body in constant time, and refuses timestamps more
 * than {@link SIGNATURE_TOLERANCE_SECONDS} away from now so a captured delivery cannot be replayed.
 */
export function verifyKeevaSignature(input: SignatureInput): SignatureResult {
	const { secret, timestamp, signature, body, now } = input;
	if (!secret || !timestamp || !signature) return 'missing';
	if (!/^\d{1,15}$/.test(timestamp)) return 'staleTimestamp';
	if (Math.abs(now / 1000 - Number(timestamp)) > SIGNATURE_TOLERANCE_SECONDS) {
		return 'staleTimestamp';
	}
	const expected = Buffer.from(signKeevaPayload(secret, timestamp, body), 'utf8');
	const actual = Buffer.from(signature.trim(), 'utf8');
	if (expected.length !== actual.length) return 'invalidSignature';
	return timingSafeEqual(expected, actual) ? 'valid' : 'invalidSignature';
}

/** A header's value, whether Node gave it as a string or a list. */
export function headerValue(value: string | string[] | undefined): string | undefined {
	return Array.isArray(value) ? value[0] : value;
}

function sameEvents(a: string[] | undefined, b: string[]): boolean {
	const left = [...new Set(a ?? [])].sort();
	const right = [...new Set(b)].sort();
	return left.length === right.length && left.every((type, i) => type === right[i]);
}

function forget(state: WebhookState): void {
	delete state.webhookId;
	delete state.webhookSecret;
}

export interface WebhookTarget {
	/** n8n's address for this node, test or production. */
	url: string;
	events: string[];
}

/**
 * `checkExists`: whether the webhook this node created is still in Keeva with the same address and event types, and
 * its secret is known. A webhook that no longer matches is deleted so `create` can replace it. Without a recorded
 * webhook, any webhook of this key that points at this node's address is removed: its secret is lost, so its
 * deliveries could never be verified.
 */
export async function webhookExists(
	request: KeevaRequest,
	state: WebhookState,
	target: WebhookTarget,
): Promise<boolean> {
	if (state.webhookId) {
		const existing = await request('GET', `/webhooks/${encodeURIComponent(state.webhookId)}`);
		if (existing !== NOT_FOUND) {
			const webhook = existing as KeevaWebhook;
			if (
				state.webhookSecret &&
				webhook.url === target.url &&
				sameEvents(webhook.events, target.events)
			) {
				return true;
			}
			await request('DELETE', `/webhooks/${encodeURIComponent(state.webhookId)}`);
		}
		forget(state);
		return false;
	}

	const webhooks = (await fetchAllPages(
		async (qs) => (await request('GET', '/webhooks', undefined, qs)) as KeevaPage,
	)) as unknown as KeevaWebhook[];
	for (const webhook of webhooks.filter((w) => w.url === target.url)) {
		await request('DELETE', `/webhooks/${encodeURIComponent(webhook.id)}`);
	}
	return false;
}

/** The webhook's name in the club app: `n8n: <workflow name>`, cut to Keeva's limit. */
export function webhookName(workflowName: string | undefined): string {
	const name = workflowName?.trim() ? `n8n: ${workflowName.trim()}` : 'n8n';
	return name.length > MAX_WEBHOOK_NAME_LENGTH
		? `${name.slice(0, MAX_WEBHOOK_NAME_LENGTH - 1)}…`
		: name;
}

/** `create`: subscribes the node's address in Keeva and records the webhook's id and signing secret. */
export async function createWebhook(
	request: KeevaRequest,
	state: WebhookState,
	target: WebhookTarget & { name: string },
): Promise<KeevaCreatedWebhook> {
	const created = (await request('POST', '/webhooks', {
		name: target.name,
		url: target.url,
		events: target.events,
	})) as KeevaCreatedWebhook;
	if (!created?.id || !created.secret) {
		throw new Error('Keeva did not return the new webhook’s id and secret');
	}
	state.webhookId = created.id;
	state.webhookSecret = created.secret;
	return created;
}

/** `delete`: removes the node's webhook from Keeva; one that is already gone counts as removed. */
export async function deleteWebhook(request: KeevaRequest, state: WebhookState): Promise<void> {
	if (state.webhookId) {
		await request('DELETE', `/webhooks/${encodeURIComponent(state.webhookId)}`);
	}
	forget(state);
}

/** A delivery's body: what happened and where to read the item, never the item itself. */
export interface KeevaWebhookPayload extends IDataObject {
	id: string;
	type: string;
	occurredAt: string;
	clubId: string;
	data: { id: string; externalId: string | null; url: string | null };
}

/**
 * The `/api/v1` path of `data.url`, to read with the credential's own base URL so the key only ever goes to the
 * Keeva address the user configured. `null` when there is nothing to read (deletions, archived members, pings) or the
 * address is not an `/api/v1` one.
 */
export function recordPath(payload: IDataObject): string | null {
	const url = (payload.data as IDataObject | undefined)?.url;
	if (typeof url !== 'string' || !url) return null;
	let pathname: string;
	try {
		pathname = new URL(url).pathname;
	} catch {
		return null;
	}
	const match = /^\/api\/v1(\/[A-Za-z0-9._~%/-]+)$/.exec(pathname);
	if (!match || match[1].includes('..')) return null;
	return match[1];
}
