# TimeApp

TimeApp is a German-language mobile employee time tracking prototype for companies in Germany.

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — run the API server (port 5000)
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- Required env: `DATABASE_URL` — Postgres connection string

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- API: Express 5
- DB: PostgreSQL + Drizzle ORM
- Validation: Zod (`zod/v4`), `drizzle-zod`
- API codegen: Orval (from OpenAPI spec)
- Build: esbuild (CJS bundle)

## Where things live

- `artifacts/timeapp` — Expo mobile app with the login and employee time clock experience.
- `artifacts/timeapp/app/index.tsx` — single-route prototype UI and local clock behavior.
- `artifacts/timeapp/constants/colors.ts` — TimeApp brand and semantic color tokens.
- `artifacts/timeapp/assets/images/timeapp-icon.png` — generated app icon.
- `artifacts/api-server` — shared Express API scaffold; not required by the first frontend-only prototype.

## Architecture decisions

- The first prototype is frontend-only and uses AsyncStorage for local clock persistence; no backend or database is needed yet.
- The app intentionally uses one focused Expo Router screen rather than tabs because employees primarily need fast clock-in and clock-out actions.
- Login is a prototype flow with local validation and a sample employee identity; production authentication should be added before release.

## Product

Employees can sign in in German, see their name and the live date/time, start or end their workday, and view today's recorded hours and progress toward an eight-hour target.

## User preferences

- The first prototype should not include payment or subscription features.

## Gotchas

- The current login and time tracking behavior is intentionally local prototype behavior and is not a secure authentication implementation.

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
