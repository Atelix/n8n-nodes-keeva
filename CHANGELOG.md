# Changelog

## Unreleased

- A new **Application** resource with **Get** and **Get Many** (filter on **Status** and **Updated Since**) for the
  applications of a club's registration form, and **Application Received**, **Application Decided** and
  **Application Withdrawn** in the **Keeva Webhook Trigger**; the **Keeva Trigger** can poll applications too. The key
  needs the new Applications scope (`MemberApplications`). Needs the Keeva release with `/api/v1/applications`.
- The OpenAPI test fixture includes the applications endpoints.
- Member **Get Many**: a **Membership** filter for only current or only former members (their member-until date has
  passed). Keeva returns `isFormerMember` on every member; former members are in no group and cannot be invited.
- The OpenAPI test fixture includes the members' `isFormerMember` and its list filter.
- **Breaking:** group roles are the club's own now (such as Speler, Hoofdcoach, Scorer) instead of Player, Coach,
  Staff, Chairman and Member. Member **Add to Group** and the **Groups** of **Create** and **Onboard** take
  **Role Name or ID**, chosen from the club's roles (needs the Groups scope); left empty, Keeva keeps a member's
  current role or gives the club's first role for the group. Workflows that set a role must pick it again.
- The OpenAPI test fixture is refreshed from the current public API, including `GET /api/v1/groups/roles`.
- Member **Onboard**: each account takes **Email On For Groups** and **Email Off For Groups**, which groups' news the
  account gets by email, working like the switches in the Keeva app for new and existing accounts.
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
