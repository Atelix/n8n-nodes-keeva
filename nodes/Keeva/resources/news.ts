import type { INodeProperties } from 'n8n-workflow';

import { normalizeDates } from '../shared/dates';
import {
	getManyProperties,
	groupFilterOption,
	idProperty,
	listOutput,
	NEWS_VISIBILITY_OPTIONS,
	requiredGroupProperty,
	updatedSinceFilterOption,
} from '../shared/descriptions';

const resource = 'news';
const newsPath = '=/news/{{$parameter.newsId}}';
const show = (operation: string[]) => ({ show: { resource: [resource], operation } });

function newsFields(forUpdate: boolean): INodeProperties[] {
	const fields: INodeProperties[] = [
		{
			displayName: 'Content',
			name: 'content',
			type: 'string',
			typeOptions: { rows: 6 },
			default: '',
			description: 'The article as HTML. Scripts, forms and other unsafe markup are removed.',
			routing: { send: { type: 'body', property: 'content' } },
		},
		{
			displayName: 'Description',
			name: 'description',
			type: 'string',
			typeOptions: { rows: 3 },
			default: '',
			description: 'Short summary shown in lists',
			routing: { send: { type: 'body', property: 'description' } },
		},
		{
			displayName: 'Visibility',
			name: 'visibility',
			type: 'options',
			options: NEWS_VISIBILITY_OPTIONS,
			default: 'Public',
			description: forUpdate
				? 'Who can see the article. Changing it sends nothing; publishing does.'
				: 'Who can see the article once it is published',
			routing: { send: { type: 'body', property: 'visibility' } },
		},
	];
	if (forUpdate) {
		fields.push({
			displayName: 'Title',
			name: 'title',
			type: 'string',
			default: '',
			routing: { send: { type: 'body', property: 'title' } },
		});
	}
	return fields.sort((a, b) => a.displayName.localeCompare(b.displayName));
}

export const newsDescription: INodeProperties[] = [
	{
		displayName: 'Operation',
		name: 'operation',
		type: 'options',
		noDataExpression: true,
		displayOptions: { show: { resource: [resource] } },
		options: [
			{
				name: 'Create Draft',
				value: 'create',
				action: 'Create a news draft',
				description:
					'Write a news article for a group; it is saved as a draft until you publish it',
				routing: { request: { method: 'POST', url: '/news' } },
			},
			{
				name: 'Get',
				value: 'get',
				action: 'Get a news article',
				description: 'Get one published public news article with its content',
				routing: { request: { method: 'GET', url: newsPath } },
			},
			{
				name: 'Get Many',
				value: 'getAll',
				action: 'Get many news articles',
				description: 'Get the club’s published public news, newest first',
				routing: {
					request: { method: 'GET', url: '/news' },
					send: { preSend: [normalizeDates] },
					output: listOutput,
				},
			},
			{
				name: 'Publish',
				value: 'publish',
				action: 'Publish a news article',
				description:
					'Publish a draft. With Club visibility this emails and notifies every member of the club; it cannot be undone.',
				routing: { request: { method: 'POST', url: '=/news/{{$parameter.newsId}}/publish' } },
			},
			{
				name: 'Update',
				value: 'update',
				action: 'Update a news article',
				description: 'Change a news article, draft or published; only the fields you set change',
				routing: { request: { method: 'PATCH', url: newsPath } },
			},
		],
		default: 'getAll',
	},
	idProperty(
		'News ID',
		'newsId',
		resource,
		['get', 'update', 'publish'],
		'The ID of the news article',
	),
	requiredGroupProperty(resource, ['create']),
	{
		displayName: 'Title',
		name: 'title',
		type: 'string',
		required: true,
		default: '',
		displayOptions: show(['create']),
		routing: { send: { type: 'body', property: 'title' } },
	},
	{
		displayName: 'Additional Fields',
		name: 'additionalFields',
		type: 'collection',
		placeholder: 'Add Field',
		default: {},
		displayOptions: show(['create']),
		options: newsFields(false),
	},
	{
		displayName: 'Update Fields',
		name: 'updateFields',
		type: 'collection',
		placeholder: 'Add Field',
		default: {},
		displayOptions: show(['update']),
		options: newsFields(true),
	},
	{
		displayName:
			'Publishing cannot be undone. With Club visibility Keeva emails and notifies every member of the club. Publishing an article twice fails (409). Needs the NewsPublish scope.',
		name: 'publishNotice',
		type: 'notice',
		default: '',
		displayOptions: show(['publish']),
	},
	{
		displayName: 'Publish Options',
		name: 'publishOptions',
		type: 'collection',
		placeholder: 'Add Option',
		default: {},
		displayOptions: show(['publish']),
		options: [
			{
				displayName: 'Visibility',
				name: 'visibility',
				type: 'options',
				options: NEWS_VISIBILITY_OPTIONS,
				default: 'Public',
				description: 'Who can see it; leave out to keep the article’s visibility',
				routing: { send: { type: 'body', property: 'visibility' } },
			},
		],
	},
	...getManyProperties(resource, [groupFilterOption, updatedSinceFilterOption]),
];
