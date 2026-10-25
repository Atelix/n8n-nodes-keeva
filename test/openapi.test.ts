/**
 * Checks the nodes against a checked-in copy of Keeva's public OpenAPI document (`GET /api/v1/openapi.json`), so a
 * route, query parameter, body field or enum value that Keeva does not have fails here instead of in a workflow.
 * Refresh `fixtures/keeva-openapi.json` from a running Keeva Web API when the public API changes.
 */
import type { IDataObject, INodeProperties, INodePropertyOptions } from 'n8n-workflow';
import { describe, expect, it } from 'vitest';

import { KeevaApi } from '../credentials/KeevaApi.credentials';
import { Keeva } from '../nodes/Keeva/Keeva.node';
import { buildMemberBody } from '../nodes/Keeva/shared/memberBody';
import { KeevaTrigger, TRIGGER_PATHS } from '../nodes/KeevaTrigger/KeevaTrigger.node';
import {
	createWebhook,
	deleteWebhook,
	webhookExists,
	type KeevaRequest,
} from '../nodes/KeevaWebhookTrigger/webhook';
import openApiDocument from './fixtures/keeva-openapi.json';

type Schema = {
	$ref?: string;
	type?: string;
	properties?: Record<string, Schema>;
	items?: Schema;
	enum?: string[];
	allOf?: Schema[];
};
type OpenApiOperation = {
	parameters?: Array<{ name: string; in: string }>;
	requestBody?: { content: Record<string, { schema: Schema }> };
};
type OpenApi = {
	paths: Record<string, Record<string, OpenApiOperation>>;
	components: { schemas: Record<string, Schema> };
};

const openApi = openApiDocument as unknown as OpenApi;

const PREFIX = '/api/v1';

/** `/api/v1/members/{memberId}/groups/{groupId}` → `/members/{}/groups/{}` */
function apiPathKey(path: string): string {
	return path.replace(PREFIX, '').replace(/\{[^}]+\}/g, '{}');
}

/** `=/members/{{$parameter.memberId}}/groups/{{$parameter.groupId}}` → `/members/{}/groups/{}` */
function nodePathKey(url: string): string {
	return url.replace(/^=/, '').replace(/\{\{[^}]*\}\}/g, '{}');
}

const apiOperations = new Map<string, OpenApiOperation>();
for (const [path, methods] of Object.entries(openApi.paths)) {
	for (const [method, operation] of Object.entries(methods)) {
		apiOperations.set(`${method.toUpperCase()} ${apiPathKey(path)}`, operation);
	}
}

function resolve(schema: Schema | undefined): Schema {
	if (!schema) return {};
	if (schema.$ref) {
		const name = schema.$ref.split('/').pop() as string;
		return resolve(openApi.components.schemas[name]);
	}
	if (schema.allOf?.length === 1) return resolve(schema.allOf[0]);
	return schema;
}

/** Every field a value would send must exist in the schema, at every depth. */
function unknownFields(value: unknown, schema: Schema | undefined, path = ''): string[] {
	const resolved = resolve(schema);
	if (Array.isArray(value)) {
		return value.flatMap((item, i) => unknownFields(item, resolved.items, `${path}[${i}]`));
	}
	if (value && typeof value === 'object') {
		return Object.entries(value).flatMap(([key, child]) => {
			const property = resolved.properties?.[key];
			if (!property) return [`${path}${key}`];
			return unknownFields(child, property, `${path}${key}.`);
		});
	}
	return [];
}

interface NodeOperation {
	resource: string;
	operation: string;
	method: string;
	key: string;
}

const properties = new Keeva().description.properties;

const nodeOperations: NodeOperation[] = properties
	.filter((property) => property.name === 'operation')
	.flatMap((property) => {
		const resource = property.displayOptions?.show?.resource?.[0] as string;
		return (property.options as INodePropertyOptions[]).map((option) => {
			const request = option.routing?.request;
			return {
				resource,
				operation: String(option.value),
				method: String(request?.method),
				key: nodePathKey(String(request?.url)),
			};
		});
	});

function isShown(property: INodeProperties, resource: string, operation: string): boolean {
	const show = property.displayOptions?.show;
	if (!show) return false;
	if (show.resource && !show.resource.includes(resource)) return false;
	if (show.operation && !show.operation.includes(operation)) return false;
	return property.name !== 'operation' && property.name !== 'resource';
}

/** The parameters a request sends, with their routing, including those inside collections. */
function sentParameters(
	resource: string,
	operation: string,
	where: 'body' | 'query',
): INodeProperties[] {
	const collect = (list: INodeProperties[]): INodeProperties[] =>
		list.flatMap((property) => {
			const own = property.routing?.send?.type === where ? [property] : [];
			const children =
				property.type === 'collection'
					? collect((property.options ?? []) as INodeProperties[])
					: [];
			return [...own, ...children];
		});
	return collect(properties.filter((property) => isShown(property, resource, operation)));
}

function requestSchema(operation: OpenApiOperation | undefined): Schema | undefined {
	return operation?.requestBody?.content?.['application/json']?.schema;
}

describe('Keeva node against the public OpenAPI document', () => {
	it('offers the operations of phase 1', () => {
		expect(nodeOperations.map((o) => `${o.resource}:${o.operation}`).sort()).toEqual(
			[
				'event:cancel',
				'event:create',
				'event:get',
				'event:getAll',
				'event:update',
				'group:create',
				'group:get',
				'group:getAll',
				'group:update',
				'member:addToGroup',
				'member:create',
				'member:delete',
				'member:get',
				'member:getAll',
				'member:getFields',
				'member:onboard',
				'member:removeFromGroup',
				'member:setFields',
				'member:setPersonalData',
				'member:update',
				'news:create',
				'news:get',
				'news:getAll',
				'news:publish',
				'news:update',
				'parentAccount:update',
				'task:create',
				'task:get',
				'task:getAll',
				'task:update',
			].sort(),
		);
	});

	it.each(nodeOperations.map((o) => [`${o.resource}:${o.operation}`, o] as const))(
		'%s calls a method and path that exist',
		(_, operation) => {
			expect(apiOperations.has(`${operation.method} ${operation.key}`)).toBe(true);
		},
	);

	it.each(nodeOperations.map((o) => [`${o.resource}:${o.operation}`, o] as const))(
		'%s sends only query parameters that exist',
		(_, operation) => {
			const api = apiOperations.get(`${operation.method} ${operation.key}`);
			const known = new Set(
				(api?.parameters ?? []).filter((p) => p.in === 'query').map((p) => p.name.toLowerCase()),
			);
			const sent = sentParameters(operation.resource, operation.operation, 'query').map((p) =>
				String(p.routing?.send?.property),
			);
			if (operation.operation === 'getAll') sent.push('offset', 'limit', 'updatedSince');
			expect(sent.filter((name) => !known.has(name.toLowerCase()))).toEqual([]);
		},
	);

	it.each(nodeOperations.map((o) => [`${o.resource}:${o.operation}`, o] as const))(
		'%s sends only body fields and enum values that exist',
		(_, operation) => {
			const schema = resolve(
				requestSchema(apiOperations.get(`${operation.method} ${operation.key}`)),
			);
			for (const parameter of sentParameters(operation.resource, operation.operation, 'body')) {
				const field = String(parameter.routing?.send?.property);
				const fieldSchema = schema.properties?.[field];
				expect(fieldSchema, `${field} in the request body`).toBeDefined();
				if (
					parameter.type === 'options' &&
					parameter.typeOptions?.loadOptionsMethod === undefined
				) {
					const allowed = resolve(fieldSchema).enum;
					const values = (parameter.options as INodePropertyOptions[])
						.map((o) => String(o.value))
						.filter((v) => v !== '');
					expect(allowed, `${field} is an enum`).toBeDefined();
					expect(values.filter((v) => !allowed?.includes(v))).toEqual([]);
				}
			}
		},
	);

	it('builds member bodies (groups, accounts, personal data, field values) that match the schemas', () => {
		const filled: {
			additionalFields: IDataObject;
			personalData: IDataObject;
			memberFields: IDataObject;
		} = {
			additionalFields: {
				groups: { group: [{ groupId: 'g1', role: 'Coach' }] },
				accounts: {
					account: [
						{
							email: 'parent@example.com',
							firstname: 'Sanne',
							lastname: 'de Vries',
							isParent: true,
							relationship: 'Guardian',
							phoneNumber: '+31 6 12345678',
							isPrimaryContact: true,
						},
					],
				},
			},
			personalData: {
				street: 'Dorpsstraat',
				houseNumber: '1',
				houseNumberAddition: 'A',
				postalCode: '1234 AB',
				city: 'Utrecht',
				countryCode: 'NL',
				phoneNumber: '+31 6 12345678',
				gender: 'Female',
				emergencyContactName: 'Bas',
				emergencyContactPhone: '+31 6 87654321',
				memberSince: '2020-01-01',
				memberUntil: '2030-01-01',
				photoConsent: true,
				notes: 'note',
			},
			memberFields: {
				field: [
					{ fieldId: 'f1', value: '1.82' },
					{ fieldId: 'f2', clear: true },
				],
			},
		};
		const cases: Array<[string, string]> = [
			['create', 'POST /members'],
			['onboard', 'POST /members/onboard'],
			['setPersonalData', 'PUT /members/{}/personalData'],
			['setFields', 'PATCH /members/{}/fields'],
		];
		for (const [operation, key] of cases) {
			const body = buildMemberBody(operation, {}, filled);
			expect(Object.keys(body).length, operation).toBeGreaterThan(0);
			expect(unknownFields(body, requestSchema(apiOperations.get(key))), operation).toEqual([]);
		}
	});

	it('the trigger polls list endpoints that exist and take updatedSince', () => {
		const resources = (
			new KeevaTrigger().description.properties.find((p) => p.name === 'resource')
				?.options as INodePropertyOptions[]
		).map((o) => String(o.value));
		for (const resource of resources) {
			const api = apiOperations.get(`GET ${TRIGGER_PATHS[resource]}`);
			expect(api, resource).toBeDefined();
			const names = (api?.parameters ?? []).map((p) => p.name.toLowerCase());
			expect(names).toEqual(expect.arrayContaining(['updatedsince', 'offset', 'limit']));
		}
	});

	it('the instant trigger calls webhook endpoints that exist, with a body that matches the schema', async () => {
		const calls: Array<{ key: string; body?: IDataObject; qs?: IDataObject }> = [];
		const request: KeevaRequest = async (method, path, body, qs) => {
			calls.push({
				key: `${method} ${path.replace(/\/webhooks\/[^/]+$/, '/webhooks/{}')}`,
				body,
				qs,
			});
			if (method === 'POST') return { id: 'w1', secret: 'whsec_x' };
			if (path === '/webhooks') return { items: [], nextOffset: null };
			return { id: 'w1', url: 'https://n8n.example.com/webhook/x', events: ['event.created'] };
		};
		const target = { url: 'https://n8n.example.com/webhook/x', events: ['event.created'] };
		await webhookExists(request, {}, target);
		await webhookExists(request, { webhookId: 'w1', webhookSecret: 'whsec_x' }, target);
		await createWebhook(request, {}, { ...target, name: 'n8n' });
		await deleteWebhook(request, { webhookId: 'w1' });

		expect([...new Set(calls.map((c) => c.key))].sort()).toEqual(
			['DELETE /webhooks/{}', 'GET /webhooks', 'GET /webhooks/{}', 'POST /webhooks'].sort(),
		);
		for (const call of calls) {
			const api = apiOperations.get(call.key);
			expect(api, call.key).toBeDefined();
			if (call.body) expect(unknownFields(call.body, requestSchema(api))).toEqual([]);
			const known = new Set(
				(api?.parameters ?? []).filter((p) => p.in === 'query').map((p) => p.name.toLowerCase()),
			);
			expect(Object.keys(call.qs ?? {}).filter((name) => !known.has(name.toLowerCase()))).toEqual(
				[],
			);
		}
	});

	it('the credential test calls GET /api/v1/key', () => {
		const test = new KeevaApi().test.request;
		expect(String(test.baseURL)).toMatch(/\/api\/v1$/);
		expect(apiOperations.has(`${test.method ?? 'GET'} ${test.url}`)).toBe(true);
	});
});
