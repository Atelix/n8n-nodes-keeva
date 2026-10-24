import type { INodeProperties } from 'n8n-workflow';

import { normalizeDates } from '../shared/dates';
import {
	EVENT_TYPE_OPTIONS,
	externalIdFilterOption,
	getManyProperties,
	groupFilterOption,
	idProperty,
	listOutput,
	requiredGroupProperty,
	updatedSinceFilterOption,
} from '../shared/descriptions';

const resource = 'event';
const eventPath = '=/events/{{$parameter.eventId}}';

/** Optional event fields shared by Create (Additional Fields) and Update (Update Fields). */
function eventFields(forUpdate: boolean): INodeProperties[] {
	const fields: INodeProperties[] = [
		{
			displayName: 'Allow Field Conflict',
			name: 'allowFieldConflict',
			type: 'boolean',
			default: false,
			description:
				'Whether to plan the event even when the field is already in use at that time; otherwise Keeva refuses with 409',
			routing: { send: { type: 'body', property: 'allowFieldConflict' } },
		},
		{
			displayName: 'Club Event',
			name: 'isClubEvent',
			type: 'boolean',
			default: false,
			description:
				'Whether the event is for the whole club instead of one group. The group must be allowed to plan club events.',
			routing: { send: { type: 'body', property: 'isClubEvent' } },
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
				? 'Your own ID for this event, up to 100 characters. An empty value removes it.'
				: 'Your own ID for this event, up to 100 characters, so you can find it again',
			routing: { send: { type: 'body', property: 'externalId' } },
		},
		{
			displayName: 'Field ID',
			name: 'fieldId',
			type: 'string',
			default: '',
			description: 'The ID of one of the club’s fields',
			routing: { send: { type: 'body', property: 'fieldId' } },
		},
		{
			displayName: 'Gathering Location',
			name: 'gatheringLocation',
			type: 'string',
			default: '',
			routing: { send: { type: 'body', property: 'gatheringLocation' } },
		},
		{
			displayName: 'Gathering Time',
			name: 'gatheringTime',
			type: 'dateTime',
			default: '',
			routing: { send: { type: 'body', property: 'gatheringTime' } },
		},
		{
			displayName: 'Location',
			name: 'location',
			type: 'string',
			default: '',
			routing: { send: { type: 'body', property: 'location' } },
		},
		{
			displayName: 'Private',
			name: 'isPrivate',
			type: 'boolean',
			default: false,
			description: 'Whether the event is private. Needs the PrivateEvents scope.',
			routing: { send: { type: 'body', property: 'isPrivate' } },
		},
		{
			displayName: 'Type',
			name: 'type',
			type: 'options',
			options: EVENT_TYPE_OPTIONS,
			default: 'Other',
			routing: { send: { type: 'body', property: 'type' } },
		},
	];
	if (forUpdate) {
		fields.push(
			{
				displayName: 'End Time',
				name: 'endTime',
				type: 'dateTime',
				default: '',
				routing: { send: { type: 'body', property: 'endTime' } },
			},
			{
				displayName: 'Name',
				name: 'name',
				type: 'string',
				default: '',
				routing: { send: { type: 'body', property: 'name' } },
			},
			{
				displayName: 'Start Time',
				name: 'startTime',
				type: 'dateTime',
				default: '',
				description:
					'A new start without a new end keeps the event’s length. A new date asks invited members to answer again.',
				routing: { send: { type: 'body', property: 'startTime' } },
			},
		);
	}
	return fields.sort((a, b) => a.displayName.localeCompare(b.displayName));
}

export const eventDescription: INodeProperties[] = [
	{
		displayName: 'Operation',
		name: 'operation',
		type: 'options',
		noDataExpression: true,
		displayOptions: { show: { resource: [resource] } },
		options: [
			{
				name: 'Cancel',
				value: 'cancel',
				action: 'Cancel an event',
				description: 'Cancel an event with a reason; invited members are told',
				routing: { request: { method: 'POST', url: '=/events/{{$parameter.eventId}}/cancel' } },
			},
			{
				name: 'Create',
				value: 'create',
				action: 'Create an event',
				description: 'Plan an event for a group and invite its members',
				routing: {
					request: { method: 'POST', url: '/events' },
					send: { preSend: [normalizeDates] },
				},
			},
			{
				name: 'Get',
				value: 'get',
				action: 'Get an event',
				description: 'Get one event',
				routing: { request: { method: 'GET', url: eventPath } },
			},
			{
				name: 'Get Many',
				value: 'getAll',
				action: 'Get many events',
				description: 'Get the club’s events, by start time',
				routing: {
					request: { method: 'GET', url: '/events' },
					send: { preSend: [normalizeDates] },
					output: listOutput,
				},
			},
			{
				name: 'Update',
				value: 'update',
				action: 'Update an event',
				description: 'Change an event; only the fields you set change',
				routing: {
					request: { method: 'PATCH', url: eventPath },
					send: { preSend: [normalizeDates] },
				},
			},
		],
		default: 'getAll',
	},
	idProperty('Event ID', 'eventId', resource, ['get', 'update', 'cancel'], 'The ID of the event'),
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
		displayName: 'Start Time',
		name: 'startTime',
		type: 'dateTime',
		required: true,
		default: '',
		description: 'Without a time zone it is read in the workflow’s time zone',
		displayOptions: { show: { resource: [resource], operation: ['create'] } },
		routing: { send: { type: 'body', property: 'startTime' } },
	},
	{
		displayName: 'End Time',
		name: 'endTime',
		type: 'dateTime',
		required: true,
		default: '',
		description: 'Must be after the start',
		displayOptions: { show: { resource: [resource], operation: ['create'] } },
		routing: { send: { type: 'body', property: 'endTime' } },
	},
	{
		displayName: 'Reason',
		name: 'reason',
		type: 'string',
		required: true,
		default: '',
		description: 'Why the event is cancelled. Invited members are told.',
		displayOptions: { show: { resource: [resource], operation: ['cancel'] } },
		routing: { send: { type: 'body', property: 'reason' } },
	},
	{
		displayName: 'Additional Fields',
		name: 'additionalFields',
		type: 'collection',
		placeholder: 'Add Field',
		default: {},
		displayOptions: { show: { resource: [resource], operation: ['create'] } },
		options: eventFields(false),
	},
	{
		displayName: 'Update Fields',
		name: 'updateFields',
		type: 'collection',
		placeholder: 'Add Field',
		default: {},
		displayOptions: { show: { resource: [resource], operation: ['update'] } },
		options: eventFields(true),
	},
	...getManyProperties(resource, [
		externalIdFilterOption,
		{
			displayName: 'From',
			name: 'from',
			type: 'dateTime',
			default: '',
			description: 'Only events that end at or after this moment',
			routing: { send: { type: 'query', property: 'from' } },
		},
		groupFilterOption,
		{
			displayName: 'To',
			name: 'to',
			type: 'dateTime',
			default: '',
			description: 'Only events that start before this moment',
			routing: { send: { type: 'query', property: 'to' } },
		},
		updatedSinceFilterOption,
	]),
];
