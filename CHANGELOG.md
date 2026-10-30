# Changelog

## Unreleased

- Member **Onboard**: each account takes **Email On For Groups** and **Email Off For Groups**, which groups' news a
  new account gets by email. An existing account keeps its own choices; the output shows each account's setting.
- The OpenAPI test fixture includes the onboarding `emailGroups` fields and the groups' `publishesClubNews`.
- Member **Create** and **Onboard**: **Birth Date** is optional, as it is in Keeva now.
- Member **Set Personal Data**, **Create** and **Onboard**: **Photo Consent** is gone, as Keeva dropped it.
- README: a **Personal data** section on data processing agreements, key scopes and n8n's execution data.

## 0.2.0

- Keeva Instant Trigger: a webhook trigger on Keeva's REST hooks (`/api/v1/webhooks`). It creates the webhook when the
  workflow is activated and removes it when deactivated, checks every delivery's HMAC-SHA256 signature and timestamp,
  and can read the changed item (**Fetch Full Record**) and let test pings through. Needs the `Webhooks` scope.
- The OpenAPI test fixture includes the `/api/v1/webhooks` routes and the new key scopes.

## 0.1.0

- Keeva API credential (club API key and base URL), tested with `GET /api/v1/key`.
- Keeva node: events (get, get many, create, update, cancel), tasks (get, get many, create, update), groups (get,
  get many, create, update), members (get, get many, create, onboard, update, set personal data, set fields, add to
  group, remove from group, delete, get member fields), news (get, get many, create draft, update, publish) and parent
  accounts (update). Usable as an AI agent tool.
- Keeva Trigger: polls events, tasks, groups, members or news for changes with `updatedSince`.
