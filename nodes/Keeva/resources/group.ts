import type { INodeProperties } from 'n8n-workflow';

import { normalizeDates } from '../shared/dates';
import {
	externalIdFilterOption,
	getManyProperties,
	GROUP_TYPE_OPTIONS,
	idProperty,
	listOutput,
	updatedSinceFilterOption,
} from '../shared/descriptions';

const resource = 'group';
const groupPath = '=/groups/{{$parameter.groupId}}';

function groupFields(forUpdate: boolean): INodeProperties[] {
	const fields: INodeProperties[] = [
		{
			displayName: 'Can Create Club Events',
			name: 'canCreateClubEvents',
			type: 'boolean',
			default: false,
			description: 'Whether the group may plan events for the whole club',
			routing: { send: { type: 'body', property: 'canCreateClubEvents' } },
		},
		{
			displayName: 'Can Create Club News',
			name: 'canCreateClubNews',
			type: 'boolean',
			default: false,
			description: 'Whether the group may publish news for the whole club',
			routing: { send: { type: 'body', property: 'canCreateClubNews' } },
		},
		{
			displayName: 'Description',
			name: 'description',
			type: 'string',
			typeOptions: { rows: 4 },
			default: '',
			routing: { send: { type: 'body', property: 'description' } },
		},
		{
			displayName: 'External ID',
			name: 'externalId',
			type: 'string',
			default: '',
			description: forUpdate
				? 'Your own ID for this group, up to 100 characters. An empty value removes it.'
				: 'Your own ID for this group, up to 100 characters, so you can find it again',
			routing: { send: { type: 'body', property: 'externalId' } },
		},
		{
			displayName: 'Type',
			name: 'type',
			type: 'options',
			options: GROUP_TYPE_OPTIONS,
			default: 'Team',
			routing: { send: { type: 'body', property: 'type' } },
		},
	];
	if (forUpdate) {
		fields.push({
			displayName: 'Name',
			name: 'name',
			type: 'string',
			default: '',
			routing: { send: { type: 'body', property: 'name' } },
		});
	}
	return fields.sort((a, b) => a.displayName.localeCompare(b.displayName));
}

export const groupDescription: INodeProperties[] = [
	{
		displayName: 'Operation',
		name: 'operation',
		type: 'options',
		noDataExpression: true,
		displayOptions: { show: { resource: [resource] } },
		options: [
			{
				name: 'Create',
				value: 'create',
				action: 'Create a group',
				description: 'Add a team or commission',
				routing: { request: { method: 'POST', url: '/groups' } },
			},
			{
				name: 'Get',
				value: 'get',
				action: 'Get a group',
				description: 'Get one team or commission',
				routing: { request: { method: 'GET', url: groupPath } },
			},
			{
				name: 'Get Many',
				value: 'getAll',
				action: 'Get many groups',
				description: 'Get the club’s teams and commissions, by name',
				routing: {
					request: { method: 'GET', url: '/groups' },
					send: { preSend: [normalizeDates] },
					output: listOutput,
				},
			},
			{
				name: 'Update',
				value: 'update',
				action: 'Update a group',
				description: 'Change a group; only the fields you set change',
				routing: { request: { method: 'PATCH', url: groupPath } },
			},
		],
		default: 'getAll',
	},
	idProperty('Group ID', 'groupId', resource, ['get', 'update'], 'The ID of the group'),
	{
		displayName: 'Name',
		name: 'name',
		type: 'string',
		required: true,
		default: '',
		displayOptions: { show: { resource: [resource], operation: ['create'] } },
		routing: { send: { type: 'body', property: 'name' } },
	},
	{
		displayName: 'Additional Fields',
		name: 'additionalFields',
		type: 'collection',
		placeholder: 'Add Field',
		default: {},
		displayOptions: { show: { resource: [resource], operation: ['create'] } },
		options: groupFields(false),
	},
	{
		displayName: 'Update Fields',
		name: 'updateFields',
		type: 'collection',
		placeholder: 'Add Field',
		default: {},
		displayOptions: { show: { resource: [resource], operation: ['update'] } },
		options: groupFields(true),
	},
	...getManyProperties(resource, [externalIdFilterOption, updatedSinceFilterOption]),
];
