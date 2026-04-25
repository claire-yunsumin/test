# SelvasIn4 HWE Decision Workspace

PRD 기반 Release 2/3 데모 구현입니다. 프론트엔드와 백엔드를 분리한 npm workspace 모노레포 구조입니다.

## Structure

- `apps/web`: React 19 + Vite UI
- `apps/api`: Express API server with PRD-aligned domain endpoints
- `packages/shared`: shared DTOs, enums, seed data, UI metadata
- `docs/ARCHITECTURE.md`: monorepo boundaries, known limits, evolution rules
- `docs/ACTION_FLOWS.md`: Hook loop, action flows, and Decision Graph layers

## Run

```bash
npm install
npm run dev
```

- Web: http://localhost:5173
- API: http://localhost:4000/health

`npm run dev` runs Turbo in parallel for the API and web workspaces. If compiled shared output is missing, run `npm run build -w packages/shared` once or use `npm run dev:legacy`.

## Verify

```bash
npm run typecheck
npm run build
npm run test
```

`npm run test` runs API security and authorization regression tests against an ephemeral local Express server.

## Implemented PRD Slice

- `/tasks`: task list, board, backlog, quick creation, and task view tabs
- `/graph`: Decision Graph visualization across hierarchy, context, decisions, and note references
- `/tasks/:id`: Decision Workspace with system fields, Notes, Thread, Form Output, Timeline, decision modal
- `/inbox`: DECISION / DISCUSSION / AWARENESS / RESULT tabs backed by API data
- `/settings/templates` and `/templates`: template/workflow metadata CRUD including decision transitions
- `/settings/access`: RBAC roles, invite flow mock, and member removal
- `/settings/analytics`: pilot/retention metrics
