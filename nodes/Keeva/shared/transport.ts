import type {
	IDataObject,
	IExecuteSingleFunctions,
	IHttpRequestMethods,
	IHttpRequestOptions,
	ILoadOptionsFunctions,
	IPollFunctions,
} from 'n8n-workflow';

export const KEEVA_CREDENTIAL = 'keevaApi';

/** The most items Keeva returns per page (`limit` is 1–100). */
export const MAX_PAGE_SIZE = 100;

/**
 * The public API root for the credential's base URL. Accepts `https://keeva.app`, a club address such as
 * `https://yourclub.keeva.app`, with or without a trailing slash or `/api/v1`.
 */
export function apiRoot(baseUrl: unknown): string {
	const trimmed = String(baseUrl ?? '')
		.trim()
		.replace(/\/+$/, '')
		.replace(/\/api\/v1$/, '');
	return `${trimmed}/api/v1`;
}

/** The same normalisation as {@link apiRoot}, as an n8n expression for declarative `requestDefaults`. */
export const API_ROOT_EXPRESSION =
	'={{String($credentials.baseUrl).trim().replace(/\\/+$/, "").replace(/\\/api\\/v1$/, "")}}/api/v1';

/** One page of a Keeva list: `{ items, nextOffset }`; `nextOffset` is `null` on the last page. */
export interface KeevaPage<T = IDataObject> {
	items: T[];
	nextOffset?: number | null;
}

export type PageFetcher = (qs: IDataObject) => Promise<KeevaPage>;

/**
 * Reads every page of a Keeva list by following `nextOffset` until it is `null`, asking for the largest pages Keeva
 * allows. `qs` holds the list's filters; `offset` and `limit` are set here.
 */
export async function fetchAllPages(
	fetchPage: PageFetcher,
	qs: IDataObject = {},
	pageSize: number = MAX_PAGE_SIZE,
): Promise<IDataObject[]> {
	const items: IDataObject[] = [];
	let offset = 0;
	for (;;) {
		const page = await fetchPage({ ...qs, offset, limit: pageSize });
		items.push(...(page?.items ?? []));
		const next = page?.nextOffset;
		if (next === null || next === undefined) return items;
		if (typeof next !== 'number' || next <= offset) {
			throw new Error(
				`Keeva returned an invalid nextOffset (${String(next)}) after offset ${offset}`,
			);
		}
		offset = next;
	}
}

type KeevaRequestContext = IExecuteSingleFunctions | ILoadOptionsFunctions | IPollFunctions;

/** An authenticated request to the Keeva public API, for code that does not use declarative routing. */
export async function keevaApiRequest(
	this: KeevaRequestContext,
	method: IHttpRequestMethods,
	path: string,
	qs?: IDataObject,
	body?: IDataObject,
): Promise<unknown> {
	const credentials = await this.getCredentials(KEEVA_CREDENTIAL);
	const options: IHttpRequestOptions = {
		method,
		url: `${apiRoot(credentials.baseUrl)}${path}`,
		headers: { Accept: 'application/json' },
		json: true,
	};
	if (qs && Object.keys(qs).length > 0) options.qs = qs;
	if (body) options.body = body;
	return await (this as ILoadOptionsFunctions).helpers.httpRequestWithAuthentication.call(
		this,
		KEEVA_CREDENTIAL,
		options,
	);
}
