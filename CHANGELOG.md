# Changelog

## 0.1.0

- Keeva API credential (club API key and base URL), tested with `GET /api/v1/key`.
- Keeva node: events (get, get many, create, update, cancel), tasks (get, get many, create, update), groups (get,
  get many, create, update), members (get, get many, create, onboard, update, set personal data, set fields, add to
  group, remove from group, delete, get member fields), news (get, get many, create draft, update, publish) and parent
  accounts (update). Usable as an AI agent tool.
- Keeva Trigger: polls events, tasks, groups, members or news for changes with `updatedSince`.
