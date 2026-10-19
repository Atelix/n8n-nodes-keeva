import { NodeConnectionTypes, type INodeType, type INodeTypeDescription } from 'n8n-workflow';

import { eventDescription } from './resources/event';
import { groupDescription } from './resources/group';
import { memberDescription } from './resources/member';
import { newsDescription } from './resources/news';
import { parentAccountDescription } from './resources/parentAccount';
import { taskDescription } from './resources/task';
import { getGroups, getMemberFields } from './shared/loadOptions';
import { API_ROOT_EXPRESSION } from './shared/transport';

export class Keeva implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'Keeva',
		name: 'keeva',
		icon: { light: 'file:keeva.svg', dark: 'file:keeva.dark.svg' },
		group: ['transform'],
		version: 1,
		subtitle: '={{$parameter["operation"] + ": " + $parameter["resource"]}}',
		description: 'Read and change events, tasks, groups, members and news of a Keeva club',
		defaults: {
			name: 'Keeva',
		},
		usableAsTool: true,
		inputs: [NodeConnectionTypes.Main],
		outputs: [NodeConnectionTypes.Main],
		credentials: [{ name: 'keevaApi', required: true }],
		requestDefaults: {
			baseURL: API_ROOT_EXPRESSION,
			headers: {
				Accept: 'application/json',
				'Content-Type': 'application/json',
			},
		},
		properties: [
			{
				displayName: 'Resource',
				name: 'resource',
				type: 'options',
				noDataExpression: true,
				options: [
					{ name: 'Event', value: 'event' },
					{ name: 'Group', value: 'group' },
					{ name: 'Member', value: 'member' },
					{ name: 'News', value: 'news' },
					{ name: 'Parent Account', value: 'parentAccount' },
					{ name: 'Task', value: 'task' },
				],
				default: 'event',
			},
			...eventDescription,
			...taskDescription,
			...groupDescription,
			...memberDescription,
			...newsDescription,
			...parentAccountDescription,
		],
	};

	methods = {
		loadOptions: {
			getGroups,
			getMemberFields,
		},
	};
}
