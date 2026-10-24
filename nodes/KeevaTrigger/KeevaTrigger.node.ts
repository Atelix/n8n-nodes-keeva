import {
	NodeApiError,
	NodeConnectionTypes,
	type IDataObject,
	type INodeExecutionData,
	type INodeType,
	type INodeTypeDescription,
	type IPollFunctions,
	type JsonObject,
} from 'n8n-workflow';

import { getGroups } from '../Keeva/shared/loadOptions';
import { keevaApiRequest, type KeevaPage } from '../Keeva/shared/transport';
import { pollKeeva, type PollState } from './poll';

/** The list each resource polls. */
export const TRIGGER_PATHS: Record<string, string> = {
	event: '/events',
	group: '/groups',
	member: '/members',
	news: '/news',
	task: '/tasks',
};

export class KeevaTrigger implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'Keeva Trigger',
		name: 'keevaTrigger',
		icon: { light: 'file:keeva.svg', dark: 'file:keeva.dark.svg' },
		group: ['trigger'],
		version: 1,
		subtitle: '={{"New or updated " + $parameter["resource"]}}',
		description:
			'Starts the workflow when events, tasks, groups, members or news of a Keeva club change',
		defaults: {
			name: 'Keeva Trigger',
		},
		polling: true,
		inputs: [],
		outputs: [NodeConnectionTypes.Main],
		credentials: [{ name: 'keevaApi', required: true }],
		properties: [
			{
				displayName: 'Resource',
				name: 'resource',
				type: 'options',
				noDataExpression: true,
				options: [
					{
						name: 'Event',
						value: 'event',
						description: 'New or changed events, cancelled ones included',
					},
					{ name: 'Group', value: 'group', description: 'New or changed teams and commissions' },
					{ name: 'Member', value: 'member', description: 'New or changed active members' },
					{ name: 'News', value: 'news', description: 'New or changed published public news' },
					{ name: 'Task', value: 'task', description: 'New or changed volunteer tasks' },
				],
				default: 'event',
				description: 'What to watch for changes',
			},
			{
				displayName:
					'Keeva does not report deletions, so deleted items do not start the workflow. The first poll after activation only records the time; changes from then on are emitted.',
				name: 'pollNotice',
				type: 'notice',
				default: '',
			},
			{
				displayName: 'Filters',
				name: 'filters',
				type: 'collection',
				placeholder: 'Add Filter',
				default: {},
				displayOptions: { show: { resource: ['event', 'member', 'news', 'task'] } },
				options: [
					{
						displayName: 'Group Name or ID',
						name: 'groupId',
						type: 'options',
						typeOptions: { loadOptionsMethod: 'getGroups' },
						default: '',
						description:
							'Choose from the list, or specify an ID using an <a href="https://docs.n8n.io/code/expressions/">expression</a>',
					},
				],
			},
		],
	};

	methods = {
		loadOptions: {
			getGroups,
		},
	};

	async poll(this: IPollFunctions): Promise<INodeExecutionData[][] | null> {
		const resource = this.getNodeParameter('resource') as string;
		const path = TRIGGER_PATHS[resource];
		const filters =
			resource === 'group' ? {} : (this.getNodeParameter('filters', {}) as IDataObject);
		const query: IDataObject = {};
		if (filters.groupId) query.groupId = filters.groupId;

		const staticData = this.getWorkflowStaticData('node') as PollState;
		let items: IDataObject[] | null;
		try {
			items = await pollKeeva({
				mode: this.getMode(),
				staticData,
				now: new Date(),
				query,
				fetchPage: async (qs) => (await keevaApiRequest.call(this, 'GET', path, qs)) as KeevaPage,
			});
		} catch (error) {
			throw new NodeApiError(this.getNode(), error as JsonObject);
		}

		if (!items) return null;
		return [this.helpers.returnJsonArray(items)];
	}
}
