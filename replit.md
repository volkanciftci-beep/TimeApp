# ZeitApp

ZeitApp is a German-language, multi-tenant B2B employee time tracking SaaS for companies.

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
- Authentication: Replit-managed Clerk
- Billing: Stripe with `stripe-replit-sync`
- Build: esbuild (ESM bundle)

## Where things live

- `artifacts/timeapp` — Expo mobile/PWA app for employee time tracking and company administration.
- `artifacts/timeapp/app/index.tsx` — focused role-aware UI for owners, managers, and employees.
- `artifacts/timeapp/constants/colors.ts` — ZeitApp brand and semantic color tokens.
- `artifacts/timeapp/assets/images/timeapp-icon.png` — ZeitApp app icon.
- `artifacts/timeapp/public` — PWA manifest, service worker, iOS install metadata, and web icons.
- `artifacts/api-server` — Clerk-protected tenant API and Stripe billing service.
- `lib/db/src/schema` — PostgreSQL/Drizzle company, employee, work-session, and break schema.
- `lib/api-spec/openapi.yaml` — contract-first API source used to generate clients and validators.

## Architecture decisions

- PostgreSQL is the source of truth for companies, memberships, work sessions, breaks, and subscription linkage.
- Every business-data query is scoped by the authenticated member's company ID.
- Clerk owns credentials and sessions; employee passwords are never stored in PostgreSQL.
- Employees are provisioned by owners/managers and sign in with company code, employee ID, and password.
- Stripe subscriptions belong to companies, not individual employees.
- The app intentionally uses one focused Expo Router screen rather than tabs because employees primarily need fast clock-in and clock-out actions.

## Product

Employees can record work and breaks and review daily, weekly, and monthly totals. Managers administer their company's employees and reports. Owners also onboard the company and manage its Stripe subscription.

## Gotchas

- API route names retain the internal `/api/timeapp` namespace for generated-client compatibility; product branding is ZeitApp.
- `stripe-replit-sync` must remain externalized from the API esbuild bundle because it loads packaged SQL migrations from disk at runtime.
- The PWA service worker is scoped to the app path and uses a versioned cache so future web asset changes can invalidate the app shell.

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
