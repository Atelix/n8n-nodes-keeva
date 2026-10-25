# n8n-nodes-keeva

This is an [n8n](https://n8n.io/) community node package for [Keeva](https://keeva.app), the app sports clubs use for
their events, volunteer tasks, teams, members and news. It lets a workflow read and change a club's data through
Keeva's public API, and start when that data changes.

It contains:

- **Keeva**: events, tasks, groups, members, news and parent accounts. Also usable as a tool by n8n's AI agents.
- **Keeva Trigger**: starts a workflow when events, tasks, groups, members or news are added or changed, by polling.
- **Keeva Instant Trigger**: starts a workflow as soon as Keeva reports a change through a webhook, deletions included.

[Installation](#installation) · [Credentials](#credentials) · [Operations](#operations) ·
[Keeva Trigger](#keeva-trigger) · [Keeva Instant Trigger](#keeva-instant-trigger) · [Example](#example) · [Compatibility](#compatibility) ·
[Development](#development)

## Installation

On a self-hosted n8n, an owner or admin installs the package from **Settings → Community nodes → Install**, with the
package name `n8n-nodes-keeva`. See n8n's
[community nodes installation guide](https://docs.n8n.io/integrations/community-nodes/installation/) for details and
for installing from the command line (`npm install n8n-nodes-keeva` in `~/.n8n/nodes`) in queue mode or Docker.

The package has no runtime dependencies.

## Credentials

The nodes use a **Keeva API** credential with a club API key.

1. **Your club needs the Pro plan.** The public API is part of Keeva's Pro plan (platform administrators can also turn
   it on for a club). Without it every request, including the credential test, gets `404 Not Found`.
2. **Create a key.** A club member with the Club management right opens the club app, goes to **Manage → API keys**
   and creates a key. Give it a name (for example "n8n"), choose its scopes (see below) and optionally an expiry date.
   The key (`kva_…`) is shown once; copy it then. A lost key cannot be recovered: revoke it and create a new one.
3. **Create the credential in n8n.**
   - **API Key**: the `kva_…` key.
   - **Base URL**: `https://keeva.app` (the default). Your club's address, such as `https://yourclub.keeva.app`, also
     works. Never use `api.keeva.app`. A trailing `/` or `/api/v1` is ignored.

   n8n tests the credential with `GET /api/v1/key`, which works for any valid key whatever its scopes.

A key belongs to one club; requests never name a club. Each key may make 120 requests per minute (more get
`429 Too Many Requests`), so set **Return All** and polling intervals with that in mind. Errors come back as RFC 7807
problem details: `401` for an invalid, revoked or expired key, `403` when the key lacks a scope, `404` for an ID outside
the club, `400` with the failing fields for invalid input and `409` for conflicts.

### Scopes per operation

Each kind of data has separate read, create and change scopes. Give the key only what the workflow needs.

| Resource | Operation | Scopes |
|----------|-----------|--------|
| Event | Get, Get Many | `Events` (private events also need `PrivateEvents`) |
| Event | Create | `EventsCreate` (a private event also needs `PrivateEvents`) |
| Event | Update, Cancel | `EventsUpdate` |
| Task | Get, Get Many | `Tasks` (tasks of private events also need `PrivateEvents`) |
| Task | Create | `TasksCreate` |
| Task | Update | `TasksUpdate` |
| Group | Get, Get Many | `Groups` |
| Group | Create | `GroupsCreate` |
| Group | Update | `GroupsUpdate` |
| Member | Get, Get Many | `Members`; add `MembersContacts` for `email` and linked `accounts`, `MembersPersonalData` for `birthDate`, `personalData` and `fields` |
| Member | Create | `MembersCreate`; Personal Data and Member Fields also need `MembersPersonalData` |
| Member | Onboard | `MembersCreate`; inviting a new account needs `UsersInvite`; Personal Data and Member Fields need `MembersPersonalData` |
| Member | Update, Add to Group, Remove From Group | `MembersUpdate` |
| Member | Set Personal Data, Set Fields | `MembersUpdate` + `MembersPersonalData` |
| Member | Get Member Fields | `Members` + `MembersPersonalData` |
| Member | Delete | `MembersDelete` |
| News | Get, Get Many | `News` |
| News | Create Draft | `NewsCreate` |
| News | Update | `NewsUpdate` |
| News | Publish | `NewsPublish` |
| Parent Account | Update | `MembersUpdate` + `MembersContacts` |
| Keeva Trigger | any | The read scope of the watched data (`Events`, `Tasks`, `Groups`, `Members` or `News`) |
| Keeva Instant Trigger | any | `Webhooks` + the read scope of every chosen event type (`event.*` needs `Events`, `task.*` `Tasks`, and so on) |

The **Group** pickers load the club's groups and need `Groups`; without it, enter a group ID instead. The **Member
field** picker needs `Members` + `MembersPersonalData`.

### Personal data

Member data your workflows read from Keeva (names, email addresses, birth dates, personal data, member fields) is
personal data under the GDPR. The club stays responsible for it, and the n8n instance and every service a workflow
sends it to process it on the club's behalf:

- Make sure the club has a data processing agreement with whoever hosts n8n (n8n Cloud or your own host) and with each
  service the workflow passes member data to.
- Give a key only the scopes the workflow needs; leave out `MembersContacts` and `MembersPersonalData` unless it uses
  them.
- n8n stores the input and output of every execution. Limit how long it keeps them (for example with
  `EXECUTIONS_DATA_PRUNE` and `EXECUTIONS_DATA_MAX_AGE`, or **Save successful production executions** off in the
  workflow settings).
- Revoke a key in Keeva when the workflow is no longer used.

## Operations

**Event**
- **Cancel**: cancel an event with a reason; invited members are told.
- **Create**: plan an event for a group and invite its members (or the whole club for a club event).
- **Get** / **Get Many**: events by start time, cancelled ones included. Filters: From, To, Group, External ID,
  Updated Since.
- **Update**: change the fields you set. A new date asks invited members to answer again.

**Task**
- **Create**, **Get**, **Get Many** (filters: Group, Event ID, Updated Since), **Update** (Required Count `0` removes
  the number).

**Group**
- **Create**, **Get**, **Get Many** (filters: External ID, Updated Since), **Update**.

**Member**
- **Add to Group**: put the member in a group with a role, or change their role there.
- **Create**: add a member with email address and, optionally, birth date, in groups, with personal data and member field
  values.
- **Delete**: deletes the member **for good**, with their invitations, attendance, account links, group rights and
  profile picture. It cannot be undone. Members with club rights cannot be deleted through the API (`409`).
- **Get** / **Get Many**: active members by last name. Filters: Group, External ID, Updated Since.
- **Get Member Fields**: the club's own member fields with their IDs, types and options.
- **Onboard**: bring one person in with their groups and accounts (such as both parents). Safe to repeat: the member is
  found again by External ID, so it never creates anything twice.
- **Remove From Group**: their upcoming invitations and rights in the group go; past attendance stays.
- **Set Fields**: set values of the club's member fields; fields you do not send keep their value, **Clear Value**
  clears one. Numbers use a dot (`1.82`), dates `yyyy-MM-dd`, yes/no `true` or `false`.
- **Set Personal Data**: **replaces** all personal data; anything you leave out is cleared. Get the member first and
  send everything they should keep.
- **Update**: change name, infix, email address, birth date or External ID.

**News**
- **Create Draft**: write an article for a group; it stays a draft until published.
- **Get** / **Get Many**: published news with the Public visibility, newest first. Filters: Group, Updated Since.
- **Publish**: publish a draft, optionally with a new visibility. **With Club visibility Keeva emails and notifies
  every member of the club.** Publishing cannot be undone; publishing twice gives `409`.
- **Update**: change any article of the club, draft or published.

**Parent Account**
- **Update**: change a parent's relationship, phone number or whether they are the first point of contact. The Link ID
  is the `linkId` in a member's `accounts` (read with `MembersContacts`).

Notes:

- **Get Many** returns up to **Limit** items (1–100), or every page with **Return All**, which follows Keeva's
  `nextOffset` until the last page.
- **Update** operations send only the fields you add, so a field cannot be cleared by leaving it empty; External ID
  (and a member's Infix) are removed by sending an empty value.
- Dates without a time zone are read in the workflow's time zone and sent to Keeva in UTC. Keeva returns times in UTC.
- The list endpoints do not report deletions; use the **Keeva Instant Trigger** (`*.deleted` events) or refresh a full
  copy now and then if you keep one in sync.

## Keeva Trigger

A polling trigger. Choose what to watch (Events, Tasks, Groups, Members or News) and optionally a group, and set the
poll interval.

- On the first poll after the workflow is activated it only records the time; nothing from before is emitted.
- Each later poll asks Keeva for everything changed since the previous poll (`updatedSince`), reads every page and emits
  one item per new or changed item, oldest change first.
- A manual test run in the editor returns up to 10 recently changed items so you can map fields, without moving the
  recorded time.
- Deleted items are not reported. An item changed exactly at the moment of a poll can be emitted twice; use its `id` and
  `updatedAt` if a downstream system must not see duplicates.

## Keeva Instant Trigger

A webhook trigger: Keeva posts each change to n8n as it happens, so nothing is polled. Choose the **Events** that should
start the workflow:

| Data | Event types |
|------|-------------|
| Events | `event.created`, `event.updated`, `event.cancelled`, `event.deleted` |
| Tasks | `task.created`, `task.updated`, `task.deleted` |
| Groups | `group.created`, `group.updated`, `group.deleted` |
| Members | `member.created`, `member.updated`, `member.archived`, `member.deleted`, `member.groups_changed` |
| News | `news.published`, `news.updated`, `news.deleted` (published news with the Public visibility) |

How it works:

- **Activating** the workflow creates a webhook in Keeva for the key (`POST /api/v1/webhooks`), named
  `n8n: <workflow name>`, and keeps its id and signing secret in the workflow. **Deactivating** removes it
  (`DELETE /api/v1/webhooks/{id}`). Changing the event types replaces the webhook on the next activation. **Listen for
  test event** in the editor does the same with n8n's test address. The club app lists these webhooks under
  **Manage → Webhooks**.
- **Keeva only sends to a public `https://` address.** n8n's webhook address (its `WEBHOOK_URL` setting) must be
  reachable from the internet over HTTPS; `localhost`, private addresses and plain `http://` are refused with `400`.
- Every delivery's `Keeva-Webhook-Signature` is checked against the raw body with the secret, in constant time, and a
  `Keeva-Webhook-Timestamp` more than 5 minutes off is refused. Anything that fails gets `401` and starts nothing.
- Each delivery is one item with Keeva's payload, which says what happened but does not contain the item:

  ```json
  {
    "id": "1f0c6e5a-8a4e-4c55-9d43-6f1f6b7c2a10",
    "type": "event.updated",
    "occurredAt": "2026-10-25T12:00:00Z",
    "clubId": "…",
    "data": { "id": "…", "externalId": "match-7", "url": "https://yourclub.keeva.app/api/v1/events/…" }
  }
  ```

- **Options → Fetch Full Record** reads the item with the same key and adds it as `record`. Only the path of
  `data.url` is used, with the credential's Base URL, so the key is never sent anywhere else. Deletions and
  `member.archived` have no `url`, so `record` is `null`; it is also `null` when the key cannot read the item (any
  more), for example an event that became private. Any other failure (such as `429`) fails the delivery, and Keeva
  sends it again later.
- **Options → Include Test Pings** also lets the `ping` a club manager sends from the club app (**Send test**) start
  the workflow; by default it is answered and ignored.
- Delivery is **at least once** and **not in order**: Keeva retries failed deliveries for up to two days with the
  same `id`. Drop an `id` you have already handled, and read the item (or use `occurredAt`) rather than relying on
  the order of events. A webhook that keeps failing for three days is switched off by Keeva; resume it in the club
  app.

## Example

Keep a mailing list in step with the club's members:

1. **Keeva Trigger**, resource **Member**, polling every 15 minutes. Key scopes: `Members`, `MembersContacts`.
2. **IF** `{{ $json.email }}` is not empty.
3. Your mailing list node, adding or updating a subscriber with email `{{ $json.email }}` and name
   `{{ $json.firstname }} {{ $json.lastname }}`.

Or onboard sign-ups from a website form: **Webhook** → **Keeva**, resource **Member**, operation **Onboard**, with
External ID set to the form's membership number, the groups the person signed up for and both parents under
**Accounts** (key scopes `MembersCreate` and, to invite new parents, `UsersInvite`). Repeating a submission reuses the
same member.

## Compatibility

Built with `@n8n/node-cli` 0.52.6 against `n8n-workflow` 2.43. The routes, parameters and body fields are checked
against Keeva's public OpenAPI document as of 19 October 2026, with the `/api/v1/webhooks` routes added on
25 October 2026 (see [Development](#development)).

## Development

```sh
npm ci
npm run lint       # n8n's community node linter (strict mode)
npm run typecheck  # TypeScript, including the tests
npm test           # vitest
npm run build
npm run dev        # starts n8n on http://localhost:5678 with these nodes loaded
```

`test/openapi.test.ts` checks every operation's method and path, query parameters, body fields and enum values against
`test/fixtures/keeva-openapi.json`, a copy of Keeva's `GET /api/v1/openapi.json`, and does the same for the Keeva
Instant Trigger's webhook requests. Refresh that file when Keeva's public API changes. The `/api/v1/webhooks` part was
written from Keeva's `PublicWebhooksController` and its models rather than downloaded; replace the whole file with a
fresh download when you next refresh it.

Releasing: bump `version` in `package.json` and add a `CHANGELOG.md` entry, then publish a GitHub release tagged with
that version (for example `v0.1.0`). The **Publish** workflow publishes to npm with provenance.

## Resources

- [Keeva public API documentation](https://keeva.app/api/v1/docs/)
- [n8n community nodes documentation](https://docs.n8n.io/integrations/#community-nodes)

## License

[MIT](LICENSE)
