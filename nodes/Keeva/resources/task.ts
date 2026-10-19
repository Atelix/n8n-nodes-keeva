import type { INodeProperties } from 'n8n-workflow';

import { normalizeDates } from '../shared/dates';
import {
	getManyProperties,
	groupFilterOption,
	idProperty,
	listOutput,
	requiredGroupProperty,
	updatedSinceFilterOption,
} from '../shared/descriptions';

const resource = 'task';
const taskPath = '=/tasks/{{$parameter.taskId}}';

function taskFields(forUpdate: boolean): INodeProperties[] {
	const fields: INodeProperties[] = [
		{
			displayName: 'Allow Volunteers',
			name: 'allowVolunteers',
			type: 'boolean',
			default: false,
			description: 'Whether members can sign themselves up',
			routing: { send: { type: 'body', property: 'allowVolunteers' } },
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
			displayName: 'Required Count',
			name: 'requiredCount',
			type: 'number',
			typeOptions: { minValue: forUpdate ? 0 : 1, maxValue: 1000 },
			default: 1,
			description: forUpdate
				? 'How many people the task needs; 0 removes the number'
				: 'How many people the task needs',
			routing: { send: { type: 'body', property: 'requiredCount' } },
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
	} else {
		fields.push({
			displayName: 'Event ID',
			name: 'eventId',
			type: 'string',
			default: '',
			description:
				'An event of the same group to add the task to. Tasks of private events need the PrivateEvents scope.',
			routing: { send: { type: 'body', property: 'eventId' } },
		});
	}
	return fields.sort((a, b) => a.displayName.localeCompare(b.displayName));
}

export const taskDescription: INodeProperties[] = [
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
				action: 'Create a task',
				description: 'Add a task to a group, optionally for one of its events',
				routing: { request: { method: 'POST', url: '/tasks' } },
			},
			{
				name: 'Get',
				value: 'get',
				action: 'Get a task',
				description: 'Get one task',
				routing: { request: { method: 'GET', url: taskPath } },
			},
			{
				name: 'Get Many',
				value: 'getAll',
				action: 'Get many tasks',
				description: 'Get the club’s volunteer tasks',
				routing: {
					request: { method: 'GET', url: '/tasks' },
					send: { preSend: [normalizeDates] },
					output: listOutput,
				},
			},
			{
				name: 'Update',
				value: 'update',
				action: 'Update a task',
				description: 'Change a task; only the fields you set change',
				routing: { request: { method: 'PATCH', url: taskPath } },
			},
		],
		default: 'getAll',
	},
	idProperty('Task ID', 'taskId', resource, ['get', 'update'], 'The ID of the task'),
	requiredGroupProperty(resource, ['create']),
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
		options: taskFields(false),
	},
	{
		displayName: 'Update Fields',
		name: 'updateFields',
		type: 'collection',
		placeholder: 'Add Field',
		default: {},
		displayOptions: { show: { resource: [resource], operation: ['update'] } },
		options: taskFields(true),
	},
	...getManyProperties(resource, [
		{
			displayName: 'Event ID',
			name: 'eventId',
			type: 'string',
			default: '',
			description: 'Only tasks of this event',
			routing: { send: { type: 'query', property: 'eventId' } },
		},
		groupFilterOption,
		updatedSinceFilterOption,
	]),
];
