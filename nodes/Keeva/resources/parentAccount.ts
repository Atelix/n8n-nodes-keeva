import type { INodeProperties } from 'n8n-workflow';

import { idProperty, PARENT_RELATIONSHIP_OPTIONS } from '../shared/descriptions';

const resource = 'parentAccount';

export const parentAccountDescription: INodeProperties[] = [
	{
		displayName: 'Operation',
		name: 'operation',
		type: 'options',
		noDataExpression: true,
		displayOptions: { show: { resource: [resource] } },
		options: [
			{
				name: 'Update',
				value: 'update',
				action: 'Update a parent account',
				description:
					'Change a parent’s relationship, phone number or whether they are the first point of contact',
				routing: {
					request: {
						method: 'PATCH',
						url: '=/members/{{$parameter.memberId}}/accounts/{{$parameter.linkId}}',
					},
				},
			},
		],
		default: 'update',
	},
	idProperty(
		'Member ID',
		'memberId',
		resource,
		['update'],
		'The ID of the member the parent is linked to',
	),
	idProperty(
		'Link ID',
		'linkId',
		resource,
		['update'],
		'The link between the parent’s account and the member: the linkId in the member’s accounts (read with the MembersContacts scope)',
	),
	{
		displayName: 'Update Fields',
		name: 'updateFields',
		type: 'collection',
		placeholder: 'Add Field',
		default: {},
		displayOptions: { show: { resource: [resource], operation: ['update'] } },
		options: [
			{
				displayName: 'Is Primary Contact',
				name: 'isPrimaryContact',
				type: 'boolean',
				default: false,
				description: 'Whether this parent is the member’s first point of contact',
				routing: { send: { type: 'body', property: 'isPrimaryContact' } },
			},
			{
				displayName: 'Phone Number',
				name: 'phoneNumber',
				type: 'string',
				default: '',
				description: 'The parent’s phone number. An empty value removes it.',
				routing: { send: { type: 'body', property: 'phoneNumber' } },
			},
			{
				displayName: 'Relationship',
				name: 'relationship',
				type: 'options',
				options: PARENT_RELATIONSHIP_OPTIONS,
				default: 'Parent',
				routing: { send: { type: 'body', property: 'relationship' } },
			},
		],
	},
];
