# Jewellery Manufacturing ERP — Mockup Documentation

**File:** `jewellery-erp-mockup.html` (single-file HTML/CSS/JS app, no backend, runs in any browser)
**Prepared for:** Aadil
**Last updated:** 12 Aug 2026

---

## 1. What this is

A working, click-through mockup of a jewellery manufacturing ERP — built to map how an order should move from **Estimate → Job Card → Production → QC → Dispatch → Invoicing → Final Costing**, with gold/stone reconciliation and full audit history along the way. It runs entirely in the browser (Tailwind + vanilla JS) and now **saves everything you enter automatically**, so closing the tab or reloading doesn't lose data.

This doc explains what's built, how the flow connects end to end, and what was fixed in this round (Dispatch + Invoicing + persistence).

---

## 2. End-to-end flow (wireframe)

```
┌──────────────┐     approve      ┌──────────────┐    issue material    ┌──────────────────┐
│   ESTIMATE   │ ───────────────▶ │   JOB CARD   │ ───────────────────▶ │ MATERIAL ISSUED   │
│ (rough cost, │                  │  created from │                      │ (gold/stones out  │
│  gold+stones │                  │   estimate)   │                      │  to karigar)      │
│  + making)   │                  └──────────────┘                      └─────────┬─────────┘
└──────────────┘                                                                  │
                                                                                   ▼
                                                                        ┌────────────────────┐
                                                                        │      CASTING        │
                                                                        └─────────┬──────────┘
                                                                                   ▼
                                                                        ┌────────────────────┐
                                                                        │   STONE SETTING      │
                                                                        └─────────┬──────────┘
                                                                                   ▼
                                                                        ┌────────────────────┐
                                                                        │     POLISHING        │
                                                                        └─────────┬──────────┘
                                                                                   ▼
                                                        ┌───────────────────────────────────────┐
                                                        │   QC & HALLMARK + RECEIVE & RECONCILE   │
                                                        │  (Actual Gold in Finished, Gold Dust,   │
                                                        │   Unused Gold, Chizzat/wastage = plug)  │
                                                        └─────────────────┬───────────────────────┘
                                                                          ▼
                                                              ┌────────────────────┐
                                                              │  READY FOR DISPATCH  │
                                                              └─────────┬──────────┘
                                                                        │  click "Approve Stage"
                                                                        ▼
                                                        ┌───────────────────────────────────────┐
                                                        │        RECORD DISPATCH (new popup)      │
                                                        │  • Dispatch Mode (courier/hand/pickup)  │
                                                        │  • Tracking No.                         │
                                                        │  • Dispatch Date                        │
                                                        └─────────────────┬───────────────────────┘
                                                                          ▼
                                                              ┌────────────────────┐
                                                              │     DISPATCHED       │
                                                              └─────────┬──────────┘
                                                                        ▼
                                          ┌──────────────────────────────────────────────────┐
                                          │      DISPATCH & INVOICING (list of dispatched     │
                                          │      but not-yet-invoiced jobs) → Create Invoice   │
                                          └─────────────────────┬──────────────────────────────┘
                                                                 ▼
                                          ┌──────────────────────────────────────────────────┐
                                          │   FINAL COSTING / INVOICE (same layout as the      │
                                          │   Estimate — gold table, stone tables, charges,    │
                                          │   summary) with Estimate vs Actual variance card,  │
                                          │   Admin-only "Edit Everything" + Timeline history   │
                                          └──────────────────────────────────────────────────┘
```

Every box above is a real, clickable screen in the mockup — this isn't just a diagram, it's how the app is wired today.

---

## 3. Modules built

### 3.1 Estimate
- Create a rough estimate: gold (purity, weight), stone groups, making charges, wastage, GST.
- On approval, generates a Job Card automatically (`createJobFromEstimate`).

### 3.2 Job Card & Production Stages
- Stages: **Material Issued → Casting → Stone Setting → Polishing → QC & Hallmark → Ready for Dispatch → Dispatched.**
- "Approve Stage" button moves the job forward one step.
- Karigar (artisan) can be assigned per stage; adding a karigar on a brand-new job card no longer crashes (fixed).

### 3.3 Issue Material to Karigar
- Records gold/stones handed to a karigar for a given stage, deducted from stock ledger.

### 3.4 Receive & Reconcile (Gold Reconciliation)
- Exact formula now enforced:
  - **Actual Gold in Finished = Finished Weight − Wax/Wire/Other**
  - **Chizzat (wastage) = Gold Issued − Actual Gold in Finished − Gold Dust − Unused Gold** (calculated as a plug, not entered manually)
  - Flags **Over-Reconciliation** if the numbers don't add up (i.e., more gold accounted for than was issued).
- Fixed: a pending chizzat/variance could get stuck un-approvable when there was no open material issue left — this now resolves correctly.

### 3.5 Dispatch (fixed this round)
**Problem before:** moving a job to "Dispatched" was a silent stage flip — no record of *how* it was sent, so Dispatch Mode and Tracking stayed blank forever, and Aadil's job couldn't be dispatched from a stale session.

**Now:** clicking "Approve Stage" on a job that's "Ready for Dispatch" opens a **Record Dispatch** popup:
- Dispatch Mode (dropdown — Insured Courier, Hand Delivery, Self Pickup, Registered Post)
- Tracking Number (optional)
- Dispatch Date

Confirming it moves the job to "Dispatched" and stores these details on the job card (visible in Job Details).

### 3.6 Dispatch & Invoicing
- Lists every job that is **Dispatched but not yet invoiced**.
- "Create Invoice" pulls the job's actual costing plus the **real Dispatch Mode/Tracking** captured above (previously hardcoded as "Pending"/"—" — now fixed, this was the "further connection" needed).

### 3.7 Final Costing / Invoice
- Same visual layout as the Estimate (Pure Gold table, stone-group tables, Charges table, Costing Summary) so estimate and final look like the same document — one "rough," one "actual."
- Small **Estimate vs Actual variance card** at the bottom.
- **Admin-only "Edit Everything"** mode — every price/quantity field is editable, and every edit is logged to a **Timeline / Edit History** panel (who/what/old value → new value/when) for audit purposes.
- A job's Final Costing only fully unlocks once the job card is marked **Closed**.

### 3.8 Data Persistence (new — this round)
**Problem before:** the mockup only lived in browser memory. Any reload (including reloading to pick up a bug fix) wiped out everything typed in — job cards, estimates, invoices, reconciliations, item master, stock ledger.

**Now:** every change auto-saves to the browser's local storage after each action. Reloading the page, or opening a newly delivered copy of this same file, restores exactly where you left off.

**Important limitation:** this only protects data **from this version onward**. Data that existed only in an old, un-saved browser tab before this fix could not be recovered retroactively — there was nothing to read it back from.

---

## 4. What changed in this specific round (summary of fixes)

| Area | Before | After |
|---|---|---|
| Dispatch | Silent stage flip, no shipment info captured | "Record Dispatch" popup captures Mode + Tracking + Date |
| Invoicing | Dispatch Mode/Tracking hardcoded "Pending"/"—" | Pulled live from the dispatch record |
| Job Details | No dispatch info shown | Shows Dispatch Mode & Tracking once dispatched |
| Data safety | Lost on every reload | Auto-saved to browser storage after every action |

---

## 5. Known limitations of the mockup (good to flag to any stakeholder)

- No real backend/database — data lives in the browser (localStorage) on the device it was entered on. It won't sync across devices or browsers, and clearing browser data will erase it. This is a **mockup for validating flow and UX**, not a production system.
- Single-user simulation — there's no login/roles beyond an "Admin" edit-mode toggle inside Final Costing.
- Numbers, karigars, and parties are illustrative seed data mixed with whatever you've entered.

---

## 6. Suggested next steps (if this mockup validates the flow)

1. Move from localStorage to a real backend (Postgres/MySQL) with proper multi-user auth and roles (Admin / Karigar / Accounts).
2. Add role-based permissions so only Admin can edit Final Costing, karigars can only update their stage.
3. Add real invoice PDF generation (GST-compliant) from the Final Costing document.
4. Add dashboards: gold reconciliation variance trends, average days-per-stage, karigar-wise wastage %, dispatch turnaround time.
5. Barcode/QR per job card for faster stage scanning on the shop floor.
