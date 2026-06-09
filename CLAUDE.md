# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Smart Expense is a group expense coordination platform — a decision engine for social finance that tells users exactly who to pay or collect from next, and what the outcome will be. It is a full-stack TypeScript monorepo with two separate applications: an Express/Prisma backend and a React/Vite frontend.

## Repository Structure

```
Smart Expense/
├── Smart Backend/    # Express 5, Prisma ORM, PostgreSQL, Vitest
└── Smart Frontend/   # React 19, React Router 7, Tailwind CSS 4, Vite
```

Each directory is an independent npm project with its own `node_modules`, `package.json`, and `.env`. They communicate over HTTP only.

## Commands

### Backend (`Smart Backend/`)

```bash
npm run dev          # ts-node-dev with hot reload → http://localhost:3000
npm run build        # tsc → dist/
npm start            # node dist/server.js
npm test             # vitest run (single pass)
npm run test:watch   # vitest (interactive watch)

# Run a single test file
npm test -- balance.service.test.ts
```

Required `.env` keys: `DATABASE_URL`, `JWT_SECRET`. Optional: `FRONTEND_URL` (CORS whitelist, defaults to localhost:5173–5175).

### Frontend (`Smart Frontend/`)

```bash
npm run dev      # Vite dev server → http://localhost:5173
npm run build    # tsc -b && vite build
npm run lint     # eslint .
npm run preview  # preview production build
```

`VITE_API_URL` defaults to `http://localhost:3000/api`.

### Database

```bash
# From Smart Backend/
npx prisma migrate reset    # wipe + re-run all migrations
npx prisma generate         # regenerate client after schema changes
npx prisma migrate dev       # apply new migration
```

## Backend Architecture

Service-layer pattern organized by domain module. Each module has a controller, router, and service:

```
src/
├── server.ts                         # Entry point — env validation, HTTP listen
├── app.ts                            # Express app — registers routers, event handlers
├── middleware/auth.middleware.ts     # JWT verification; attaches userId to req
├── lib/
│   ├── prisma.ts                     # Singleton Prisma client (native PG adapter)
│   ├── events.ts                     # EventEmitter for post-mutation analytics triggers
│   └── events.types.ts
└── modules/
    ├── auth/                         # Public: login, register
    ├── user/                         # User profile
    ├── group/                        # Group CRUD
    ├── expense/                      # Expense creation + split recording
    ├── balance/                      # Core algorithm: debt simplification
    ├── settlement/                   # Settlement recording
    └── intelligence/                 # Behavioral analytics, trust scores, group health
```

**Critical invariants:**
- All monetary values are stored and computed in **integer cents** via `toCents()` / `fromCents()` helpers. Never use floating-point arithmetic on money.
- `simplifyDebts()` in `balance.service.ts` is the core algorithm: three phases — exact-match pass, single-payment preference, consolidation. Output guarantee: at most `n-1` transactions for `n` people with all balances conserved. This function has thorough tests; do not change its logic without running the full test suite.
- Intelligence models (`Intel_*`) are written asynchronously via EventEmitter after expense/settlement mutations — never on the critical path.

**Database models:** `User`, `Group`, `GroupMember`, `Expense`, `ExpenseSplit`, `Settlement`, `Intel_UserBehavior`, `Intel_UserPersonality`, `Intel_GroupHealth`, `Intel_DebtInsight`, `Intel_LongitudinalStats`, `Intel_SocialEquilibrium`. Schema is in `Smart Backend/prisma/schema.prisma`.

## Frontend Architecture

Custom hooks + Context pattern. No external state management library.

```
src/
├── App.tsx                             # Router, layout nesting, RootRoute / FallbackRoute
├── api/client.ts                       # Axios instance — injects Bearer token, handles 401
├── contexts/CurrentUserContext.tsx     # Global authenticated user state
├── pages/                              # Route-level components
├── components/                         # Shared UI (Navbar, Layout, Cards, etc.)
├── hooks/                              # Data-fetching and business-logic hooks
└── lib/
    ├── session.ts                       # localStorage: token + user, JWT expiry check
    ├── invalidate.ts                    # Manual cache-bust mechanism (publish/subscribe)
    ├── actionContext.ts                 # Route state shape for post-action dashboard context
    ├── smartSettlementPresentation.ts   # Currency formatting
    ├── features.ts                      # Feature flags (ENABLE_INTELLIGENCE_UI, etc.)
    └── navRef.ts                        # Global navigate() ref for use inside Axios interceptor
```

**Key patterns:**
- `RootRoute` in `App.tsx`: authenticated → `/dashboard`, else → `/` (LandingPage). `ProtectedRoute` wraps all authenticated routes and redirects to `/login` on invalid/expired token.
- Each data-fetching hook (e.g. `useGroups`, `useGroupBalance`, `useGlobalBalance`) calls the API directly. `onInvalidate()` allows components to re-fetch after mutations elsewhere.
- `useSmartSettlement()` and `useAICoordinator()` orchestrate the settlement recommendation flow and AI coordinator state machine.
- Pages pass `DashboardActionContext` between routes via `useLocation().state` to show post-action feedback on the dashboard.
- Feature flags in `lib/features.ts` gate intelligence UI, trust scores, pro upsells, and burden nudges.

## Auth Flow

1. POST `/api/auth/login` returns `{ token, user: { id, name, email } }`.
2. Frontend stores token in `localStorage` as `'token'`, user as `'user'`.
3. `isTokenValid()` decodes the JWT and checks `exp`. `hasStoredSession()` is the primary auth check.
4. Axios client injects `Authorization: Bearer <token>` on every request; 401 responses clear the session and redirect to `/login`.

## Testing

Backend uses Vitest. Key test files:

| File | What it covers |
|---|---|
| `balance.service.test.ts` | `simplifyDebts()` algorithm, uses `assertAllCleared()` invariant validator |
| `settlement.service.test.ts` | Settlement recording logic |
| `globalBalance.service.test.ts` | Cross-group balance aggregation |

Frontend has no test files.
