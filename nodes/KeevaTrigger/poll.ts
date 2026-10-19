import type { IDataObject } from 'n8n-workflow';

import { fetchAllPages, type PageFetcher } from '../Keeva/shared/transport';

/** What the trigger keeps between polls in the workflow's static data. */
export interface PollState {
	/** When the last successful poll started (UTC ISO). */
	lastTimeChecked?: string;
}

export interface PollOptions {
	/** `manual` for a test run from the editor; anything else is an active workflow. */
	mode: string;
	staticData: PollState;
	now: Date;
	fetchPage: PageFetcher;
	/** The list's filters, such as `groupId`. */
	query?: IDataObject;
}

/** How many items a manual test run returns at most. */
export const MANUAL_ITEM_LIMIT = 10;

/** How far back a manual test run looks for changes before falling back to any items. */
export const MANUAL_LOOKBACK_MS = 30 * 24 * 60 * 60 * 1000;

function updatedAtMs(item: IDataObject): number {
	const time = Date.parse(String(item.updatedAt ?? ''));
	return Number.isNaN(time) ? 0 : time;
}

/** Oldest change first, so a workflow handles changes in the order they happened. */
function byUpdatedAt(items: IDataObject[]): IDataObject[] {
	return [...items].sort((a, b) => updatedAtMs(a) - updatedAtMs(b));
}

/**
 * One poll of a Keeva list.
 *
 * - The first poll of an active workflow only records the time, so activating does not replay the club's history.
 * - Later polls ask for everything changed since the last poll (`updatedSince`), read every page, record the new
 *   time and return the changes, or `null` when nothing changed.
 * - A manual test run returns the most recently changed items (up to {@link MANUAL_ITEM_LIMIT}) and does not move
 *   the recorded time.
 *
 * The time is taken before the request, so changes made while a poll runs are picked up by the next one. Keeva's
 * `updatedSince` is inclusive, so an item changed exactly at that moment can be returned twice.
 */
export async function pollKeeva(options: PollOptions): Promise<IDataObject[] | null> {
	const { mode, staticData, now, fetchPage } = options;
	const query = options.query ?? {};
	const pollStartedAt = now.toISOString();

	if (mode === 'manual') {
		const since = new Date(now.getTime() - MANUAL_LOOKBACK_MS).toISOString();
		let page = await fetchPage({ ...query, updatedSince: since, offset: 0, limit: 100 });
		if (!page?.items?.length) {
			page = await fetchPage({ ...query, offset: 0, limit: 100 });
		}
		const latest = byUpdatedAt(page?.items ?? [])
			.reverse()
			.slice(0, MANUAL_ITEM_LIMIT);
		return latest.length > 0 ? latest : null;
	}

	const since = staticData.lastTimeChecked;
	if (!since) {
		staticData.lastTimeChecked = pollStartedAt;
		return null;
	}

	const items = await fetchAllPages(fetchPage, { ...query, updatedSince: since });
	staticData.lastTimeChecked = pollStartedAt;
	return items.length > 0 ? byUpdatedAt(items) : null;
}
