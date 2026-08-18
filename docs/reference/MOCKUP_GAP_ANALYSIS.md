# Mockup ↔ App Gap Analysis (exact-match audit)

Reference: `docs/reference/mockup-v3.html` (2905 lines — the client-approved flow).
Goal: wire the app up to match the mockup **exactly** (UI + backend). This doc lists every flow and its status.

**Legend:** ✅ matches · 🟡 exists but differs · ❌ missing (build UI + backend).

## Build progress (fresh-domain approach, additive — app stays runnable)
- ✅ **Phase A** — shared engine (`packages/shared/src/production.ts`): all §10 functions + §2 types. **Verified against spec §4 worked example: 220 → 206.780g.**
- ✅ **Phase B** — schema: added Chowker silver models (BulkStockIssue, ProdJobCard/Stage/Assignment/MaterialIssue/StoneEntry/LabourEntry, ProdActivity/Reversal) + PurityTier.percent, Karigar default rates, Product.designCode. Migrated, no data loss.
- ✅ **Phase C1** — `/api/production` read/create API (settings, item-masters, karigars+ledger balance, bulk-stock, job-cards list/create/detail with full §7 costing). Verified end-to-end.
- ✅ **Phase C2** — stage write flows (assign/issue/reconcile/cast/jadai/finding/stones/labour/approve/close/reopen/hold). Verified end-to-end: full 5-stage run reproduces 220 → 206.780g, labour ₹5554, gross 210.46g, closes.
- ✅ **Phase D1** — Job Cards list + detail (5 stage cards, all action modals, §7 costing summary, activity, reopen), wired to /api/production.
- ✅ **Phase D2** — Karigar Ledger, Settings (purity tiers + rates), Item Master grid, Dashboard — all wired to /api/production (+ config write endpoints). Nav now points at the silver screens; bilingual Hindi labels. **Full `next build` passes on all routes.**
- ✅ **Gap closure (all 8 done):** #1 Edit/Cancel reconcile · #2 Job Card page (image, editable details, delivery target) · #3 multi-row Jadai stones + Fitting findings/items · #4 Material Breakdown override inputs (manual silver value / today's rate) · #5 Karigar "Currently Holding" strip + New/Edit karigar · #6 Item Master detail page · #7 Settings pure-eq calculator · #8 bilingual StatusPill + buttons. Full build passes.
- ⏭️ **Phase E (remaining, optional cutover cleanup)** — retire the now-unused gold API modules + orphaned gold `/karigars/[id]` page; rename Prod*→clean spec names; update seed.ts so a reseed reproduces the Chowker tiers/settings/karigars/bulk-stock. (`/products/new` already removed.)

---

## A. Data model & engine (the foundation — biggest gap)

| Mockup construct | Status | Note |
|---|---|---|
| JobCard → `stages[5]` → `assignments[]` → `{issues[], stones[], labour[]}` nested model | ❌ | App is relational (JobStage/MaterialIssue/MaterialReceipt) — incompatible shape |
| `PurityTier {label, percent 0–100}`, fully editable (add/remove/rename/re-percent) | 🟡 | App has `PurityTier{code, purityFactor 0–1}` — needs percent + full CRUD |
| **BulkStockIssue** (per-karigar running raw-silver float) | ❌ | No concept in app; Casting/Jadai/Fitting draw from it |
| `accumulatedWeight()` — REPLACE(Casting/Meenakari/Setting) / ADD(Jadai/Fitting) | ❌ | App computes fine-gold consumed instead |
| `grossWeight()` = accumulatedWeight + `stonesNetCaratGrams()` (carat×0.2) | ❌ | — |
| `buildLedger()` double-entry in pure-eq grams (Issue Dr / Return Cr / Dust Cr / Wastage Cr) | 🟡 | App ledger is fine-gold credit/debit, no bulk-stock rows |
| `jcTotals()` / `stonesByType()` / costing §7 | ❌ | App costing comes from Estimate |
| `computeLabourAmount(basis, …)` — Wastage%/PerGram/PerStone/Flat | 🟡 | App has labour but not these bases per stage |

---

## B. Stage-by-stage production flow (§3) — the core UX

| Stage | Mockup flow | Status |
|---|---|---|
| **Casting** | `BulkStockModal` (issue float) + **`CastOutputModal`**: returned weight, pieces, wastage% — NO per-job issue, no dust | ❌ build |
| **Meenakari** | `IssueMaterialModal` (weight+purity, defaulted from carried) → **`ReconcileModal`**: pieces + dust + ₹/gram; finished = issued−dust; labour auto = finished×rate | 🟡 rebuild form |
| **Jadai** | **`JadaiOutputModal`**: pieces, kundan weight @24K, flat labour, multi-row Polki/Diamond stones (carat×rate) — bulk stock | ❌ build |
| **Setting** | `IssueMaterialModal` (weight **+ pieces**) → `ReconcileModal`: pieces + dust + flat labour; stones via separate `StoneModal`/`StoneReturnModal` | 🟡 rebuild form |
| **Fitting** | **`FindingOutputModal`**: pieces, silver findings multi-row @24K, flat labour, "other flat items" (₹ + optional carat) — bulk stock | ❌ build |

Supporting modals: `StoneModal` (dropdown presets + custom, pcs/carat/rate → auto amount), `StoneReturnModal` (pcs+carat at original rate), `ReopenModal` (reason+approver, audited), `AddKarigarModal`/`CreateKarigarModal` (with per-stage default rates), `NewJobCardModal`, `ItemMasterModal`.

---

## C. Screens

| Screen | Mockup | Status |
|---|---|---|
| **Dashboard** | KPI tiles (silver held by karigars · labour accrued · net stone value · open job cards) + stage-queue counts + "Needs Attention" (On Hold/Reconciliation) | 🟡 tiles differ |
| **Item Master** grid + **detail page** | catalogue cards; detail = editable fields (category, designCode, targetPurity, estGrossWeight, notes, image) + associated job cards + stats | 🟡 fields differ |
| **Job Cards list** | table: Job No · Item+thumb · Karigar · Due · GW Est · Stage · Status; CSV export | 🟡 columns differ |
| **Job Card page** | stage cards (per-stage flows above) · Reopen History · right col: Product Image, Delivery Target, **Costing Summary + Material Breakdown**, Activity Timeline | 🟡 major rebuild |
| **Karigar Ledger** | summary bar · karigar list (by specialization, default-rate hint) · selected: profile, "Currently Holding" strip, full txn ledger, closing balance · **+ Issue Bulk Stock** | 🟡 rebuild |
| **Settings** | editable purity-tier table (add/remove/rename/re-percent) · base rate · default wastage%/labour per stage · pure-eq calculator | 🟡 extend |

---

## D. Cross-cutting

| Feature | Status |
|---|---|
| Costing Summary §7: labour, stones consumed, silver value @ production rate, **manual override**, **today's rate → today's sale value**, gross weight | ❌ |
| Material Breakdown panel (Net Metal + Stones grouped by type) | ❌ |
| Reopen (Audited) — reason + approver → `reversalLog`, reverts to In Production | ❌ |
| Hold / Resume with reason | 🟡 (app has hold/resume) |
| Bilingual Hindi (stage names, statuses, nav, buttons) via `STAGE_HI`/`STATUS_HI` | 🟡 partial (`hi.ts`) |
| Piece count carried through stages (`pieceCount`) | ❌ |
| Manual silver value / today's silver rate overrides per job card | ❌ |

---

## E. Structural recommendation

The mockup's nested model and the app's relational gold model are **incompatible shapes**. Two ways to reach exact match:

1. **Retrofit** the existing relational schema toward the mockup (map stages/assignments/issues onto JobStage/MaterialIssue, bolt on BulkStockIssue, rewrite reconcile per stage, swap the costing engine). Reuses auth/roles/settings/products/images/visual-search, but fights the existing gold-loss model at every step.
2. **Fresh domain module** — implement the mockup's model cleanly (new tables: `PurityTier`, `BulkStockIssue`, `JobCard`, `Stage`, `Assignment`, `MaterialIssue`, `StoneEntry`, `LabourEntry` per spec §2, plus the pure functions from §10 in `packages/shared`), while keeping the existing auth, users/roles, settings shell, product/Item-Master, images, and visual-search. This matches the spec §11 backend schema directly and avoids fighting the old model.

**Recommendation: option 2** — the spec already gives the exact relational schema (§11) and function list (§10); building it clean is faster and less bug-prone than retrofitting the gold engine, and it's what "exact match" really requires. The gold-loss code (materials/wastage/dust-lot) gets retired in the process.
