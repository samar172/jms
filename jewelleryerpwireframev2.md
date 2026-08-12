# Jewellery ERP — v2 Wireframe (Owner-First, Full Ledger System)

**For:** Aadil — jewellery manufacturing business
**Goal:** Evolve the current Estimate→Final Costing flow into a full owner-facing ERP — the kind an owner opens every morning to see "kya chal raha hai" in one glance, with every ledger a manufacturing jeweller actually needs (gold, stones, karigar, party, cash) — not just a job-tracking tool.

---

## 🔍 Who's using this

Primary user: **the owner** (Aadil) — not a back-office data-entry clerk. He's checking this multiple times a day, often quickly, often to answer one question: *"kitna gold bahar hai, kiske paas hai, kitna paisa aana hai."* Secondary users: an accountant/admin doing entries, and maybe a karigar-facing coordinator. Design has to work for someone who wants the answer in 2 seconds, not someone exploring a menu.

## 🎯 What this version fixes

The current version is **flow-complete** (estimate to invoice) but **owner-incomplete** — there's no single screen that answers "how is my business doing," no ledgers (so gold/stone/cash balances aren't tracked as running accounts, only per-job), and no place to see money owed *to* karigars or *by* customers across all jobs at once. This wireframe adds that layer on top of the existing flow — nothing below gets removed.

---

## 🗺️ Full Screen Map (Sidebar Navigation)

```
┌─────────────────────────┐
│  🏠 Dashboard             │  ← NEW — owner's home screen
│  📋 Estimates             │  (existing)
│  🗂️ Job Cards             │  (existing)
│  📦 Issue Material        │  (existing)
│  ⚖️ Receive & Reconcile   │  (existing)
│  🚚 Dispatch & Invoicing  │  (existing)
│  🧾 Final Costing         │  (existing)
│  ─────────────────────    │
│  📒 LEDGERS                │  ← NEW SECTION
│    • Gold Ledger          │
│    • Stone Ledger         │
│    • Karigar Ledger       │
│    • Party / Customer Ledger │
│    • Cash & Bank Ledger   │
│    • Stock Ledger (existing, upgraded) │
│  ─────────────────────    │
│  📊 Reports                │  ← NEW
│  👤 Karigars               │  ← NEW (master + their live balances)
│  🏷️ Item Master            │  (existing)
│  ⚙️ Settings / Admin       │  ← NEW
└─────────────────────────┘
```

---

## 1. 🏠 Owner Dashboard *(new — this is the most important new screen)*

The first thing Aadil sees on login. One screen, no scrolling on a laptop, everything a number he can act on.

```
┌──────────────────────────────────────────────────────────────────────┐
│  Good morning, Aadil            [Date: 12 Aug 2026]     [+ New Estimate] │
├──────────────────────────────────────────────────────────────────────┤
│  ┌────────────┐ ┌────────────┐ ┌────────────┐ ┌────────────┐         │
│  │ Gold in     │ │ Gold with   │ │ Jobs in     │ │ Overdue      │      │
│  │ Stock        │ │ Karigars    │ │ Production  │ │ Jobs         │      │
│  │ 842.3 g      │ │ 1,204.6 g   │ │ 37           │ │ 5 (red)      │      │
│  └────────────┘ └────────────┘ └────────────┘ └────────────┘         │
│  ┌────────────┐ ┌────────────┐ ┌────────────┐ ┌────────────┐         │
│  │ Receivable   │ │ Payable to  │ │ This Month's │ │ Wastage %    │      │
│  │ (customers)  │ │ Karigars    │ │ Wastage Cost  │ │ vs Est. Avg  │      │
│  │ ₹ 18.4 L      │ │ ₹ 6.1 L      │ │ ₹ 42,300      │ │ +0.8% ▲      │      │
│  └────────────┘ └────────────┘ └────────────┘ └────────────┘         │
├──────────────────────────────────────────────────────────────────────┤
│  Stage-wise Pipeline (click to drill in)                               │
│  Material Issued (8) → Casting (6) → Stone Setting (11) → Polishing (5)│
│  → QC/Hallmark (4) → Ready for Dispatch (3) → Dispatched, Not Invoiced (2)│
├──────────────────────────────────────────────────────────────────────┤
│  ⚠️ Needs Attention                        │  📈 Gold Reconciliation   │
│  • JOB-0562 — 6 days in Stone Setting      │  trend (last 30 days)     │
│  • Over-reconciliation flagged on 2 jobs   │  [ sparkline chart ]      │
│  • 3 invoices pending > 15 days            │  Avg Chizzat: 2.1%        │
└──────────────────────────────────────────────────────────────────────┘
```

**Why this matters for an owner-tool:** every number here is something Aadil currently has to mentally calculate by walking the shop floor or calling someone. This screen replaces that walk.

---

## 2. 📒 Gold Ledger *(new)*

Running account of gold — like a bank passbook but in grams and purity, not rupees.

```
┌──────────────────────────────────────────────────────────────────────┐
│  Gold Ledger                          [Filter: Purity ▾] [Export]      │
├──────────────────────────────────────────────────────────────────────┤
│  Opening Balance (Shop Stock): 780.0 g (22K)                          │
├────────────┬──────────────┬────────┬──────────┬──────────┬───────────┤
│ Date        │ Ref            │ Type    │ In (g)   │ Out (g)   │ Balance   │
├────────────┼──────────────┼────────┼──────────┼──────────┼───────────┤
│ 10 Aug      │ JOB-0562       │ Issued   │ —         │ 45.2      │ 734.8      │
│ 11 Aug      │ JOB-0559       │ Received │ 38.9      │ —         │ 773.7      │
│ 11 Aug      │ JOB-0559       │ Chizzat  │ —         │ 1.1       │ 772.6      │
│ 12 Aug      │ Purchase #442  │ Purchase │ 100.0     │ —         │ 872.6      │
├────────────┴──────────────┴────────┴──────────┴──────────┴───────────┤
│  Closing Balance: 872.6 g   |   With Karigars: 1,204.6 g (separate)   │
└──────────────────────────────────────────────────────────────────────┘
```

- Every material issue / reconciliation event auto-posts here (no manual double-entry).
- Split by purity (22K/18K etc.) via filter.
- "With Karigars" is a linked view → click through to Karigar Ledger for who's holding what.

---

## 3. 📒 Stone Ledger *(new)*

Same passbook idea, per stone type/quality.

```
┌──────────────────────────────────────────────────────────────────────┐
│  Stone Ledger                    [Stone: Diamond ▾] [Quality: VVS ▾]  │
├────────────┬──────────────┬────────┬──────────┬──────────┬───────────┤
│ Date        │ Ref            │ Type    │ In (ct)  │ Out (ct)  │ Balance   │
├────────────┼──────────────┼────────┼──────────┼──────────┼───────────┤
│ 09 Aug      │ JOB-0561       │ Issued   │ —         │ 2.4       │ 61.8       │
│ 12 Aug      │ Purchase #211  │ Purchase │ 10.0      │ —         │ 71.8       │
└────────────┴──────────────┴────────┴──────────┴──────────┴───────────┘
```

---

## 4. 📒 Karigar Ledger *(new — the one owners ask for most)*

Two things owners always want: **gold/stone currently with each karigar**, and **money owed to each karigar** (making charges pending payment). Combined into one screen per karigar, plus a summary list.

```
┌──────────────────────────────────────────────────────────────────────┐
│  Karigars — Summary                                    [+ Add Karigar] │
├────────────┬───────────────┬─────────────┬───────────────┬───────────┤
│ Name         │ Gold Held (g)  │ Stones Held  │ Jobs Active    │ Amount Due │
├────────────┼───────────────┼─────────────┼───────────────┼───────────┤
│ Suresh Sonar │ 312.4           │ —            │ 4               │ ₹ 1,20,000 │
│ Ramesh K.    │ 88.2            │ 12.6 ct       │ 2               │ ₹ 45,000   │
└────────────┴───────────────┴─────────────┴───────────────┴───────────┘
      ↓ click a karigar
┌──────────────────────────────────────────────────────────────────────┐
│  Suresh Sonar — Ledger                          [Record Payment]        │
│  Gold currently held: 312.4 g across 4 jobs                            │
│  Stage-wise: Casting (2 jobs) · Stone Setting (2 jobs)                 │
├────────────┬──────────────┬────────┬──────────┬──────────┬───────────┤
│ Date        │ Job            │ Type    │ Gold (g)  │ Making ₹  │ Status     │
├────────────┼──────────────┼────────┼──────────┼──────────┼───────────┤
│ 10 Aug      │ JOB-0562       │ Issued   │ 45.2      │ —         │ In Progress │
│ 08 Aug      │ JOB-0550       │ Returned │ -30.1     │ 8,000     │ Payment Due │
└────────────┴──────────────┴────────┴──────────┴──────────┴───────────┘
```

---

## 5. 📒 Party / Customer Ledger *(new)*

Who owes money, and full order history per customer.

```
┌──────────────────────────────────────────────────────────────────────┐
│  Party Ledger — Search customer…                                       │
├────────────┬───────────────┬─────────────┬───────────────┬───────────┤
│ Customer     │ Total Orders   │ Outstanding  │ Last Order      │ Action     │
├────────────┼───────────────┼─────────────┼───────────────┼───────────┤
│ Aadil (test) │ 3               │ ₹ 84,200      │ 12 Aug 2026     │ [View]      │
│ Meena Traders│ 12              │ ₹ 0            │ 02 Aug 2026     │ [View]      │
└────────────┴───────────────┴─────────────┴───────────────┴───────────┘
      ↓ click a customer
┌──────────────────────────────────────────────────────────────────────┐
│  Meena Traders — Statement                       [Send Reminder]        │
│  Invoice history, payments received, running balance — passbook style   │
└──────────────────────────────────────────────────────────────────────┘
```

---

## 6. 📒 Cash & Bank Ledger *(new)*

Simple in/out register tied to invoices and karigar payments — not full accounting software, just enough for an owner to see cash position.

```
┌──────────────────────────────────────────────────────────────────────┐
│  Cash & Bank Ledger              [Account: Cash ▾ / Bank ▾]  [+ Entry] │
├────────────┬──────────────────────┬──────────┬──────────┬────────────┤
│ Date        │ Description            │ In (₹)    │ Out (₹)   │ Balance     │
├────────────┼──────────────────────┼──────────┼──────────┼────────────┤
│ 12 Aug      │ Invoice INV-0562 paid   │ 84,200    │ —          │ 3,42,000    │
│ 11 Aug      │ Suresh Sonar — making    │ —          │ 8,000      │ 2,57,800    │
└────────────┴──────────────────────┴──────────┴──────────┴────────────┘
```

---

## 7. 📦 Stock Ledger *(existing — upgraded view)*

Already exists internally; now gets its own full screen (not just a background table) showing gold + stones + finished/semi-finished item stock in one tabbed view, feeding the Dashboard cards above.

---

## 8. 📊 Reports *(new)*

One screen, pick a report, see it — no separate report-builder complexity.

```
┌──────────────────────────────────────────────────────────────────────┐
│  Reports                                                                │
│  [ Gold Reconciliation Summary ]  [ Karigar-wise Wastage % ]           │
│  [ Estimate vs Actual Variance ]  [ Dispatch Turnaround Time ]         │
│  [ Outstanding Receivables ]      [ Karigar Payables ]                 │
│  [ Job Aging (days per stage) ]   [ Monthly Sales & Margin ]           │
└──────────────────────────────────────────────────────────────────────┘
```

Each opens a filtered table + one chart — date range, karigar, party, item type as common filters across all reports.

---

## 9. 👤 Karigars *(new — master list, separate from the ledger drill-down)*

Master data: name, phone, specialization (casting/setting/polishing), rate card for making charges, active/inactive. Feeds into the Karigar Ledger and the job-card assignment dropdown.

---

## 10. ⚙️ Settings / Admin *(new)*

```
┌──────────────────────────────────────────────────────────────────────┐
│  Settings                                                               │
│  • Users & Roles (Owner / Admin / Accountant / Karigar-coordinator)    │
│  • Gold Purity Rates (daily rate entry — drives estimate pricing)       │
│  • GST / Tax Settings                                                   │
│  • Dispatch Modes (edit the dropdown list)                              │
│  • Backup / Export All Data                                             │
└──────────────────────────────────────────────────────────────────────┘
```

---

## 🧩 How this connects to what already exists

Nothing in the current flow changes — Estimate → Job Card → Material Issue → Reconcile → Dispatch → Invoice → Final Costing stays exactly as is. The new layer just makes every one of those actions **also post an entry to the relevant ledger automatically**:

- Issue Material → posts to Gold Ledger + Stone Ledger + Karigar Ledger (out)
- Receive & Reconcile → posts to Gold Ledger + Karigar Ledger (in) + records Chizzat
- Create Invoice → posts to Party Ledger (receivable) + feeds Dashboard
- Record payment (new small action on Party/Karigar Ledger) → posts to Cash & Bank Ledger

So the owner never enters data twice — the ledgers are a *view* on top of the same actions, not a separate data-entry job.

---

## ✨ UX principles applied (why it's built this way)

- **Dashboard first, not a menu first** — owner opens the app to answers, not options.
- **Passbook-style ledgers** — familiar to anyone who's used a bank passbook or a bahi khata; no accounting jargon.
- **No double entry** — ledgers auto-populate from actions already being done (issue, reconcile, dispatch, invoice).
- **Drill-down, not drill-around** — every summary number is clickable straight into its detail (Gold in Stock → Gold Ledger; a karigar's row → their full ledger).
- **Red flags surfaced, not buried** — overdue jobs, over-reconciliation, pending payments shown on the dashboard, not something you have to go looking for.

---

## 🚀 Suggested build order

1. Owner Dashboard (highest visible value, mostly aggregates data that already exists in `jobs`/`invoices`)
2. Gold Ledger + Karigar Ledger (auto-post from existing Issue/Reconcile actions — no new data entry needed)
3. Party Ledger (auto-post from existing Invoice creation)
4. Cash & Bank Ledger (small new "Record Payment" action, then auto-post)
5. Stone Ledger + Stock Ledger upgrade
6. Reports screen
7. Settings/Admin + Roles

This order front-loads the screens that need zero new data entry (they just visualize data already flowing through the app), so Aadil sees the "top software" feel fastest.
