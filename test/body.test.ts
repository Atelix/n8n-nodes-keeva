import { describe, expect, it } from 'vitest';

import { normalizeDateFields, toDateOnly, toUtcIso } from '../nodes/Keeva/shared/dates';
import { buildMemberBody, toFieldValues, toPersonalData } from '../nodes/Keeva/shared/memberBody';

describe('dates', () => {
	it('reads a date-time without an offset in the workflow’s time zone', () => {
		expect(toUtcIso('2026-10-10T18:00:00', 'Europe/Amsterdam')).toBe('2026-10-10T16:00:00.000Z');
		expect(toUtcIso('2026-12-10T18:00:00', 'Europe/Amsterdam')).toBe('2026-12-10T17:00:00.000Z');
		expect(toUtcIso('2026-10-10T18:00:00', 'UTC')).toBe('2026-10-10T18:00:00.000Z');
	});

	it('keeps the instant of a date-time with an offset', () => {
		expect(toUtcIso('2026-10-10T18:00:00+02:00', 'America/New_York')).toBe(
			'2026-10-10T16:00:00.000Z',
		);
		expect(toUtcIso('2026-10-10T18:00:00.000Z', 'Europe/Amsterdam')).toBe(
			'2026-10-10T18:00:00.000Z',
		);
	});

	it('handles the daylight-saving switch', () => {
		// Clocks in Amsterdam go back on 25 October 2026 at 03:00 CEST; 04:00 is already CET.
		expect(toUtcIso('2026-10-25T04:00:00', 'Europe/Amsterdam')).toBe('2026-10-25T03:00:00.000Z');
	});

	it('sends calendar dates as yyyy-MM-dd', () => {
		expect(toDateOnly('2012-03-04T00:00:00')).toBe('2012-03-04');
		expect(toDateOnly('2012-03-04')).toBe('2012-03-04');
		expect(toDateOnly('')).toBeUndefined();
	});

	it('normalises query and nested body fields and drops empty ones', () => {
		const body = {
			startTime: '2026-10-10T18:00:00',
			gatheringTime: '',
			birthDate: '2012-03-04T00:00:00',
			personalData: { memberSince: '2020-01-01T00:00:00' },
			name: '2026-10-10',
		};
		normalizeDateFields(body, 'Europe/Amsterdam');
		expect(body).toEqual({
			startTime: '2026-10-10T16:00:00.000Z',
			birthDate: '2012-03-04',
			personalData: { memberSince: '2020-01-01' },
			name: '2026-10-10',
		});
	});

	it('refuses something that is not a date', () => {
		expect(() => toUtcIso('next friday', 'UTC')).toThrow(/not a valid date/);
	});
});

describe('member bodies', () => {
	it('nests the address and leaves out empty personal data', () => {
		expect(toPersonalData({ city: 'Utrecht', street: '', gender: 'Male' })).toEqual({
			gender: 'Male',
			address: { city: 'Utrecht' },
		});
		expect(toPersonalData({})).toBeUndefined();
	});

	it('sends null for a cleared field value', () => {
		expect(
			toFieldValues({
				field: [
					{ fieldId: 'a', value: '1.82' },
					{ fieldId: 'b', value: 'x', clear: true },
					{ value: 'no id' },
				],
			}),
		).toEqual([
			{ fieldId: 'a', value: '1.82' },
			{ fieldId: 'b', value: null },
		]);
	});

	it('gives onboarded groups the Player role unless another is chosen', () => {
		const body = buildMemberBody(
			'onboard',
			{ externalId: '1001' },
			{
				additionalFields: {
					groups: { group: [{ groupId: 'g1' }, { groupId: 'g2', role: 'Coach' }] },
				},
			},
		);
		expect(body.groups).toEqual([
			{ groupId: 'g1', role: 'Player' },
			{ groupId: 'g2', role: 'Coach' },
		]);
		expect(body).not.toHaveProperty('accounts');
		expect(body).not.toHaveProperty('personalData');
	});

	it('always sends a full personal data object, since PUT replaces it', () => {
		expect(buildMemberBody('setPersonalData', {}, { personalData: {} })).toEqual({});
		expect(buildMemberBody('setPersonalData', {}, { personalData: { notes: 'n' } })).toEqual({
			notes: 'n',
		});
	});
});
