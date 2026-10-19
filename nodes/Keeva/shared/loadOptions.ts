import type { IDataObject, ILoadOptionsFunctions, INodePropertyOptions } from 'n8n-workflow';

import { fetchAllPages, keevaApiRequest, type KeevaPage } from './transport';

/** Every team and commission of the key's club (needs the Groups scope), by name. */
export async function getGroups(this: ILoadOptionsFunctions): Promise<INodePropertyOptions[]> {
	const groups = await fetchAllPages(
		async (qs) => (await keevaApiRequest.call(this, 'GET', '/groups', qs)) as KeevaPage,
	);
	return groups
		.map((group) => ({
			name: String(group.name),
			value: String(group.id),
			description: group.type ? String(group.type) : undefined,
		}))
		.sort((a, b) => a.name.localeCompare(b.name));
}

/** The club's active member fields in the club's order (needs Members and MembersPersonalData). */
export async function getMemberFields(
	this: ILoadOptionsFunctions,
): Promise<INodePropertyOptions[]> {
	const fields = (await keevaApiRequest.call(this, 'GET', '/members/fields')) as IDataObject[];
	return (fields ?? []).map((field) => {
		const options =
			Array.isArray(field.options) && field.options.length > 0
				? `: ${(field.options as string[]).join(', ')}`
				: '';
		return {
			name: String(field.name),
			value: String(field.id),
			description: `${String(field.type)}${options}${field.isRequired ? ' (required)' : ''}`,
		};
	});
}
