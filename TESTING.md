# JMS — Manual End-to-End Testing Guide

This walks through the full **Customer → Design → Estimate → Production → Karigar → Final Costing → Approve & Lock** flow on a freshly reset local database, using the actual UI as it exists today (not as originally sketched — see "Corrections" below for where the real app differs from the flow diagram this guide was based on).

## 0. Setup

- Local DB has been reset (`prisma migrate reset`) — only seeded masters exist: 7 users, karats, categories, stone types, process stages, gold rate ₹9,200/g (24K), one karigar (Suresh Kumar / KR-001, has a Polishing rate), one demo product/job card ("Peacock Polki Choker") to keep dashboards non-empty. **Ignore the demo product** — create your own for this test.
- Web app: `http://localhost:3005`
- API: `http://localhost:4000`
- **Log in as `admin@jms.local` / `Password@123`.** This role (SUPER_ADMIN) is a superset of every other role, so you won't hit a permission wall mid-flow. Role-specific notes are called out inline if you want to test access control separately.

## Corrections vs. the originally listed flow

Before you start, five things in the app work differently than the step list implies — read this once so you're not looking for buttons that don't exist:

1. **"Add Diamond" is not a separate step.** Diamond is just a Stone Type inside the **Coloured Stones** section (category = Diamond). There's no dedicated Diamond section — add it the same way you add Ruby/Emerald/etc.
2. **"Add Other Material" = the "Other Charges" section.** There's no separate raw-material head for findings/other materials — it's a lumpsum charges line (packaging, hallmarking, certification, etc.), grouped with Making and Wastage.
3. **"Add Wax" doesn't happen on the Estimate at all.** It happens later, on the Job Card, when you receive material back from the karigar ("Filler Weight" field). It's part of step 20 below, not the estimate line items.
4. **There's no "Save Draft" or "Preview" button.** Every field autosaves the moment you change it (the estimate is a Draft by default and stays editable until you click "Approve & Lock" — there's nothing separate to "save"). "Preview" = **Export PDF**, and that button only appears *after* the estimate is approved — there's no pre-approval preview in the current UI.
5. **"Move Design to Production" is a fully independent action from the Estimate**, not a button on the estimate page. It means going to **Job Cards → New** and creating a job card directly from the product. It has no dependency on estimate/order status, which is why it's listed here as its own step, done in parallel with the Final Costing steps that follow.

---

## Part A — Rough Estimate

### 1. Create Customer
Go to **Ledger → Customers tab** → **"+ New Customer"**.
- Name (required): `Test Customer`
- Contact (optional): a phone number
- Address (optional)
- Click **"+ Add Customer"**.

*(Shortcut: you can also add a customer inline while creating the estimate in step 3 — same form, minus the Address field.)*

### 2. Create Design (Product)
Go to **Products → + New Product** (`/products/new`).
- Design Name (required): e.g. `Test Peacock Necklace`
- Category (required) → pick one, e.g. Necklace
- Subcategory (optional, filtered by category)
- Purity (required) → e.g. 22K
- Gross Weight (g) (required): e.g. `25`
- Stone Weight (crt) (optional): e.g. `2`
- Net Weight — auto-calculated, read-only
- Size / Dimensions (optional)
- Customer (optional) — pick `Test Customer` from step 1, or leave blank and set it on the estimate instead
- Description (optional)

Click **"Save Product"** → redirects to the product detail page and shows the auto-generated serial number (format `CAT-PURITY-YYMM-####`).

### 3. Create Estimate
Go to **Costing → + New Estimate** (`/costing/new`).
- Product (required): search and select the product from step 2
- Customer: select `Test Customer` (or use the inline "+ Add Customer" here)
- Karigar (optional): leave blank for now
- Profit % (defaults to 12), GST % (defaults to 3) — leave defaults or adjust

Click **"Create Estimate"** → redirects to `/costing/{id}`. This is always created as a **Rough Estimate**, status **Draft**.

### 4. Add Gold
In section "1. Materials — Gold & Stones" → **Gold / Metal** card → **"+ Add Gold / Metal Line"**.
- Purity (required) → e.g. 22K
- Quantity in grams (required): e.g. `25`
- "Use today's rate" checkbox — leave checked to auto-price from the current gold rate, or uncheck to type a manual rate.

Click **Add**.

### 5. Add Polki
Same section → **Polki** card → **"+ Add Polki Line"**.
- Stone Type (required, filtered to Polki category)
- "Quality rate is per" → Carat or Piece
- Quantity in ct (required)
- Pieces (required only if rate-basis is Piece)
- Rate (required if Piece; optional/auto otherwise)

### 6. Add Diamond
Same as step 7 below, but pick **Stone Type = Diamond** in the **Coloured Stones** card (see Correction #1).

### 7. Add Colour Stones
**Coloured Stones** card → **"+ Add Coloured Stones Line"**.
- Stone Type (required — Ruby / Emerald / Sapphire / Diamond / etc.)
- Rate basis → Carat/Karat or Piece
- Quantity in kt (100 cent = 1kt) (required)
- Pieces / Rate as above

### 8. Add Other Material
Section "2. Making, Other Charges & Wastage" → **Other Charges** card → **"+ Add Other Charges Line"**.
- Description (optional): e.g. `Findings`
- Lumpsum Amount (₹) (required)

### 9. Add Making
**Making Charges** card → **"+ Add Making Charges Line"**.
- Description (optional)
- Lumpsum Amount (₹) (required)

*(You'll also see a "Pull Labour" button later, in Part C, that auto-fills Making lines from approved karigar labour — that only becomes useful once a job card has real labour entries.)*

### 10. Add Wax
Skip for now — see Correction #3. This happens in Part B (step 20, karigar material receipt).

### 11. Add Wastage
**Wastage** card → **"+ Add Wastage Line"**. Two modes:
- **% of gold weight**: pick the Gold line, enter a wastage % (default 7) — priced at the estimate's locked 24K rate.
- **Lumpsum**: Description + Amount.

### 12. Apply Profit
Right sidebar "Live Summary" → **Your Profit %** field — type a value, it autosaves on blur (tab/click away).

### 13. Apply GST
Same sidebar → **GST %** field — same autosave behavior.

### 14. Save Draft
Nothing to click — every change above already saved itself. Confirm the "Customer Pays" box at the bottom of the sidebar shows a live total.

### 15. Preview
No pre-approval preview exists (Correction #4) — skip this until after step 16, then use **Export PDF**.

### 16. Approve Estimate
Click **"Approve & Lock"** (bottom of Live Summary sidebar). Confirm:
- Status pill changes to **Approved**.
- **Export PDF** / **Export Excel** buttons now appear in the top action bar — this is your "Preview."
- Product status flips to **Estimated** (check the product detail page).

---

## Part B — Production

### 17. Move Design to Production
Go to **Job Cards → + New Job Card** (`/job-cards/new`).
- Product (required): search and select the same product.
- Customer (optional, defaults from product).
- Target Delivery Date (optional).
- Process Stages: check the stages this job needs (e.g. Casting, Filing, Setting, Polishing, QC).

Click **"Create Job Card"** → redirects to the job card detail page. Product status flips to **In Production**.

### 18. Assign Karigar
On the job card detail page, each checked stage shows as its own card. Pick a stage (e.g. Casting) → select a karigar from the dropdown (use seeded **Suresh Kumar**, or **"+ New Karigar"** to add one — Name, Type [In-house/External], Contact, Specialisation).

**Important**: if you add a *new* karigar, go to **Karigars → (their name) → Stage Rates panel** and set a rate for whichever stage you'll log labour against before trying to log labour — this is the exact bug that was just fixed; a karigar with no stage rate will block labour entry for anyone except Manager/Super Admin, and even they'll get a confusing error if they leave the rate blank expecting auto-fill.

Click **"Assign"**.

### 19. Issue Material
Same stage card → **"Issue Material"** (enabled once a karigar is assigned).
- Purity (required)
- Gross Weight (g) (required)

Submit. Stage status → **Issued**.

### 20. Receive material back (incl. Wax)
Same stage card → **"Receive & Reconcile"**.
- **Finished Piece Weight (g)** (required)
- **Filler Weight (g) — wax/solder/support wire, if any** ← this is "Add Wax." If > 0, a note field appears ("What was the filler?").
- Checkbox: weight above is already fine gold (leave default checked unless testing the purity-netting math specifically)
- **Gold Dust Recovered (g)** (optional)
- **Unused Gold Returned (g)** (optional)

Watch the live wastage % preview (green = within tolerance, red = exceeds — requires Manager approval). Click **"Submit Receipt"**. Stage status → **Received**.

If wastage exceeded tolerance, an approve/reject panel appears on the stage — approve it with a reason to proceed.

### Log Labour
Still on the job card, each stage has a **Labour** section at the bottom — add an entry (rate basis, quantity; rate auto-fills from the karigar's Stage Rate). Submit, then click **Approve** on it (only Manager/Super Admin can approve). This is what "Pull Labour" will read from in Part C.

Optionally click **"Approve Stage"** once satisfied — this is required later for closing the job card, but not required to proceed to Final Costing.

---

## Part C — Final Costing

### 21. Convert to Final Costing
Go back to the **Rough Estimate** (`/costing/{id}` from Part A). Click **"Convert to Final Costing"** in the top action bar. This creates a new estimate (type **Final Costing**, status **Draft**) and redirects to it — the Rough Estimate itself is untouched and stays a historical record.

### 22. Refresh Rates
On the new Final Costing estimate, click **"Refresh Gold Rate"** in the top action bar. Re-prices only the Gold-head line(s) at today's gold rate; negotiated stone/making/other rates are left alone.

### 23. Pull Labour
Click **"Pull Labour"**. Pulls in every *approved* labour entry from the job card's stages as new Making Charges lines (won't duplicate if run twice).

### 24. Pull Wastage
Click **"Pull Wastage"**. Sums recorded wastage (within tolerance) from the job card's stages, replaces the Wastage line(s) with the real recorded figure priced at the frozen 24K rate.

### 25. Modify Actual Costing
Now edit as needed — add/delete lines, adjust Profit %/GST % the same way as Part A. This is the same line-editing UI, just now populated with real production numbers instead of guesses.

### 26. Final Cost
Confirm the "Customer Pays" box reflects the final, reconciled numbers.

### 27. Approve & Lock
Click **"Approve & Lock"** again (same button as step 16, now on the Final Costing estimate). This posts an invoice entry to the customer's ledger (check **Ledger → Customers → Test Customer**) and Export PDF/Excel become available for the final costing sheet.

*(Optional next step, not in your original list: **"Convert to Order"** now appears — this is where Sales would actually turn the approved Final Costing into a trackable Order with delivery status.)*

---

## Quick reference — who can do what

If you want to test role restrictions instead of staying logged in as admin the whole time:

| Action | Roles allowed |
|---|---|
| Create Customer / Product | Super Admin, Manager, Sales |
| Build estimate (lines, profit/GST, refresh/pull) | Super Admin, Manager, Costing, Auditor |
| Approve Estimate / Convert to Order | Super Admin, Manager only |
| Create Job Card | Super Admin, Manager only |
| Assign Karigar / Approve Stage | Super Admin, Manager, Production |
| Issue / Receive Material | Super Admin, Manager, Store |
| Approve Labour entry / Wastage exception | Super Admin, Manager only |

Seeded logins (all password `Password@123`): `admin@jms.local`, `manager@jms.local`, `costing@jms.local`, `store@jms.local`, `production@jms.local`, `sales@jms.local`, `auditor@jms.local`.
