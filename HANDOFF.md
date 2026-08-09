# JMS — Handoff Notes (as of 2026-08-10)

This is a status snapshot for whoever (human or Claude session) picks this up next. It covers what exists, what changed recently, what's deployed where, and what's still open. Read this before touching anything — there's a live production system and a git history subtlety (see §5) that matters.

## 1. What this is

A jewellery manufacturing & costing ERP (JMS) for a family jewellery business. Core workflow: **Product (design) → Estimate (rough/final costing) → Order → Job Card (production, staged) → Material Issue/Return → Wastage Reconciliation → Assembly → QC → Delivery**, with parallel Karigar (job worker) and Customer ledgers throughout.

The client's original spec was a 60-section "build a full ERP" prompt plus an HTML mockup (`docs/reference/chowker-erp-mockup-v2.html`) showing a dense, SAP/Linear-style enterprise UI. That mockup is the north star for visual direction — see `docs/reference/` for the source files.

## 2. Stack & repo layout

Monorepo (npm workspaces):
- `apps/api` — Express + TypeScript + Prisma + PostgreSQL. Run via `tsx` directly from source in both dev and prod (no build step in the deploy path — see §6).
- `apps/web` — Next.js 16 (App Router, Turbopack) + Tailwind v4 + SWR. No component library — hand-rolled `console-*` utility classes in `globals.css` implementing the mockup's dense enterprise look.
- `packages/shared` — pure calculation functions (`fineWeight`, `computeWastage`, `deriveRate`, etc.) used by both API and web so client-side previews and server-side authoritative calcs never drift. **Untouched this whole session** — no changes needed here.

Auth: JWT access + refresh token, role-based (`SUPER_ADMIN, MANAGER, COSTING, STORE, PRODUCTION, SALES, KARIGAR, AUDITOR`). Seeded users all use password `Password@123` (e.g. `admin@jms.local`, `manager@jms.local`).

## 3. What's built — backend modules

All mounted in `apps/api/src/app.ts`. Pre-existing modules (auth, masters, products, job-cards, materials, labour, estimates, dashboard, audit-logs, users, settings, ledger/stock, ledger/customers, reports) were already solid going in. **New this session:**

| Module | Route prefix | What it does |
|---|---|---|
| Orders | `/api/orders` | Created explicitly via `POST /api/estimates/:id/convert-to-order` from an approved Final Costing. Drives status pipeline `CONFIRMED → ... → DELIVERED`. Payments post through the customer ledger (`POST /:id/payments`), never a raw balance edit. |
| Assembly | `/api/assembly` | Multi-component orders — `POST /` auto-enrolls all JobCards linked to an order as components; marking the last component `COMPLETE` auto-flips Assembly → `ASSEMBLED` and Order → `QC`. |
| QC | `/api/qc` | Checklist-driven inspection tied to an Order. `PASS`/`APPROVED` auto-advances Order → `READY`. `FAIL`/`REWORK_REQUIRED` notifies managers. |
| Stones | `/api/stones` | Unit-level traceable stones (own `Stone`/`StoneMovement` models, separate from the `StoneType` rate master). Full lifecycle: purchase → issue → return/set, with movement history. Codes like `DIA-000001`, `POL-000001`, `CS-000001`. |
| Notifications | `/api/notifications` | Targeted (`userId`) or broadcast (`role`) notifications. Broadcast read-state is tracked via a separate `NotificationRead` join table (see §7 — this was a real bug, now fixed). Currently triggered by: wastage exceptions raised, QC fail/rework. |
| Global Search | `/api/search` | Backs the ⌘K command palette — one call, ~5 results each across customers/orders/estimates/job-cards/karigars/products. |
| Reconciliation | `GET /api/materials/reconciliation` | Cross-job board deriving issued/returned/consumed/expected/difference from `WastageRecord` + `MaterialIssue`. No new schema — computed from existing data. |
| Material vouchers | `GET /api/materials/issues` / `/receipts` (no `jobStageId`) | Extended existing endpoints to support a paginated "list all" mode for voucher-list screens, alongside their original per-stage-array behavior. |

Schema additions (6 migrations added this session, all applied to both local dev and production):
- `Order`, `Assembly`/`AssemblyComponent`, `QCInspection`, `Stone`/`StoneMovement`, `Notification`/`NotificationRead` — all new models.
- `JobCard.orderId` — optional FK, links a job card's components to an order.
- **`Estimate.customerId`** (nullable, own relation to `Customer`) — see §5, this is the most important schema change and came from a merge with a parallel branch, not from me.
- **`MaterialReceipt.fillerWeightG` / `fillerNote` / `pieceWeightIsFine`** — also from that merge; nets out non-gold filler (wax/solder) before applying the purity factor when crediting a karigar's return.

## 4. What's built — frontend

Full visual redesign of every existing page to the mockup's dense console theme (`apps/web/src/app/globals.css` — tokens: `--color-canvas/panel/line/ink/ink2/mute/accent`, status colors `ok/warn/err/info/neu`, plus `console-*` component classes: `console-panel`, `console-table`, `console-btn`, `console-field`, `console-pill`, `console-sumrow`, `console-kanban`, `console-flowbar`). New shell: `Sidebar.tsx` (grouped nav), `Topbar.tsx` (search trigger + notification bell with real unread badge), `CommandPalette.tsx` (⌘K), `Drawer.tsx` (reusable slide-out quick-view, currently wired into the Orders list as the reference implementation — not yet on other list pages).

Pages, all under `apps/web/src/app/(app)/`:

```
dashboard, costing (+ new, + [estimateId]), job-cards (+ new, + [id]),
karigars (+ [id]), materials, material-vouchers, reconciliation,
stone-ledger (+ [id]), products (+ new, + [id]), visual-search,
ledger, orders (+ [id]), assembly, qc, reports (+ 4 sub-reports),
settings, users, audit-log, customers/[id]
```

Notably **not** touched: `login/page.tsx` (still old warm-gold theme), the `input-lg`/`btn-lg` shop-floor primitives in the Job Card material-receipt form (deliberately kept large-tap-target for dusty/gloved hands on the workshop floor — see the comment in `job-cards/[id]/page.tsx`).

## 5. IMPORTANT — the Aadil branch situation

Partway through this session, a **second, independent full-stack rewrite** landed on `origin/main` (commit `ac5c6aa`, authored via the `samar172` GitHub account but built by "Aadil" — a co-founder/collaborator). It included:
- A completely different **shadcn/ui-based frontend redesign** (component library, dark mode, tanstack table, react-hook-form, sonner toasts) — **NOT adopted**. Decision was made to keep this session's console-theme frontend instead.
- **Backend improvements that WERE adopted**: `Estimate.customerId` (the fix for "why does every estimate show the same customer" — see below) and `MaterialReceipt` filler-weight fields. These were manually merged in (not git-merged — the two frontends conflict too heavily for that; backend files were merged by hand, endpoint by endpoint).

**Net effect**: `origin/main` on GitHub currently has Aadil's shadcn frontend + his backend changes, but is **missing** all of this session's new backend modules (Orders/Assembly/QC/Stones/Notifications/Search) and the console-theme frontend. The actual working code (this session's frontend + merged backend) exists **only in this local working tree, uncommitted** (`git status` shows ~57 changed/new files) and has **not been pushed**.

**Before doing anything else, whoever picks this up needs to decide with the user**: commit and push this local state (which would need to force-reconcile with `origin/main` somehow — a straight push will be rejected since main has diverged), or some other resolution. Do not attempt to auto-merge the two frontends — they're architecturally incompatible (same files, different component systems). This is a decision for the user, not something to guess at.

## 6. Deployment

**Backend** — Azure VM, SSH alias `saangri` (already configured in `~/.ssh/config` on this machine), path `/opt/apps/jms`. Runs via PM2 (`pm2 show jms-api`) executing `tsx` directly against `apps/api/src/server.ts` — **no build/dist step in the deploy path**, so a `git`-less rsync of `src/` + `prisma/` is sufficient. Public URL: `https://jms-api.98.70.37.83.nip.io` (nginx + Let's Encrypt via nip.io, proxies to internal port 4002). Production DB is local Postgres on the same VM (not a separate managed instance).

Deploy process used this session (repeat this pattern for future backend deploys):
```bash
# 1. Dry-run preview — confirm exactly what would change, no surprises
rsync -avn --delete -e ssh apps/api/src/ saangri:/opt/apps/jms/apps/api/src/
rsync -avn --delete -e ssh apps/api/prisma/ saangri:/opt/apps/jms/apps/api/prisma/

# 2. Backup prod DB first, always
ssh saangri "pg_dump 'postgresql://jms:<pw>@127.0.0.1:5432/jms' -F c -f /opt/apps/jms/backups/jms_pre_deploy_\$(date +%Y%m%d_%H%M%S).dump"

# 3. Sync for real
rsync -av -e ssh apps/api/src/ saangri:/opt/apps/jms/apps/api/src/
rsync -av -e ssh apps/api/prisma/ saangri:/opt/apps/jms/apps/api/prisma/

# 4. Migrate (check status first, deploy is non-interactive/prod-safe)
ssh saangri "cd /opt/apps/jms/apps/api && npx prisma migrate status"
ssh saangri "cd /opt/apps/jms/apps/api && npx prisma migrate deploy"
ssh saangri "cd /opt/apps/jms/apps/api && npx prisma generate"

# 5. Restart + verify
ssh saangri "pm2 restart jms-api && sleep 2 && pm2 show jms-api"
curl https://jms-api.98.70.37.83.nip.io/health
```

**Frontend** — not deployed yet. Target is Vercel (`https://jms-rust.vercel.app`, project already linked — `.vercel/project.json` exists at repo root). Blocked on the user running `vercel login` interactively (browser OAuth, can't be done non-interactively). Once logged in: deploy to **preview** first (plain `vercel`, not `--prod`) so it can be eyeballed before promoting — especially now given the frontend-direction question in §5 is unresolved.

## 7. Known issues / tech debt

- **Fixed 2026-08-10 (client-reported "labour not working" + workflow steps missing)**: the client tested the full Estimate → Production → Final Costing flow and reported labour and "some things" broken. Root causes, both frontend-only (backend was already correct):
  - No UI existed to set a karigar's per-stage labour rate (`KarigarStageRate`). Only the one seeded demo karigar had a rate; any karigar added via "+ Add Karigar" had none, so `PRODUCTION`-role users logging labour got "no master rate found," and typing a rate manually got a 403 (only Manager/Super Admin may override). Fixed by adding a "Stage Rates" panel to `karigars/[id]/page.tsx` (Manager/Super Admin only) that PATCHes `/api/masters/karigars/:id` with the full `stageRates` array. Verified end-to-end via API: created a karigar with no rates, confirmed labour-entry failure mode, added a stage rate through the same PATCH the UI now sends, then confirmed a `PRODUCTION` user could log labour with no rate typed and it auto-priced correctly.
  - The client's expected workflow has explicit **Refresh Rates → Pull Labour → Pull Wastage** steps between "Assign Karigar" and "Modify Actual Costing." All three backend endpoints (`POST /api/estimates/:id/refresh-gold-rate`, `/pull-labour`, `/pull-wastage`) already existed and worked, but had zero UI trigger anywhere — looked exactly like "kuch kaam nahi ho raha" at that point in the flow. Fixed by adding three buttons to the action bar in `costing/[estimateId]/page.tsx`, shown when a `FINAL_COSTING` estimate is in `DRAFT` (the only state these endpoints accept).
  - Not yet pushed/deployed — same as the rest of this session's frontend work, see §5.
- **Fixed this session, don't reintroduce**: `apps/api` production build (`npm run build` / `tsc`) was broken on a `@types/pdfmake` vs. installed `pdfmake` version mismatch (types target a newer API than what's installed). Fixed in `pdf.service.ts` by hand-typing the import against the actual installed shape rather than upgrading the package (upgrading would've been riskier pre-deploy). Don't just re-add `import PdfPrinter from "pdfmake"` — it'll break the build again.
- **Fixed this session**: broadcast notification "mark as read" was creating duplicate rows instead of tracking per-user read state (unread count never cleared). Fixed with the `NotificationRead` join table — don't revert `notifications.routes.ts` to a simpler-looking version without checking this.
- **Not fixed, pre-existing, low priority**: nginx sets `X-Forwarded-For` but Express `trust proxy` isn't configured, so `express-rate-limit` logs a validation warning on every rate-limited request (login endpoint). Doesn't crash anything. One-line fix: `app.set("trust proxy", 1)` in `app.ts`.
- **Not fixed, pre-existing**: Azure Vision API (`AZURE_VISION_ENDPOINT`/`AZURE_VISION_KEY`) isn't configured in production `.env`, so visual-search embedding generation fails silently on product image upload. Needs real Azure credentials or a decision to disable that feature path.
- **Local dev only**: this machine runs Node 18 by default; the repo needs Node ≥20 for Next.js 16. Use `nvm use v22.23.1` before running `apps/web` dev/build commands (see `~/.nvm`).
- Local Postgres dev DB (`localhost:5432`) has test/E2E data in it (a "Test"/"E2E Test Necklace" product, `ORD-000001`, etc.) from this session's verification passes. Harmless, but don't be surprised by it.

## 8. Gaps vs. the original mockup/master-prompt (still open)

These exist in the mockup and the client's original spec but have **no backend or frontend yet** — they're genuinely new build work, not styling:
- Design Portfolio taxonomy (style/occasion tags, trend analytics) — `products` module covers the catalogue but not tagging/trends.
- QR codes on any document.
- Finished Products as its own distinct module (currently just `Product.status = FINISHED`).
- Roles/Permissions granular UI beyond the existing 8 fixed roles.
- The Drawer quick-view pattern (`components/Drawer.tsx`) is only wired into the Orders list — not yet on Karigars, Job Cards, Products, etc.
- Karigar-facing mobile PWA (the mockup has a Hindi-first, large-tap-target concept for this — the closest existing analog is the large-tap material-receipt form on the Job Card detail page, but that's still a desktop-browser page, not a mobile app).

## 9. Where to find things

- Mockup + original Excel reference: `docs/reference/`
- This file: `HANDOFF.md` (repo root)
- SSH access to prod: alias `saangri` in local `~/.ssh/config`
- Seeded login: `admin@jms.local` / `Password@123` (also `manager@jms.local`, `costing@jms.local`, etc., same password, different roles)
