# SelvasIn4 HWE Architecture

## Current Shape

This repository is intentionally a monorepo. The product has tightly coupled UI, API contracts, workflow metadata, RBAC rules, and demo domain data, so colocating them keeps Release 2/3 iteration fast while preserving clear boundaries.

```text
apps/
  api/              Express API for the PRD vertical slice
    src/domain/     demo store, projections, event helpers
    src/http/       security, auth/access, validation middleware
    src/server.ts   app factory, route registration, and process entrypoint
    src/*.test.ts   API security, RBAC, validation, and CRUD regression tests
  web/              React 19 + Vite application
    src/components/ reusable UI primitives
    src/lib/        API client, router, view-specific types
    src/App.tsx     screen composition and product flow
packages/
  shared/           cross-app domain types, UI metadata, seed data
docs/
  ARCHITECTURE.md   monorepo boundaries and evolution rules
  ACTION_FLOWS.md   Hook loop, action flows, and Decision Graph diagrams
```

## Architecture Decision

The monorepo is the right fit for the current product stage.

- `packages/shared` owns API/domain language: enums, DTO shapes, template/state metadata.
- `apps/api` owns authorization, input validation, event creation, and resource scoping. Frontend checks are only UX hints.
- `apps/web` owns user flow, state visibility, feedback, Decision Graph visualization, and interaction layout.
- Security and UX rules are operating constraints, not optional review notes.

## Why This Is Good Enough Now

- The UI can be run and reviewed immediately.
- API and UI share one domain vocabulary, reducing enum drift in Inbox, Workflow, RBAC, and Timeline.
- `/graph` projects existing Task, Notes, Thread, Timeline, and referenced Notes data into a Decision Graph without creating a separate graph store.
- Security middleware is separated from route logic, so P0 checks can be reviewed independently.
- API app creation is separated from `listen()`, so tests can run against an isolated ephemeral server.
- Frontend common controls and API error handling are separated from page composition.
- The demo in-memory store is isolated under `apps/api/src/domain`, making it replaceable by DB repositories later.
- Automated API tests cover security headers, CORS denial, unknown users, IDOR, role boundaries, invalid references, and CRUD smoke paths.

## Known Limits

- `apps/api/src/server.ts` still contains all route registrations. When API scope grows, split by feature:
  - `routes/tasks.ts`
  - `routes/notes.ts`
  - `routes/inbox.ts`
  - `routes/admin.ts`
  - `routes/templates.ts`
- `packages/shared/src/index.ts` still includes seed data. When persistence is added, move seed data to `packages/fixtures` or `apps/api/src/domain/fixtures`.
- `apps/web/src/App.tsx` still contains all screen components. When screens stabilize, split into:
  - `features/hierarchy`
  - `features/tasks`
  - `features/inbox`
  - `features/admin`
  - `features/templates`

## Evolution Rules

1. New enums or DTO fields start in `packages/shared`.
2. Every mutating API endpoint must validate input with Zod and enforce role/resource access server-side.
3. Frontend permission checks must explain policy to users, but never be the only guard.
4. Screens should preserve task context: status, next action, collaboration, and timeline must remain close together.
5. Route files can import domain helpers, but domain helpers must not import Express.
6. No secrets in shared packages, frontend env, seed data, logs, or generated bundles.
7. Security and authorization tests must be updated when route permissions or resource visibility rules change.
8. Cross-task note references are allowed only when the referenced note belongs to a task visible to the acting user.

## Next Architecture Milestones

1. Add persistence boundary: repository interfaces and DB-backed implementation.
2. Replace demo auth header with real session/JWT middleware.
3. Split API routes by feature once route count exceeds the current vertical slice.
4. Split web screens by feature after the PRD flow is validated in UI review.
5. Broaden automated coverage to frontend interaction flows after UI review.
