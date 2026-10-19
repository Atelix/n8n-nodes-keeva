import type { IDataObject, IExecuteSingleFunctions, IHttpRequestOptions } from 'n8n-workflow';

/** Fields Keeva reads as a moment in time; sent as UTC ISO strings. */
const DATE_TIME_KEYS = new Set([
	'startTime',
	'endTime',
	'gatheringTime',
	'updatedSince',
	'from',
	'to',
]);

/** Fields Keeva reads as a calendar date (`yyyy-MM-dd`). */
const DATE_KEYS = new Set(['birthDate', 'memberSince', 'memberUntil']);

const OFFSET_SUFFIX = /(Z|[+-]\d{2}:?\d{2})$/i;
const NAIVE_DATE_TIME =
	/^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2})(?::(\d{2})(?:\.(\d{1,3})\d*)?)?)?$/;

function isEmpty(value: unknown): boolean {
	return value === undefined || value === null || value === '';
}

/** How far `timeZone` is ahead of UTC at the instant `utcMs`, in milliseconds. */
function timeZoneOffsetMs(utcMs: number, timeZone: string): number {
	const format = new Intl.DateTimeFormat('en-US', {
		timeZone,
		hourCycle: 'h23',
		year: 'numeric',
		month: '2-digit',
		day: '2-digit',
		hour: '2-digit',
		minute: '2-digit',
		second: '2-digit',
	});
	const parts: Record<string, number> = {};
	for (const part of format.formatToParts(new Date(utcMs))) {
		if (part.type !== 'literal') parts[part.type] = Number(part.value);
	}
	const wallClockAsUtc = Date.UTC(
		parts.year,
		parts.month - 1,
		parts.day,
		parts.hour,
		parts.minute,
		parts.second,
	);
	return wallClockAsUtc - Math.floor(utcMs / 1000) * 1000;
}

/**
 * A date-time as a UTC ISO string. A value with an offset (or `Z`) keeps its instant; a value without one, as n8n's date
 * picker gives, is read as wall-clock time in `timeZone` (the workflow's time zone).
 */
export function toUtcIso(value: unknown, timeZone: string): string | undefined {
	if (isEmpty(value)) return undefined;
	if (value instanceof Date) return value.toISOString();
	const text = String(value).trim();
	if (OFFSET_SUFFIX.test(text)) {
		const parsed = new Date(text);
		if (Number.isNaN(parsed.getTime())) throw new Error(`"${text}" is not a valid date and time`);
		return parsed.toISOString();
	}
	const match = NAIVE_DATE_TIME.exec(text);
	if (!match) throw new Error(`"${text}" is not a valid date and time`);
	const [, year, month, day, hour, minute, second, millis] = match;
	const wallClock = Date.UTC(
		Number(year),
		Number(month) - 1,
		Number(day),
		Number(hour ?? 0),
		Number(minute ?? 0),
		Number(second ?? 0),
		Number((millis ?? '0').padEnd(3, '0')),
	);
	let utc = wallClock - timeZoneOffsetMs(wallClock, timeZone);
	// Second pass so a wall-clock time just after a daylight-saving switch gets the offset that applies then.
	utc = wallClock - timeZoneOffsetMs(utc, timeZone);
	return new Date(utc).toISOString();
}

/** A calendar date as `yyyy-MM-dd`, taken from the date part of whatever n8n's date picker or an expression gives. */
export function toDateOnly(value: unknown): string | undefined {
	if (isEmpty(value)) return undefined;
	if (value instanceof Date) return value.toISOString().slice(0, 10);
	const text = String(value).trim();
	const match = /^(\d{4}-\d{2}-\d{2})/.exec(text);
	if (match) return match[1];
	const parsed = new Date(text);
	if (Number.isNaN(parsed.getTime())) throw new Error(`"${text}" is not a valid date`);
	return parsed.toISOString().slice(0, 10);
}

/** Rewrites the known date fields of a query or body in place, including nested objects such as `personalData`. */
export function normalizeDateFields(target: IDataObject | undefined, timeZone: string): void {
	if (!target || typeof target !== 'object' || Array.isArray(target)) return;
	for (const [key, value] of Object.entries(target)) {
		if (DATE_TIME_KEYS.has(key)) {
			target[key] = toUtcIso(value, timeZone);
			if (target[key] === undefined) delete target[key];
		} else if (DATE_KEYS.has(key)) {
			target[key] = toDateOnly(value);
			if (target[key] === undefined) delete target[key];
		} else if (value && typeof value === 'object' && !Array.isArray(value)) {
			normalizeDateFields(value as IDataObject, timeZone);
		}
	}
}

/** Declarative `preSend`: sends dates the way Keeva reads them (UTC instants and `yyyy-MM-dd` dates). */
export async function normalizeDates(
	this: IExecuteSingleFunctions,
	requestOptions: IHttpRequestOptions,
): Promise<IHttpRequestOptions> {
	const timeZone = this.getTimezone();
	normalizeDateFields(requestOptions.qs, timeZone);
	if (requestOptions.body && typeof requestOptions.body === 'object') {
		normalizeDateFields(requestOptions.body as IDataObject, timeZone);
	}
	return requestOptions;
}
