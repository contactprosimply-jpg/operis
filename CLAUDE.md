# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

@AGENTS.md

> **Read `AGENTS.md` first.** This project pins a Next.js version with breaking changes vs. training
> data — consult `node_modules/next/dist/docs/` before writing App Router code (routing, data fetching,
> middleware/proxy conventions may differ from what you expect).

## What this is

Operis — French BTP (construction) tender/AO (appel d'offres) management app. Next.js 16 (App Router) +
React 19 + Supabase (Postgres/Auth/Storage), shipped as a web app (Vercel) and as an Electron desktop
wrapper that just points at the deployed URL.

Production: https://operis-f26g7.vercel.app

## Commands

```bash
npm run dev              # Next dev server (localhost:3000)
npm run build             # production build
npm start                 # run production build
npm run lint               # eslint

npm test                  # vitest run (all tests)
npm run test:watch        # vitest watch mode
npx vitest run tests/unit/imap-incremental.test.ts   # single test file

npm run sync               # manual IMAP sync (scripts/sync-mail.ts), reads .env.local
```

Desktop (Electron) build — see README.md for full detail:
```bash
npm run desktop:icon      # generate electron/icon.png + .ico
npm run desktop           # run Electron shell against OPERIS_URL (defaults to prod)
npm run desktop:build     # Windows installer + portable → dist-desktop/
```

### Tests

- Unit tests (`tests/unit/*.test.ts`) run against pure logic, no live Supabase needed.
- `tests/integration/rls-isolation.test.ts` exercises real Row Level Security against a **live Supabase
  project** — it is skipped unless `tests/helpers/supabase-test.ts`'s `integrationConfigured()` finds
  `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, and two test-user credentials in
  `.env.test` (copy `.env.test.example`).
- **Never point integration tests at the production Supabase project.** `supabase-test.ts` hard-refuses
  any URL containing the prod project ref (`lixlqcarbucmczjbgbhp`) unless `VITEST_ALLOW_PROD=1` is set —
  don't set that. See `docs/ENVIRONMENTS.md` for why prod/test must use separate Supabase projects (mail
  data isolation) and how to provision a second project.

## Auto-deploy policy (`.cursor/rules/deploy.mdc`)

After a functional code change, commit + push to `main` and deploy **without asking for confirmation**:
```bash
git add <files>            # never .env*
git commit -m "..."
git push origin main
npx vercel --prod --yes
```
Do not ask "should I push/deploy?" — this repo's standing instruction is to deploy immediately after
functional changes land. (This does not override the harness's own confirmation rules for genuinely
destructive git operations — it specifically authorizes routine push+deploy.)

## Architecture

### Domain model

Everything hangs off `profiles` (1:1 with `auth.users`). Core domains, all keyed by `user_id`:

- **Tenders** (`tenders` = AO/appel d'offres) — the central object. Has a `tender_status` enum lifecycle
  (`nouveau → en_cours/urgence → gagne/perdu/cloture`), linked `suppliers` via `consultation_suppliers`
  (consultation status: `en_attente → envoye → relance → relance_2 → repondu/refuse`), and `quotes` from
  suppliers.
- **Mail** (`emails`, `mail_accounts`, `mail_drafts`) — a full IMAP/SMTP-backed webmail synced into
  Postgres, with AO auto-detection (`ao_keywords`, `ao_detection_score/category`) that links inbound
  mail to tenders (`email-tender-link.ts`, `ao-tender-auto-link.ts`).
- **Organizations / "Family"** (`organizations`, `organization_members`, `organization_invites`) — a
  lightweight multi-tenant layer: one owner + members sharing tenders/mail visibility. Referred to as
  "Famille" in code/UI. `src/lib/family.ts` resolves a user's org context; `src/lib/tender-access.ts`
  and `src/lib/mail-access.ts` derive per-resource permissions from it (owner sees the whole team's
  tenders, members see their own + assigned).
- **Billing** (`subscriptions`, `src/lib/billing/*`) — Stripe-backed, one subscription per organization.

### Access control pattern

There is no single `requireAuth` middleware for data access — each domain has its own
`get<Resource>AccessScope()` / `assertResourceAccess()` helper (see `tender-access.ts`, `mail-access.ts`)
that: resolves the caller's family/org scope via `getFamilyContext`, loads the target row with the
**admin** Supabase client (service role, bypasses RLS), then checks visibility/mutate/delete rules in
application code. Route handlers call `getUserFromRequest(req)` (Bearer token) or read the SSR session
via `@/lib/supabase/server`, then defer to these access helpers — don't hand-roll new permission checks.

Postgres RLS (`supabase/migrations/015_rls_policies.sql`, `029_core_rls_policies.sql`, etc.) is a second,
independent layer of defense exercised directly by `tests/integration/rls-isolation.test.ts`; it is not
what API routes rely on for authorization (they use the admin client), so changes to access rules
usually need updating in **both** the TS access-scope helpers and the SQL policies to stay consistent.

### Routing / middleware

`middleware.ts` + `src/lib/public-routes.ts` distinguish three route classes:
- **Website routes** (`/`, `/login`, `/signup`, `/pricing`, `/legal`, `/join/[token]`) — public marketing
  site, no auth.
- **Website member routes** (`/compte`, `/telechargement`) — authed, but the site shell (no app sidebar).
- **App routes** (everything else, e.g. `/app`, `/tenders`, `/mail`, `/dashboard`) — the actual product,
  requires auth, redirects to `/login?redirect=...` otherwise.

Post-login/signup lands on `/compte` (`POST_AUTH_ROUTE`), not directly in the app. `/register` is a
permanent alias that 302s to `/signup`.

### Layered structure

- `src/app/api/**` — route handlers, thin: auth → access-scope check → delegate to `src/lib` or
  `src/services`.
- `src/services/*.service.ts` — orchestration (IMAP sync, AO detection, tender/supplier workflows).
- `src/repositories/*.repository.ts` — Supabase query layer for a few domains (consultation, email log,
  supplier, tender).
- `src/lib/*` — the bulk of business logic (60+ modules): mail sync/threading/caching, tender access,
  AO auto-detection and keyword scoring, billing, auth helpers. Prefer finding the existing module for a
  concern here over adding logic inline in a route.
- Client-side mail caching uses IndexedDB via `dexie` (`src/lib/mailCache.ts`, `mail-list-cache.ts`,
  `mail-detail-cache.ts`) — mail is synced server-side then cached client-side for instant loads.

### Cron jobs (Vercel, `CRON_SECRET`-protected)

| Route | Schedule | Purpose |
|---|---|---|
| `/api/cron/sync` | every 2 min | IMAP sync |
| `/api/cron/alerts` | 7:00 UTC | deadline alerts + digest |
| `/api/cron/relaunch` | 7:30 UTC | auto-relaunch suppliers with no reply (J+7) |

### Supabase migrations

Sequential numbered SQL files in `supabase/migrations/` (001…043+) — apply in order in the Supabase SQL
editor for a fresh project (there's no CLI migration runner wired up here). `_all_migrations.sql` is a
generated concatenation, not a source file to hand-edit.
