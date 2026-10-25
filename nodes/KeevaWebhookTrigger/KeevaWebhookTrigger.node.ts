import {
	NodeApiError,
	NodeConnectionTypes,
	type IDataObject,
	type IHookFunctions,
	type IHttpRequestMethods,
	type INodeType,
	type INodeTypeDescription,
	type IWebhookFunctions,
	type IWebhookResponseData,
	type JsonObject,
} from 'n8n-workflow';

import { keevaApiRequest } from '../Keeva/shared/transport';
import {
	createWebhook,
	deleteWebhook,
	headerValue,
	httpStatus,
	NOT_FOUND,
	PING_EVENT,
	recordPath,
	SIGNATURE_HEADER,
	TIMESTAMP_HEADER,
	verifyKeevaSignature,
	webhookExists,
	webhookName,
	WEBHOOK_EVENT_TYPES,
	type KeevaRequest,
	type WebhookState,
} from './webhook';

/** What a failed webhook request most likely means, shown under the error in the editor. */
function errorDescription(
	method: IHttpRequestMethods,
	status: number | undefined,
): string | undefined {
	if (status === 401) return 'The API key is invalid, revoked or expired.';
	if (method === 'POST' && status === 400) {
		return 'Keeva only sends to HTTPS addresses on the public internet. Make sure n8n’s webhook address (the WEBHOOK_URL setting) is public and uses https://.';
	}
	if (status === 403) {
		return 'The API key needs the Webhooks scope and the read scope of every chosen event type (Events, Tasks, Groups, Members or News).';
	}
	return undefined;
}

/** Requests for the webhook lifecycle and the record lookup: a 404 resolves to NOT_FOUND, anything else throws. */
function keevaRequester(context: IHookFunctions | IWebhookFunctions): KeevaRequest {
	return async (method, path, body, qs) => {
		try {
			return await keevaApiRequest.call(context, method, path, qs, body);
		} catch (error) {
			const status = httpStatus(error);
			if (status === 404 && method !== 'POST') return NOT_FOUND;
			throw new NodeApiError(context.getNode(), error as JsonObject, {
				description: errorDescription(method, status),
			});
		}
	};
}

function selectedEvents(context: IHookFunctions | IWebhookFunctions): string[] {
	return context.getNodeParameter('events', []) as string[];
}

export class KeevaWebhookTrigger implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'Keeva Instant Trigger',
		name: 'keevaWebhookTrigger',
		icon: { light: 'file:keeva.svg', dark: 'file:keeva.dark.svg' },
		group: ['trigger'],
		version: 1,
		subtitle: '={{$parameter["events"].join(", ")}}',
		description:
			'Starts the workflow as soon as events, tasks, groups, members or news of a Keeva club change',
		defaults: {
			name: 'Keeva Instant Trigger',
		},
		inputs: [],
		outputs: [NodeConnectionTypes.Main],
		credentials: [{ name: 'keevaApi', required: true }],
		webhooks: [
			{
				name: 'default',
				httpMethod: 'POST',
				responseMode: 'onReceived',
				path: 'webhook',
			},
		],
		properties: [
			{
				displayName:
					'Keeva only sends to a public https:// address, so n8n must be reachable from the internet. The API key needs the Webhooks scope and the read scope of each chosen type.',
				name: 'webhookNotice',
				type: 'notice',
				default: '',
			},
			{
				displayName: 'Events',
				name: 'events',
				type: 'multiOptions',
				required: true,
				options: WEBHOOK_EVENT_TYPES,
				default: [],
				description: 'What should start the workflow',
			},
			{
				displayName: 'Options',
				name: 'options',
				type: 'collection',
				placeholder: 'Add Option',
				default: {},
				options: [
					{
						displayName: 'Fetch Full Record',
						name: 'fetchRecord',
						type: 'boolean',
						default: false,
						description:
							'Whether to read the changed item with the same key and add it as "record". Deletions and archived members have nothing to read; an item the key cannot read (any more) gives null.',
					},
					{
						displayName: 'Include Test Pings',
						name: 'includePing',
						type: 'boolean',
						default: false,
						description:
							'Whether a test sent from the club app (Manage → Webhooks → Send test) starts the workflow too',
					},
				],
			},
		],
	};

	webhookMethods = {
		default: {
			async checkExists(this: IHookFunctions): Promise<boolean> {
				const url = this.getNodeWebhookUrl('default') as string;
				const state = this.getWorkflowStaticData('node') as WebhookState;
				return await webhookExists(keevaRequester(this), state, {
					url,
					events: selectedEvents(this),
				});
			},

			async create(this: IHookFunctions): Promise<boolean> {
				const url = this.getNodeWebhookUrl('default') as string;
				const state = this.getWorkflowStaticData('node') as WebhookState;
				await createWebhook(keevaRequester(this), state, {
					name: webhookName(this.getWorkflow().name),
					url,
					events: selectedEvents(this),
				});
				return true;
			},

			async delete(this: IHookFunctions): Promise<boolean> {
				const state = this.getWorkflowStaticData('node') as WebhookState;
				await deleteWebhook(keevaRequester(this), state);
				return true;
			},
		},
	};

	async webhook(this: IWebhookFunctions): Promise<IWebhookResponseData> {
		const request = this.getRequestObject() as {
			rawBody?: Buffer;
			readRawBody?: () => Promise<void>;
		};
		const response = this.getResponseObject();
		const headers = this.getHeaderData();
		const state = this.getWorkflowStaticData('node') as WebhookState;

		if (!request.rawBody && typeof request.readRawBody === 'function') {
			await request.readRawBody();
		}
		const body = request.rawBody ?? JSON.stringify(this.getBodyData());

		const result = verifyKeevaSignature({
			secret: state.webhookSecret ?? '',
			timestamp: headerValue(headers[TIMESTAMP_HEADER]),
			signature: headerValue(headers[SIGNATURE_HEADER]),
			body,
			now: Date.now(),
		});
		if (result !== 'valid') {
			this.logger.warn(`Keeva Instant Trigger refused a delivery: ${result}`);
			response.status(401).json({ message: 'Invalid or expired Keeva webhook signature' });
			return { noWebhookResponse: true };
		}

		const payload = this.getBodyData();
		const type = String(payload.type ?? '');
		const options = this.getNodeParameter('options', {}) as IDataObject;
		const wanted =
			type === PING_EVENT ? options.includePing === true : selectedEvents(this).includes(type);
		if (!wanted) {
			return { webhookResponse: 'Ignored' };
		}

		const output: IDataObject = { ...payload };
		if (options.fetchRecord === true) {
			const path = type === PING_EVENT ? null : recordPath(payload);
			const record = path ? await keevaRequester(this)('GET', path) : null;
			output.record = record === NOT_FOUND ? null : (record as IDataObject | null);
		}

		return {
			workflowData: [this.helpers.returnJsonArray([output])],
		};
	}
}
