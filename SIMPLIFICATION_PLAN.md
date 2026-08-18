# Chowker JMS — Simplification Plan (V3)

**Branch:** `new`
**Decision:** Simplify **in place** (no new directory / no rewrite). Git branch is our "separate copy."
**Goal:** Roll the app back from a full **gold ERP** to the **silver costing core** described in the source-of-truth spec and the client-approved `Jewellery_Manufacturing_ERP_Mock (3).html`.
**Client mandate:** "Too complicated, don't need some features." Confirmed cuts: **Invoicing / Sales / Customer / Orders** and **Gold / multi-metal**.

> Nothing is deleted until this doc is signed off. Items marked **CONFIRM** are my proposals, not yet approved.

---

## 1. Why it feels complicated (the root cause)

The build drifted far past the spec. The spec + Mock (3) describe **6 screens** of silver costing. What exists is **~23 screens / ~40 DB models** of gold-jewellery ERP: orders, customers, vendors, invoicing, cash/bank ledgers, assembly, QC, dust-lots, wastage exceptions, multi-line estimates with GST.

Two structural facts drive the whole plan:

1. **The data model is gold-native.** `GoldRate`, `Karat`, `PERCENT_GOLD_MAKING`, "18K/22K/24K Gold Weight" costing bases, `MaterialReceipt.goldScrapWeightG` / `chizzatWeightG` / `dustLotId`. The spec wants **configurable silver purity tiers** (24K=100%, 22K=92.5%, 18K=76%, 14K=59%) off one base ₹/gram rate.
2. **The spec's core already exists underneath** and is worth keeping: `Product` (Item Master), `JobCard`, `JobStage`, `MaterialIssue`, `MaterialReceipt`, `Karigar`, `KarigarLedgerEntry`, `Karat`/purity, `AppSetting`.

So this is a **rollback to the spec core**, not a light trim and not a from-scratch rebuild.

---

## 2. Screen map (`apps/web/src/app/(app)/`)

### KEEP (in Mock (3) + your explicit keeps)
| Screen | Route | Spec role |
|---|---|---|
| Dashboard | `/dashboard` | KPI tiles + queues (§8) |
| Item Master | `/products` | Product catalogue (§2.3) |
| Job Cards | `/job-cards` | The costing core (§2.4, §8) |
| Karigars + Karigar Ledger | `/karigars` | Artisan master + silver ledger (§2.2, §6) |
| Settings | `/settings` | Purity tiers, base rate, defaults (§8) |
| Users & Roles | `/users` | Kept per your instruction |
| Visual Search | `/visual-search` | Kept per your instruction |

### CUT — client-confirmed (invoicing/sales/customer/orders + gold)
| Screen | Route | Reason |
|---|---|---|
| Estimates | `/costing` | Quotation/sales — spec is costing-only, inside the job card |
| Final Costing | `/costing/final` | Costing summary lives on the job card page (§7) |
| Dispatch & Invoicing | `/invoices` | Invoicing — out |
| Party / Customer Ledger | `/ledger` | Customer concept — out |
| Cash & Bank Ledger | `/cash-bank-ledger` | Financial/AR — out |
| Gold Ledger | `/materials` | Metal-trading stock ledger — silver tracked per-karigar instead |

### FOLD INTO JOB CARD (delete as standalone nav; keep the action inside the stage card)
Per spec §8.1, these are **actions within a job-card stage**, never top-level screens:
| Screen | Route | Becomes |
|---|---|---|
| Issue Material | `/material-vouchers` | "+ Issue Material" button on Meenakari/Setting stage cards |
| Receive & Reconcile | `/reconciliation` | "Receive & Reconcile" button on the same stage cards |
| Production Tracking | `/tracking` | The stage cards on the job-card page already show status |

### CONFIRM — not in Mock (3), client didn't name them (proposed: CUT unless you say keep)
| Screen | Route | Note |
|---|---|---|
| Stone Ledger | `/stone-ledger` | Spec tracks stones **inside** job cards, grouped by type in costing (§7) — no standalone ledger |
| Reports | `/reports` | Not in mock |
| Audit Log (global) | `/audit-log` | Spec has per-job-card activity + reversal logs; this is an extra global admin view |
| QC / Assembly | `/qc`, `/assembly` | Beyond the 5-stage karigar route (Casting→Meenakari→Jadai→Setting→Fitting) |

---

## 3. API module map (`apps/api/src/modules/`) — updated after Phase-2 usage tracing

- **KEEP:** `auth`, `users`, `dashboard`, `products`, `masters` (karigar ledger lives here at `/api/masters/karigars`), `jobcards`, `labour`, `settings`, `search`, `notifications`
- **KEEP — reclassified from "cut" once real callers were traced:**
  - `materials` — **core**, backs the job-card Issue/Reconcile actions (`/api/materials/issues|receipts|dust-lots|wastage`, called by `JobStageCard`). Gold→silver rename + dust-lot/wastage-exception simplification happens in Phase 3/4, but the module stays.
  - `audit` — **core**, backs the job-card Activity Timeline (`ActivityTimeline` → `/api/audit-logs`). Only the standalone Audit-Log *screen* was cut.
  - `estimates` — deferred to Phase 4: `jobcards` create requires an `estimateId` and approval spins up a "Final Costing" estimate. Deleting it means reworking the jobcards create/approve flow (the risky work), so it goes last.
- **CUT (done, Phase 2):** `orders` (+invoice.service), `dispatch`, `reports`, `assembly`, `qc`, `stones` (standalone), the whole `ledger/` folder (stock, customer, cash-bank), and `masters/customersVendorsCharges` (customers/vendors/charge-types). Global search trimmed to products/jobCards/karigars.
- **Rework, don't delete (Phase 4):** `jobcards` + `MaterialReceipt` logic — strip gold-specific reconcile fields (chizzat, dustLot, goldScrap, approvedLoss, wax/wire) down to the spec's **dust + piece count + labour**.

---

## 4. Data model changes (`apps/api/prisma/schema.prisma`, 1180 lines → target ~500)

### 4a. Gold → Silver rename (you approved: rename now)
| Now | Becomes | Notes |
|---|---|---|
| `GoldRate.ratePerGram24k` | `MetalRate.ratePerGramPure` | One base rate for the 100% tier |
| `Karat` (`code`, `purityFactor`) | `PurityTier` (`label`, `percent`) | Model is already generic; rename + make tiers fully editable (§2.1). Exactly one tier at 100%. |
| `MaterialType.GOLD` | `MaterialType.SILVER` | Enum value |
| `EstimateLineHead.GOLD` | *(removed with Estimates)* | — |
| `PERCENT_GOLD_MAKING`, `PERCENT_GOLD_STONE` | *(removed with LabourRule gold bases)* | Spec labour is per-gram / flat, not gold-% |
| `MaterialReceipt.goldScrapWeightG`, `dustLotId`, `chizzat*`, `approvedLoss*`, `waxWire*`, `nonGoldInPiece*`, `pieceWeightIsFine`, `overAccounted` | *(dropped)* | Spec reconcile = `dustWeight` + `pieceCount` + labour; finished weight = `issued − dust` (§3.2/§3.4) |

### 4b. Models to DROP (with their routes/modules)
`Customer`, `Vendor`, `Order`, `Estimate`, `EstimateLine`, `Assembly`, `AssemblyComponent`, `QCInspection`, `CashBankLedgerEntry`, `CustomerLedgerEntry`, `StockLedgerEntry`, `DustLot`, `WastageRecord` (fold wastage into Casting per §4.1), `ChargeType`, `CostingEditLog`, `GoldRate` (replaced), plus enums for the above.
Remove the now-dangling FKs on `JobCard` (`customerId`, `estimateId`, `orderId`, `dispatch*`).

### 4c. Bulk-stock model (spec §2.10, §6) — verify/add
Spec requires a per-karigar running silver float (`BulkStockIssue`) for Casting/Jadai/Fitting, seeded before output. Confirm the current schema expresses this (via `KarigarLedgerEntry`) or add a `BulkStockIssue` model.

### 4d. Migration
Rename is destructive on a live DB. Since this is pre-production (mockup-stage data), plan is: **one squashed migration** that renames `Karat`→`PurityTier`, `GoldRate`→`MetalRate`, drops cut models, and reseeds default silver tiers. Confirm there's no production data to preserve.

---

## 5. Shared package (`packages/shared/src/`)
- `types.ts` (39 lines), `calculations.ts` (160), `roles.ts` (19) — rename gold types, strip estimate/GST/order types, and make sure `calculations.ts` matches spec §4 (weight accumulation: REPLACE vs ADD stages) and §4.1 (wastage valued at the 100% tier). **This file is the highest-risk item** — it's where the spec's documented float/purity bugs live or die.

---

## 6. Frontend cleanup
- `Sidebar.tsx`: collapse from 5 nav groups to the spec's structure — **Overview / Production / Ledgers / Configuration** (§8). Drop Workflow's Estimates/Tracking/Invoicing rows.
- Delete components tied to cut features: `AddCustomerForm.tsx`, `EstimateLines.tsx`, and estimate/invoice-specific bits of `ProductionPanel.tsx` / `JobStageCard.tsx`.
- Keep bilingual Hindi (`lib/hi.ts`) — you're keeping it.

---

## 7. Execution phases (each phase = its own commit, app stays runnable)

1. **Phase 0 — Safety:** tag current state (`git tag pre-simplify-v3`), branch already `new`. ✅ **DONE** (tag `pre-simplify-v3`).
2. **Phase 1 — Nav + routes (visible win):** remove CUT + FOLD screens from `Sidebar.tsx`, delete their `app/(app)/…` route folders. App instantly looks like Mock (3). ✅ **DONE** (commit `d995f12`) — nav → 4 groups; 28 route files deleted; dashboard cut-feature tiles removed; CommandPalette + dead links neutralized; tsc clean. (The 2 `Date.now` lint errors + `useAuth` warning in `job-cards` are pre-existing, not from this phase.)
3. **Phase 2 — API modules:** delete CUT modules + their route registrations; fix imports. ✅ **DONE** (commit `0c04b96`) — deleted orders/dispatch/reports/assembly/qc/stones/ledger + customersVendorsCharges; trimmed global search; removed Customer field from Item Master pages + orphaned components/hooks. **Reclassified materials/audit/estimates as KEEP** (see §3). Both apps typecheck clean.
4. **Phase 3 — Schema rename + drops** — split into 3a (safe rename) and 3b (model drops, must follow Phase 4 jobcards rework):
   - **3a — gold→silver rename:** ✅ **DONE** (commit `33504ae`, migration `silver_terminology_rename`, clean reseed). Karat→PurityTier (kept `code`+`purityFactor` 0–1), GoldRate→MetalRate (`ratePerGram24k`→`ratePerGramPure`), MaterialType.GOLD→SILVER, `/gold-rates`→`/metal-rates`. calculations.ts untouched (per sign-off). Protected for Phase 4: `EstimateLineHead.GOLD`, `MaterialReceipt.gold*WeightG`, `goldRateSnapshot24k`. Both apps typecheck clean.
   - **3b — drop cut models** (`Customer`, `Vendor`, `Order`, `Estimate`, `EstimateLine`, `Assembly`, `QCInspection`, `CashBankLedgerEntry`, `CustomerLedgerEntry`, `StockLedgerEntry`, `DustLot`, `WastageRecord`, `ChargeType`, `CostingEditLog`, + enums): **blocked on Phase 4** — `jobcards` + `MaterialReceipt` still reference `Estimate`/`Order`/`Customer`/gold reconcile fields until the create/approve/reconcile flow is reworked. Do 3b together with / right after Phase 4.
5. **Phase 4** — split into 4a (done) and 4b (large, pending a decision):
   - **4a — decouple job cards from Estimate/Order/Dispatch, create from Item Master:** ✅ **DONE** (commit `ad160ae`). Backend create takes `productId`; Final-Costing-estimate block + record-dispatch endpoint removed; Item Master detail gains "+ Create Job Card" and a Job Cards list (replacing the dead estimate panel).
   - **4b — reconcile-model rewrite (NOT a field-strip):** ⚠️ the build implements a *different costing paradigm* than the spec — gold-loss accounting (chizzat, wastage-exceptions, dust-lots, gold-scrap, stock-ledger, over-reconciliation), ~180 refs across 13 files (materials.routes 768L, JobStageCard 917L, wastage.service 239L, dashboard). The spec wants the mockup's model: `finishedWeight = issued − dust`, weight-accumulation REPLACE(Casting/Meenakari/Setting)/ADD(Jadai/Fitting), reconcile = dust + pieces + labour, no chizzat/exceptions. This is a ground-up re-implementation of the costing engine (mockup HTML = reference impl; spec §10 = function list). Highest risk (financial ledger), needs real end-to-end verification. **Awaiting a decision on approach (full rewrite vs. UI-only simplification).**
6. **Phase 5 — Verify:** re-run the hand-computed worked example from spec §4 (Casting 220 → … → final 206.780g) against the app — **mandatory, do not skip** (guards the REPLACE-vs-ADD weight-accumulation logic). Update `TESTING.md`.

---

## 8. Open questions — RESOLVED (client sign-off)
1. **CONFIRM screens** (§2): ✅ **Cut all** — Stone Ledger, Reports, Audit Log (global), QC/Assembly. Stone tracking stays inside the job card (`stonesByType()`); per-job activity/reversal log covers audit; production route is the fixed 5 stages (Fitting = final/assembly).
2. **Production data:** ✅ **Clean reseed** — mockup/spec stage, no real DB data to preserve (spec §12). Destructive rename migration is fine.
3. **Vendors/purchasing:** ✅ **Fully out** — same bucket as Invoicing/Sales/Customer/Orders.
4. **Phasing:** ✅ **Phase 1 first** — quick visible win + defers the risky `calculations.ts`/reconcile rework to last (Phases 4–5).

---

## 9. Risks
- **`calculations.ts` / reconcile rework** is the one place a bug hurts — it's the client-verified costing engine. Change it last, test against the spec's worked example.
- Schema rename touches many files; do it as one mechanical pass with `prisma migrate` + a full typecheck.
- Cutting `estimateId`/`orderId`/`customerId` off `JobCard` may reveal code paths that assumed a customer — expect a round of compile-error fixing in `jobcards`.
