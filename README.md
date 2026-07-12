# JMS — Jewellery Manufacturing, Costing & Karigar Management System

A web-based system replacing the client's Excel workbook + register-copy workflow with a single
source of truth for product serial numbers, gold/stone issue-receipt, wastage reconciliation,
karigar labour and payables, and versioned costing — per the BRD (`BRD - Jewellery Manufacturing
Costing & Karigar Management System v1.0.docx`) and the Stitch design brief (`design.md`).

## Stack

- **Frontend:** Next.js 16 (App Router) + TypeScript + Tailwind v4 — `apps/web`
- **Backend:** Node.js + Express + TypeScript + Prisma — `apps/api`
- **Database:** PostgreSQL (local Postgres 18 for dev; `pgvector`-ready for the future visual search phase)
- **Shared:** `packages/shared` — the costing/wastage math (BR-01 to BR-16) and types, used by both
  the API (source of truth) and the web app (live preview), so the two can never disagree.

Node 18 (the default on this machine) can't run Next.js 16 — a `.nvmrc` pins Node 20. Run `nvm use`
in the repo root before any `npm` command.

## Getting started

```bash
nvm use                      # Node 20
npm install                  # installs all three workspaces

# Postgres: create a local database and put its URL in apps/api/.env (see .env.example)
createdb jms
cp apps/api/.env.example apps/api/.env   # then edit DATABASE_URL to your local user

npm run db:migrate           # apps/api: prisma migrate dev
npm run db:seed              # seeds masters + a demo product/job card

npm run dev:api              # http://localhost:4000
npm run dev:web              # http://localhost:3000  (in a second terminal)
```

Demo login (all seeded users share this password): `admin@jms.local` / `Password@123`. Other
seeded roles: `manager@`, `costing@`, `store@`, `production@`, `sales@`, `auditor@jms.local`.

## What's implemented (BRD Sections 8.1–8.8, 8.10–8.13, and 11)

- **Masters** (Module 1): gold rate history, karat/purity factors, stone types, categories &
  subcategories, process stages & tolerances, karigars & stage rates, customers, vendors, charge types.
- **Product & Design Registry** (Module 2): atomic serial number generation (`NK-18K-2607-0042`,
  race-safe under concurrency via a single `INSERT ... ON CONFLICT ... RETURNING`), image upload
  with thumbnailing + EXIF stripping, clone, catalogue filters, full product timeline.
- **Job Cards & Manufacturing Workflow** (Module 3): stage lifecycle, rework loops, close-blocking
  until material is reconciled, wastage exceptions are resolved, and labour is approved (BR-12).
- **Raw Material & Metal Accounting** (Module 4): material issue/receipt vouchers, fine-gold
  conversion, per-karigar metal ledger.
- **Wastage & Dust Reconciliation** (Module 5): the Section 7.2 formula, tolerance comparison,
  exception approval workflow, dust lots + refining recovery.
- **Karigar Labour & Payables** (Module 6): labour entries with rate-basis flexibility, approval,
  advances, live payable ledger.
- **Costing & Estimate Engine** (Module 7): a faithful, generalised reimplementation of the legacy
  workbook's formulas (Section 3.3.2 / Appendix A) — unlimited polki/stone lines, rate snapshotting,
  versioning, approval locking (BR-08). Verified directly against the BRD's own acceptance criteria
  (AC-02, AC-03, AC-05, AC-13) during development.
- **RBAC & Audit** (Module 11): the Section 6.3 role matrix, cost/rate/margin fields stripped from
  API responses (not just hidden client-side) for Store/Production/Sales/Karigar roles (BR-16),
  append-only audit log on every mutating action, account lockout after failed logins.
- **Dashboards**: role-aware KPIs, WIP board, wastage alerts.

## Deliberately deferred (see BRD phasing, Section 16)

- **AI Visual Search (Module 9, Phase 6).** This is a separate embedding/vector-search subsystem
  (self-hosted CLIP/DINOv2 + pgvector) that the BRD itself phases in only once the catalogue has
  enough indexed images (Section 12). The schema already tags images as Sketch/WIP/Final Product so
  this can be added without a data migration.
- **Store-level stock ledger** (FR-4.05–4.08: purchases, physical stock-take, negative-stock guard).
  The karigar metal ledger — the workflow Section 7.2 calls "the financial heart of the system" — is
  fully implemented; the pre-issue store inventory layer is a natural next slice.
- **Server-rendered PDF/Excel exports** (FR-7.13, FR-7.16, FR-3.09, FR-6.05). All the underlying data
  is exposed via API; documents currently render via the browser's print dialog. Swapping in
  a template-based PDF/XLSX generator is straightforward from here.
- **2FA/OTP** (FR-11.06, Should-have) and **WhatsApp/email alert delivery** (FR-13.05).
- Full admin UI for every master (categories, stone types, charge types, users) — the APIs exist;
  `/settings` currently covers gold rates, karats and process stages inline.
- **Object storage** (FR-8.05): images are on local disk for dev (`apps/api/uploads/`, git-ignored).
  Swap `apps/api/src/services/imageStorage.ts` for an S3-backed implementation before deploying —
  the interface is already isolated for that.

## Repo layout

```
apps/api/       Express + Prisma API
  prisma/schema.prisma   the physical data model (Section 10 of the BRD)
  prisma/seed.ts
  src/modules/*          one folder per BRD module
apps/web/       Next.js app (App Router, client components + SWR against the API)
  src/app/(app)/*        one folder per screen in design.md
packages/shared/         calculations.ts is the single source of truth for costing/wastage math
```

## Known follow-ups

- `npm audit` flags a moderate-severity `postcss` advisory bundled *inside* Next.js's own build
  tooling (not a runtime/app dependency) — no fix available yet without downgrading Next itself.
