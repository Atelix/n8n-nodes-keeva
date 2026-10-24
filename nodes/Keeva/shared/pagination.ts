import type {
	DeclarativeRestApiSettings,
	IDataObject,
	IExecutePaginationFunctions,
	IHttpRequestOptions,
	INodeExecutionData,
} from 'n8n-workflow';

import { fetchAllPages, KEEVA_CREDENTIAL, type KeevaPage } from './transport';

/**
 * Declarative pagination for "Return All": requests the list with the filters the node built and follows
 * `nextOffset` until Keeva reports the last page. The pages' `items` become the node's output items.
 */
export async function paginateByNextOffset(
	this: IExecutePaginationFunctions,
	requestData: DeclarativeRestApiSettings.ResultOptions,
): Promise<INodeExecutionData[]> {
	const baseOptions = requestData.options as IHttpRequestOptions;
	const filters = { ...((baseOptions.qs as IDataObject | undefined) ?? {}) };
	delete filters.offset;
	delete filters.limit;

	const items = await fetchAllPages(async (qs) => {
		const options: IHttpRequestOptions = {
			...baseOptions,
			qs,
			json: true,
			returnFullResponse: false,
		};
		return (await this.helpers.httpRequestWithAuthentication.call(
			this,
			KEEVA_CREDENTIAL,
			options,
		)) as KeevaPage;
	}, filters);

	return items.map((json) => ({ json }));
}
