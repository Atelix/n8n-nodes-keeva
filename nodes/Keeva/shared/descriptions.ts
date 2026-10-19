import type { INodeProperties, INodePropertyOptions } from 'n8n-workflow';

import { paginateByNextOffset } from './pagination';

export const GROUP_ROLE_OPTIONS: INodePropertyOptions[] = [
	{ name: 'Chairman', value: 'Chairman' },
	{ name: 'Coach', value: 'Coach' },
	{ name: 'Member', value: 'Member' },
	{ name: 'Player', value: 'Player' },
	{ name: 'Staff', value: 'Staff' },
];

export const EVENT_TYPE_OPTIONS: INodePropertyOptions[] = [
	{ name: 'Game', value: 'Game' },
	{ name: 'Other', value: 'Other' },
	{ name: 'Practice', value: 'Practice' },
];

export const GROUP_TYPE_OPTIONS: INodePropertyOptions[] = [
	{ name: 'Commission', value: 'Commission' },
	{ name: 'Team', value: 'Team' },
];

export const NEWS_VISIBILITY_OPTIONS: INodePropertyOptions[] = [
	{
		name: 'Club',
		value: 'Club',
		description:
			'Everyone in the club. Publishing emails and notifies every member; the group must be allowed to post club news.',
	},
	{ name: 'Group', value: 'Group', description: 'Members of the article’s group' },
	{
		name: 'Public',
		value: 'Public',
		description: 'Everyone, including the club’s website through the API',
	},
];

export const GENDER_OPTIONS: INodePropertyOptions[] = [
	{ name: 'Female', value: 'Female' },
	{ name: 'Male', value: 'Male' },
	{ name: 'Other', value: 'Other' },
	{ name: 'Unspecified', value: 'Unspecified' },
];

export const PARENT_RELATIONSHIP_OPTIONS: INodePropertyOptions[] = [
	{ name: 'Guardian', value: 'Guardian' },
	{ name: 'Other', value: 'Other' },
	{ name: 'Parent', value: 'Parent' },
];

/** A required ID parameter used in the request path, such as the event of "Get" or "Update". */
export function idProperty(
	displayName: string,
	name: string,
	resource: string,
	operations: string[],
	description: string,
): INodeProperties {
	return {
		displayName,
		name,
		type: 'string',
		required: true,
		default: '',
		placeholder: 'e.g. 3fa85f64-5717-4562-b3fc-2c963f66afa6',
		description,
		displayOptions: { show: { resource: [resource], operation: operations } },
	};
}

/** A required group picker, loaded from `GET /groups` (needs the Groups scope; an ID can always be given instead). */
export function requiredGroupProperty(
	resource: string,
	operations: string[],
	sendInBody = true,
): INodeProperties {
	return {
		displayName: 'Group Name or ID',
		name: 'groupId',
		type: 'options',
		typeOptions: { loadOptionsMethod: 'getGroups' },
		required: true,
		default: '',
		description:
			'Choose from the list, or specify an ID using an <a href="https://docs.n8n.io/code/expressions/">expression</a>',
		displayOptions: { show: { resource: [resource], operation: operations } },
		...(sendInBody ? { routing: { send: { type: 'body', property: 'groupId' } } } : {}),
	};
}

/** An optional group filter for a list's Filters collection. */
export const groupFilterOption: INodeProperties = {
	displayName: 'Group Name or ID',
	name: 'groupId',
	type: 'options',
	typeOptions: { loadOptionsMethod: 'getGroups' },
	default: '',
	description:
		'Choose from the list, or specify an ID using an <a href="https://docs.n8n.io/code/expressions/">expression</a>',
	routing: { send: { type: 'query', property: 'groupId' } },
};

export const externalIdFilterOption: INodeProperties = {
	displayName: 'External ID',
	name: 'externalId',
	type: 'string',
	default: '',
	description: 'Only items with exactly this external ID (your own ID, case-sensitive)',
	routing: { send: { type: 'query', property: 'externalId' } },
};

export const updatedSinceFilterOption: INodeProperties = {
	displayName: 'Updated Since',
	name: 'updatedSince',
	type: 'dateTime',
	default: '',
	description:
		'Only items changed at or after this moment. Without a time zone it is read in the workflow’s time zone.',
	routing: { send: { type: 'query', property: 'updatedSince' } },
};

/** Return All, Limit and Filters for a "Get Many" operation of a Keeva list endpoint. */
export function getManyProperties(resource: string, filters: INodeProperties[]): INodeProperties[] {
	return [
		{
			displayName: 'Return All',
			name: 'returnAll',
			type: 'boolean',
			default: false,
			description: 'Whether to return all results or only up to a given limit',
			displayOptions: { show: { resource: [resource], operation: ['getAll'] } },
			routing: {
				send: { paginate: '={{ $value }}' },
				operations: { pagination: paginateByNextOffset },
			},
		},
		{
			displayName: 'Limit',
			name: 'limit',
			type: 'number',
			default: 50,
			typeOptions: { minValue: 1, maxValue: 100 },
			description: 'Max number of results to return',
			displayOptions: { show: { resource: [resource], operation: ['getAll'], returnAll: [false] } },
			routing: {
				send: { type: 'query', property: 'limit' },
				output: { maxResults: '={{ $value }}' },
			},
		},
		{
			displayName: 'Filters',
			name: 'filters',
			type: 'collection',
			placeholder: 'Add Filter',
			default: {},
			displayOptions: { show: { resource: [resource], operation: ['getAll'] } },
			options: filters,
		},
	];
}

/** Turns Keeva's `{ items, nextOffset }` page into one n8n item per list item. */
export const listOutput = {
	postReceive: [{ type: 'rootProperty' as const, properties: { property: 'items' } }],
};

/** Keeva answers `204 No Content` to deletes; output one item that says it worked. */
export const successOutput = {
	postReceive: [{ type: 'set' as const, properties: { value: '={{ { "success": true } }}' } }],
};
