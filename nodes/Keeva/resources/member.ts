import type { INodeProperties } from 'n8n-workflow';

import { normalizeDates } from '../shared/dates';
import {
	externalIdFilterOption,
	GENDER_OPTIONS,
	getManyProperties,
	GROUP_ROLE_OPTIONS,
	groupFilterOption,
	idProperty,
	listOutput,
	PARENT_RELATIONSHIP_OPTIONS,
	requiredGroupProperty,
	successOutput,
	updatedSinceFilterOption,
} from '../shared/descriptions';
import { memberBodyPreSend } from '../shared/memberBody';

const resource = 'member';
const memberPath = '=/members/{{$parameter.memberId}}';
const show = (operation: string[]) => ({ show: { resource: [resource], operation } });

const groupsOption: INodeProperties = {
	displayName: 'Groups',
	name: 'groups',
	type: 'fixedCollection',
	typeOptions: { multipleValues: true },
	placeholder: 'Add Group',
	default: {},
	description: 'Groups to put the member in; they are invited to the groups’ upcoming events',
	options: [
		{
			displayName: 'Group',
			name: 'group',
			values: [
				{
					displayName: 'Group Name or ID',
					name: 'groupId',
					type: 'options',
					typeOptions: { loadOptionsMethod: 'getGroups' },
					default: '',
					description:
						'Choose from the list, or specify an ID using an <a href="https://docs.n8n.io/code/expressions/">expression</a>',
				},
				{
					displayName: 'Role',
					name: 'role',
					type: 'options',
					options: GROUP_ROLE_OPTIONS,
					default: 'Player',
				},
			],
		},
	],
};

const accountsOption: INodeProperties = {
	displayName: 'Accounts',
	name: 'accounts',
	type: 'fixedCollection',
	typeOptions: { multipleValues: true },
	placeholder: 'Add Account',
	default: {},
	description:
		'Keeva accounts that get access to the member, such as both parents (up to 10). An existing account is linked without an email; a new address gets an invite email, which needs the UsersInvite scope.',
	options: [
		{
			displayName: 'Account',
			name: 'account',
			values: [
				{
					displayName: 'Email',
					name: 'email',
					type: 'string',
					placeholder: 'name@email.com',
					default: '',
				},
				{
					displayName: 'Email Off For Group Names or IDs',
					name: 'emailOffGroups',
					type: 'multiOptions',
					typeOptions: { loadOptionsMethod: 'getGroups' },
					default: [],
					description:
						'Groups whose news this account does not get by email: the member’s groups or groups that publish club news. Only applied to a new account; an existing account keeps its own choices. Choose from the list, or specify IDs using an <a href="https://docs.n8n.io/code/expressions/">expression</a>.',
				},
				{
					displayName: 'Email On For Group Names or IDs',
					name: 'emailOnGroups',
					type: 'multiOptions',
					typeOptions: { loadOptionsMethod: 'getGroups' },
					default: [],
					description:
						'Groups whose news this account gets by email. Email is on unless turned off, so this mainly reports the account’s setting back in the output. Choose from the list, or specify IDs using an <a href="https://docs.n8n.io/code/expressions/">expression</a>.',
				},
				{
					displayName: 'First Name',
					name: 'firstname',
					type: 'string',
					default: '',
					description: 'Needed only when the address has no Keeva account yet',
				},
				{
					displayName: 'Is Parent',
					name: 'isParent',
					type: 'boolean',
					default: false,
					description:
						'Whether the account is a parent or guardian rather than the member themselves',
				},
				{
					displayName: 'Is Primary Contact',
					name: 'isPrimaryContact',
					type: 'boolean',
					default: false,
					description: 'Whether this parent is the first point of contact (at most one account)',
				},
				{
					displayName: 'Last Name',
					name: 'lastname',
					type: 'string',
					default: '',
					description: 'Needed only when the address has no Keeva account yet',
				},
				{
					displayName: 'Phone Number',
					name: 'phoneNumber',
					type: 'string',
					default: '',
					description: 'The parent’s phone number',
				},
				{
					displayName: 'Relationship',
					name: 'relationship',
					type: 'options',
					options: [{ name: '(Not Set)', value: '' }, ...PARENT_RELATIONSHIP_OPTIONS],
					default: '',
					description: 'Only for parents',
				},
			],
		},
	],
};

const personalDataOptions: INodeProperties[] = [
	{ displayName: 'City', name: 'city', type: 'string', default: '' },
	{
		displayName: 'Country Code',
		name: 'countryCode',
		type: 'string',
		default: '',
		placeholder: 'NL',
		description: 'Two-letter country code',
	},
	{
		displayName: 'Emergency Contact Name',
		name: 'emergencyContactName',
		type: 'string',
		default: '',
	},
	{
		displayName: 'Emergency Contact Phone',
		name: 'emergencyContactPhone',
		type: 'string',
		default: '',
	},
	{
		displayName: 'Gender',
		name: 'gender',
		type: 'options',
		options: GENDER_OPTIONS,
		default: 'Unspecified',
	},
	{ displayName: 'House Number', name: 'houseNumber', type: 'string', default: '' },
	{
		displayName: 'House Number Addition',
		name: 'houseNumberAddition',
		type: 'string',
		default: '',
	},
	{ displayName: 'Member Since', name: 'memberSince', type: 'dateTime', default: '' },
	{ displayName: 'Member Until', name: 'memberUntil', type: 'dateTime', default: '' },
	{
		displayName: 'Notes',
		name: 'notes',
		type: 'string',
		typeOptions: { rows: 3 },
		default: '',
		description: 'The club’s internal note about the member',
	},
	{ displayName: 'Phone Number', name: 'phoneNumber', type: 'string', default: '' },
	{ displayName: 'Postal Code', name: 'postalCode', type: 'string', default: '' },
	{ displayName: 'Street', name: 'street', type: 'string', default: '' },
];

export const memberDescription: INodeProperties[] = [
	{
		displayName: 'Operation',
		name: 'operation',
		type: 'options',
		noDataExpression: true,
		displayOptions: { show: { resource: [resource] } },
		options: [
			{
				name: 'Add to Group',
				value: 'addToGroup',
				action: 'Add a member to a group',
				description:
					'Put the member in a group with a role, or change their role there; they are invited to its upcoming events',
				routing: {
					request: {
						method: 'PUT',
						url: '=/members/{{$parameter.memberId}}/groups/{{$parameter.groupId}}',
					},
				},
			},
			{
				name: 'Create',
				value: 'create',
				action: 'Create a member',
				description: 'Add a member to the club, optionally in groups',
				routing: {
					request: { method: 'POST', url: '/members' },
					send: { preSend: [memberBodyPreSend] },
				},
			},
			{
				name: 'Delete',
				value: 'delete',
				action: 'Delete a member',
				description:
					'Delete the member for good, with their invitations, attendance, account links and group rights. This cannot be undone.',
				routing: { request: { method: 'DELETE', url: memberPath }, output: successOutput },
			},
			{
				name: 'Get',
				value: 'get',
				action: 'Get a member',
				description: 'Get one active member',
				routing: { request: { method: 'GET', url: memberPath } },
			},
			{
				name: 'Get Many',
				value: 'getAll',
				action: 'Get many members',
				description: 'Get the club’s active members, by last name',
				routing: {
					request: { method: 'GET', url: '/members' },
					send: { preSend: [normalizeDates] },
					output: listOutput,
				},
			},
			{
				name: 'Get Member Fields',
				value: 'getFields',
				action: 'Get the club s member fields',
				description: 'Get the club’s member fields with their IDs, types and options',
				routing: { request: { method: 'GET', url: '/members/fields' } },
			},
			{
				name: 'Onboard',
				value: 'onboard',
				action: 'Onboard a member',
				description:
					'Bring one person in with their groups and accounts (such as both parents); safe to repeat, it never creates anything twice',
				routing: {
					request: { method: 'POST', url: '/members/onboard' },
					send: { preSend: [memberBodyPreSend] },
				},
			},
			{
				name: 'Remove From Group',
				value: 'removeFromGroup',
				action: 'Remove a member from a group',
				description:
					'Take the member out of a group; their upcoming invitations and rights there go, past attendance stays',
				routing: {
					request: {
						method: 'DELETE',
						url: '=/members/{{$parameter.memberId}}/groups/{{$parameter.groupId}}',
					},
					output: successOutput,
				},
			},
			{
				name: 'Set Fields',
				value: 'setFields',
				action: 'Set a member s field values',
				description:
					'Set the member’s values for the member fields you send; other fields keep theirs',
				routing: {
					request: { method: 'PATCH', url: '=/members/{{$parameter.memberId}}/fields' },
					send: { preSend: [memberBodyPreSend] },
				},
			},
			{
				name: 'Set Personal Data',
				value: 'setPersonalData',
				action: 'Set a member s personal data',
				description: 'Replace all of the member’s personal data; anything you leave out is cleared',
				routing: {
					request: { method: 'PUT', url: '=/members/{{$parameter.memberId}}/personalData' },
					send: { preSend: [memberBodyPreSend] },
				},
			},
			{
				name: 'Update',
				value: 'update',
				action: 'Update a member',
				description:
					'Change a member’s name, email address or birth date; only the fields you set change',
				routing: {
					request: { method: 'PATCH', url: memberPath },
					send: { preSend: [normalizeDates] },
				},
			},
		],
		default: 'getAll',
	},
	idProperty(
		'Member ID',
		'memberId',
		resource,
		['get', 'update', 'delete', 'setPersonalData', 'setFields', 'addToGroup', 'removeFromGroup'],
		'The ID of the member',
	),
	{
		displayName:
			'Deleting removes the member for good, with their invitations, attendance, account links, group rights and profile picture. It cannot be undone. Needs the MembersDelete scope.',
		name: 'deleteNotice',
		type: 'notice',
		default: '',
		displayOptions: show(['delete']),
	},
	requiredGroupProperty(resource, ['addToGroup', 'removeFromGroup'], false),
	{
		displayName: 'Role',
		name: 'role',
		type: 'options',
		options: GROUP_ROLE_OPTIONS,
		default: 'Player',
		required: true,
		description: 'The member’s role in the group',
		displayOptions: show(['addToGroup']),
		routing: { send: { type: 'body', property: 'role' } },
	},
	{
		displayName: 'External ID',
		name: 'externalId',
		type: 'string',
		required: true,
		default: '',
		description:
			'The person’s ID in your own system, such as a membership number. A repeated call finds the member again by it.',
		displayOptions: show(['onboard']),
		routing: { send: { type: 'body', property: 'externalId' } },
	},
	{
		displayName: 'First Name',
		name: 'firstname',
		type: 'string',
		required: true,
		default: '',
		displayOptions: show(['create', 'onboard']),
		routing: { send: { type: 'body', property: 'firstname' } },
	},
	{
		displayName: 'Last Name',
		name: 'lastname',
		type: 'string',
		required: true,
		default: '',
		displayOptions: show(['create', 'onboard']),
		routing: { send: { type: 'body', property: 'lastname' } },
	},
	{
		displayName: 'Email',
		name: 'email',
		type: 'string',
		placeholder: 'name@email.com',
		required: true,
		default: '',
		description: 'The member’s own email address, stored for the club',
		displayOptions: show(['create', 'onboard']),
		routing: { send: { type: 'body', property: 'email' } },
	},
	{
		displayName: 'Birth Date',
		name: 'birthDate',
		type: 'dateTime',
		default: '',
		description: 'Optional; only the date is used. Leave it empty when the club does not need it.',
		displayOptions: show(['create', 'onboard']),
		routing: { send: { type: 'body', property: 'birthDate' } },
	},
	{
		displayName: 'Additional Fields',
		name: 'additionalFields',
		type: 'collection',
		placeholder: 'Add Field',
		default: {},
		displayOptions: show(['create']),
		options: [
			{
				displayName: 'External ID',
				name: 'externalId',
				type: 'string',
				default: '',
				description: 'Your own ID for this member, up to 100 characters, so you can find it again',
				routing: { send: { type: 'body', property: 'externalId' } },
			},
			groupsOption,
			{
				displayName: 'Infix',
				name: 'infix',
				type: 'string',
				default: '',
				description: 'Name infix, such as "de" or "van der"',
				routing: { send: { type: 'body', property: 'infix' } },
			},
		],
	},
	{
		displayName: 'Additional Fields',
		name: 'additionalFields',
		type: 'collection',
		placeholder: 'Add Field',
		default: {},
		displayOptions: show(['onboard']),
		options: [
			accountsOption,
			{
				...groupsOption,
				description: 'Groups to put the member in. A group they are already in is left as it is.',
			},
			{
				displayName: 'Infix',
				name: 'infix',
				type: 'string',
				default: '',
				description: 'Name infix, such as "de" or "van der". Only stored for a new member.',
				routing: { send: { type: 'body', property: 'infix' } },
			},
		],
	},
	{
		displayName: 'Update Fields',
		name: 'updateFields',
		type: 'collection',
		placeholder: 'Add Field',
		default: {},
		displayOptions: show(['update']),
		options: [
			{
				displayName: 'Birth Date',
				name: 'birthDate',
				type: 'dateTime',
				default: '',
				description: 'Only the date is used',
				routing: { send: { type: 'body', property: 'birthDate' } },
			},
			{
				displayName: 'Email',
				name: 'email',
				type: 'string',
				placeholder: 'name@email.com',
				default: '',
				routing: { send: { type: 'body', property: 'email' } },
			},
			{
				displayName: 'External ID',
				name: 'externalId',
				type: 'string',
				default: '',
				description:
					'Your own ID for this member, up to 100 characters. An empty value removes it.',
				routing: { send: { type: 'body', property: 'externalId' } },
			},
			{
				displayName: 'First Name',
				name: 'firstname',
				type: 'string',
				default: '',
				routing: { send: { type: 'body', property: 'firstname' } },
			},
			{
				displayName: 'Infix',
				name: 'infix',
				type: 'string',
				default: '',
				description: 'Name infix, such as "de" or "van der". An empty value removes it.',
				routing: { send: { type: 'body', property: 'infix' } },
			},
			{
				displayName: 'Last Name',
				name: 'lastname',
				type: 'string',
				default: '',
				routing: { send: { type: 'body', property: 'lastname' } },
			},
		],
	},
	{
		displayName:
			'This replaces all of the member’s personal data: anything you leave out is cleared. Get the member first (with the MembersPersonalData scope) and send everything they should keep.',
		name: 'personalDataNotice',
		type: 'notice',
		default: '',
		displayOptions: show(['setPersonalData']),
	},
	{
		displayName: 'Personal Data',
		name: 'personalData',
		type: 'collection',
		placeholder: 'Add Personal Data',
		default: {},
		description:
			'Address, phone numbers and other personal data. Needs the MembersPersonalData scope. On onboarding it is stored for a new member only.',
		displayOptions: show(['create', 'onboard', 'setPersonalData']),
		options: personalDataOptions,
	},
	{
		displayName: 'Member Fields',
		name: 'memberFields',
		type: 'fixedCollection',
		typeOptions: { multipleValues: true },
		placeholder: 'Add Field Value',
		default: {},
		description:
			'Values for the club’s own member fields. Numbers use a dot (1.82), dates yyyy-MM-dd, yes/no true or false, and a choice field one of its options. Needs the MembersPersonalData scope.',
		displayOptions: show(['create', 'onboard', 'setFields']),
		options: [
			{
				displayName: 'Field',
				name: 'field',
				values: [
					{
						displayName: 'Field Name or ID',
						name: 'fieldId',
						type: 'options',
						typeOptions: { loadOptionsMethod: 'getMemberFields' },
						default: '',
						description:
							'Choose from the list, or specify an ID using an <a href="https://docs.n8n.io/code/expressions/">expression</a>',
					},
					{
						displayName: 'Value',
						name: 'value',
						type: 'string',
						default: '',
					},
					{
						displayName: 'Clear Value',
						name: 'clear',
						type: 'boolean',
						default: false,
						description: 'Whether to clear the member’s value for this field instead of setting it',
					},
				],
			},
		],
	},
	...getManyProperties(resource, [
		externalIdFilterOption,
		groupFilterOption,
		updatedSinceFilterOption,
	]),
];
