import type { INodeProperties } from 'n8n-workflow';

import { normalizeDates } from '../shared/dates';
import {
	getManyProperties,
	idProperty,
	listOutput,
	updatedSinceFilterOption,
} from '../shared/descriptions';

const resource = 'application';

export const applicationDescription: INodeProperties[] = [
	{
		displayName: 'Operation',
		name: 'operation',
		type: 'options',
		noDataExpression: true,
		displayOptions: { show: { resource: [resource] } },
		options: [
			{
				name: 'Get',
				value: 'get',
				action: 'Get an application',
				description: 'Get one application from the registration form',
				routing: { request: { method: 'GET', url: '=/applications/{{$parameter.applicationId}}' } },
			},
			{
				name: 'Get Many',
				value: 'getAll',
				action: 'Get many applications',
				description:
					'Get the applications from the club’s registration form, oldest first. Accepting and declining happen in the Keeva app.',
				routing: {
					request: { method: 'GET', url: '/applications' },
					send: { preSend: [normalizeDates] },
					output: listOutput,
				},
			},
		],
		default: 'getAll',
	},
	{
		displayName:
			'Applications hold what the applicant filled in, often about a child. The API key needs the Applications scope (MemberApplications). Once the club decides, only the name and the decision are left.',
		name: 'applicationNotice',
		type: 'notice',
		default: '',
		displayOptions: { show: { resource: [resource] } },
	},
	idProperty(
		'Application ID',
		'applicationId',
		resource,
		['get'],
		'The ID of the application, for example from an Application Received trigger',
	),
	...getManyProperties(resource, [
		{
			displayName: 'Status',
			name: 'status',
			type: 'options',
			options: [
				{
					name: 'Accepted',
					value: 'Accepted',
					description: 'The club made the applicant a member',
				},
				{ name: 'Declined', value: 'Declined', description: 'The club said no' },
				{ name: 'Pending', value: 'Pending', description: 'Waiting for the club to decide' },
			],
			default: 'Pending',
			description: 'Only applications with this status',
			routing: { send: { type: 'query', property: 'status' } },
		},
		updatedSinceFilterOption,
	]),
];
