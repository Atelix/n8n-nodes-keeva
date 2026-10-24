import type { IDataObject, IExecuteSingleFunctions, IHttpRequestOptions } from 'n8n-workflow';

import { normalizeDateFields } from './dates';

const ADDRESS_KEYS = [
	'street',
	'houseNumber',
	'houseNumberAddition',
	'postalCode',
	'city',
	'countryCode',
] as const;

const PERSONAL_KEYS = [
	'phoneNumber',
	'gender',
	'emergencyContactName',
	'emergencyContactPhone',
	'memberSince',
	'memberUntil',
	'photoConsent',
	'notes',
] as const;

function rows(collection: unknown, key: string): IDataObject[] {
	const value = (collection as IDataObject | undefined)?.[key];
	return Array.isArray(value) ? (value as IDataObject[]) : [];
}

function present(value: unknown): boolean {
	return value !== undefined && value !== null && value !== '';
}

/** Group rows of the "Groups" fixed collection as Keeva's `[{ groupId, role }]`. */
export function toGroupMemberships(collection: unknown, defaultRole = 'Player'): IDataObject[] {
	return rows(collection, 'group')
		.filter((row) => present(row.groupId))
		.map((row) => ({ groupId: row.groupId, role: present(row.role) ? row.role : defaultRole }));
}

/** Account rows of the onboarding "Accounts" fixed collection, leaving out what was not filled in. */
export function toOnboardAccounts(collection: unknown): IDataObject[] {
	return rows(collection, 'account')
		.filter((row) => present(row.email))
		.map((row) => {
			const account: IDataObject = { email: row.email, isParent: row.isParent === true };
			for (const key of ['firstname', 'lastname', 'relationship', 'phoneNumber'] as const) {
				if (present(row[key])) account[key] = row[key];
			}
			if (row.isPrimaryContact === true) account.isPrimaryContact = true;
			return account;
		});
}

/** Field rows of the "Member Fields" fixed collection as `[{ fieldId, value }]`; "Clear Value" sends `null`. */
export function toFieldValues(collection: unknown): IDataObject[] {
	return rows(collection, 'field')
		.filter((row) => present(row.fieldId))
		.map((row) => ({
			fieldId: row.fieldId,
			value: row.clear === true ? null : String(row.value ?? ''),
		}));
}

/**
 * The flat "Personal Data" collection as Keeva's personal data model, with the address nested. Returns `undefined`
 * when nothing was filled in.
 */
export function toPersonalData(collection: unknown): IDataObject | undefined {
	const source = (collection ?? {}) as IDataObject;
	const personalData: IDataObject = {};
	const address: IDataObject = {};
	for (const key of ADDRESS_KEYS) {
		if (present(source[key])) address[key] = source[key];
	}
	for (const key of PERSONAL_KEYS) {
		if (present(source[key])) personalData[key] = source[key];
	}
	if (Object.keys(address).length > 0) personalData.address = address;
	return Object.keys(personalData).length > 0 ? personalData : undefined;
}

/**
 * Builds the parts of a member request body that do not map one-to-one onto a parameter: groups, accounts,
 * personal data and member field values.
 */
export function buildMemberBody(
	operation: string,
	body: IDataObject,
	parameters: {
		additionalFields?: IDataObject;
		personalData?: IDataObject;
		memberFields?: IDataObject;
	},
): IDataObject {
	const result: IDataObject = { ...body };
	const additional = parameters.additionalFields ?? {};

	if (operation === 'create' || operation === 'onboard') {
		const groups = toGroupMemberships(additional.groups);
		if (groups.length > 0) result.groups = groups;
		if (operation === 'onboard') {
			const accounts = toOnboardAccounts(additional.accounts);
			if (accounts.length > 0) result.accounts = accounts;
		}
		const personalData = toPersonalData(parameters.personalData);
		if (personalData) result.personalData = personalData;
		const fields = toFieldValues(parameters.memberFields);
		if (fields.length > 0) result.fields = fields;
	} else if (operation === 'setPersonalData') {
		// PUT replaces all personal data: what is not sent is cleared, so always send the full object.
		Object.assign(result, toPersonalData(parameters.personalData) ?? {});
	} else if (operation === 'setFields') {
		result.values = toFieldValues(parameters.memberFields);
	}
	return result;
}

/** Declarative `preSend` for member writes; see {@link buildMemberBody}. */
export async function memberBodyPreSend(
	this: IExecuteSingleFunctions,
	requestOptions: IHttpRequestOptions,
): Promise<IHttpRequestOptions> {
	const operation = this.getNodeParameter('operation') as string;
	const read = (name: string): IDataObject => {
		try {
			return (this.getNodeParameter(name, {}) as IDataObject) ?? {};
		} catch {
			return {};
		}
	};
	const body = buildMemberBody(operation, (requestOptions.body as IDataObject | undefined) ?? {}, {
		additionalFields: read('additionalFields'),
		personalData: read('personalData'),
		memberFields: read('memberFields'),
	});
	normalizeDateFields(body, this.getTimezone());
	requestOptions.body = body;
	return requestOptions;
}
