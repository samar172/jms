# JMS vs. "Jewellery Manufacturing ERP SRS" — Gap Analysis

**Date:** 11 Aug 2026
**Source documents compared:**
- `Chowker (N-562).xlsx` — the original reference costing sheet (same one `docs/reference/Master.md` was built from)
- `Jewellery_Manufacturing_ERP_SRS.docx` — a re-derived spec someone wrote from that same Excel sheet (WhatsApp, 11 Aug 2026)
- Actual code in this repo (`apps/api`, `apps/web`) as of this date

**Method:** every claim below was checked against the running Prisma schema and route code, not assumed. File:line references are given so any of these can be re-verified directly.

---

## 1. Bottom line

The SRS is not describing anything we're missing conceptually — it's a simplified restatement of the same Chowker sheet `docs/reference/Master.md` was already built from. In most places **our schema is already more rigorous than the SRS's own proposal** (see §4). The real gaps are five specific, nameable things (§3), plus one big non-code reason "no one is satisfied" (§2) that has nothing to do with missing features.

---

## 2. The #1 reason it looks broken: production is running old code

Everything tested against `https://jms-rust.vercel.app` this week is hitting a separate backend at `jms-api.98.70.37.83.nip.io` with **its own database** — not the machine these fixes are being made on. Confirmed by finding that URL hardcoded in the deployed JS bundle, and by the estimate ID from a production screenshot not existing in the local dev database at all.

As of this doc, the following fixes exist **only locally, uncommitted**:
- Job cards scoped to Estimate instead of Product (fixes Pull Labour pulling another customer's karigar entries on the same design)
- Plain-digit estimate numbers (no more `QT-`/`FC-` prefix confusion)
- Order page rebuilt to match the costing page UI (single continuous flow, not a different screen)
- Orders-list drawer removed (row click goes straight to the record)

**Every demo the client has seen recently was on the old backend.** Fixing code locally doesn't fix what they see until this is committed, pushed, and deployed (with its migrations run) to `98.70.37.83`. This should be priority #0 before chasing any further feature gaps — the client's dissatisfaction is largely with a build that's already been superseded.

---

## 3. Actual gaps found (verified against code)

Ordered by how much they matter.

### 3.1 Order can be marked DELIVERED without production being reconciled
**Severity: real, worth fixing.**

`JobCard.close()` already refuses to close a job card with an unresolved wastage exception or unapproved labour (`apps/api/src/modules/jobcards/jobcards.routes.ts:172-201`) — that correctly implements the SRS's "mandatory transition rule" (§2 of the SRS: *"cannot transition to COMPLETED/INVOICED until ALL issued fine metal, silver, stones, scrap have been 100% accounted for"*).

But the **Order** status update (`apps/api/src/modules/orders/orders.routes.ts:121-131`) only checks that the balance is paid before allowing `DELIVERED` — it never checks whether the order's job card(s) are actually `CLOSED`. So an order can be marked delivered while its production is still mid-reconciliation, silently bypassing the exact rule the job card enforces on its own.

**Fix:** add a check in the same spot — before allowing `status: "DELIVERED"`, require every linked `JobCard` to be `CLOSED`.

### 3.2 No stock tracking for wax / wire / iron (auxiliary materials)
**Severity: real but low-priority.**

`MaterialType` is `GOLD | POLKI | COLOURED_STONE | FINDING` (`schema.prisma:422-427`) — there's no type for wax, setting wire, or iron stays. The SRS's Module 2 wants these issued from stock like gold is (*"Issue Wax/Wire: 45.00g, Wax Type: Red Wax"*), with a stock ledger debit.

Today, filler material only ever shows up **at return time**, as a free-text-noted deduction (`fillerWeightG` + `fillerNote` on `MaterialReceipt`, `schema.prisma:465-470`) — there's no corresponding issue-side stock movement. Functionally this doesn't break the gold math (the deduction still happens correctly), but there's no wax/wire inventory or consumption report.

**Fix, if wanted:** low priority unless the shop actually needs to track wax/wire cost or consumption — most shops treat these as negligible/reusable. Worth confirming with the client before building it.

### 3.3 No auto-suggested stone-weight deduction for combined-weight returns
**Severity: real UX gap.**

The SRS's Module 3 has a dedicated field: *"Stone Weight (Polki + Beads) In Grams: 31.080g (155.4 ctr ÷ 5)"* — auto-computed from the carats issued to that stage. This matters specifically for a **Setting** stage: once stones are mounted, the karigar can usually only weigh the piece as one combined lump (metal + stones together) — the office has to subtract the stones' weight to isolate gold.

Our `ReceiptForm` (`apps/web/src/components/JobStageCard.tsx:471-496`) has a generic "Filler Weight (g) — wax/solder/support wire, if any" field. It's not wrong — the office *can* type a manually-calculated stone-weight-in-grams into it — but:
- the label never mentions stones, so it's easy to forget on a Setting-stage return
- there's no auto-suggested default computed from `issued carats ÷ 5` the way the SRS mocks up

**Fix:** on Setting-stage receipts specifically, compute `stage's issued POLKI/COLOURED_STONE caratWeight ÷ 5` and pre-fill/suggest it as part of the filler amount, with a clear label ("stone weight embedded in piece").

### 3.4 GST shown as one line, not split CGST + SGST
**Severity: real, invoice-compliance-relevant.**

`Estimate.gstPct` is a single flat percentage (`schema.prisma:662`), and both PDF services print one `GST (X%)` row (`estimates/pdf.service.ts:92-97`, `orders/invoice.service.ts:84-88`). Indian GST invoices for an intra-state sale are conventionally shown as CGST + SGST split evenly (e.g. 1.5% + 1.5%, per the SRS), not one combined line — the total tax is identical either way, but the line-item format is what accountants/auditors expect to see.

**Fix:** split `gstPct` into two equal display rows (`CGST (half)` / `SGST (half)`) at PDF-render time — doesn't need a schema change, just a formatting change in both PDF services, since the underlying `gstAmount` is already correct.

### 3.5 Estimate number format was deliberately changed away from the SRS's own suggestion
**Not a gap — a direct instruction, noting it here so it's not "rediscovered" as a bug.**

The SRS assumes `#EST-0562` style prefixed numbers. The client explicitly asked earlier today to drop the `QT-`/`FC-` prefixes entirely in favour of plain digits ("दो जगह अलग नंबर क्यों आ रहे हैं, सिर्फ digits रखो") — that's already implemented (`nextSequenceNumber`, `apps/api/src/services/voucherNumber.ts`). If the SRS's prefixed format is actually wanted after all, that's a product decision to revisit with the client, not something to silently "fix" back.

---

## 4. Where JMS is already ahead of the SRS

Worth knowing so effort isn't spent re-building what already exists — and so the SRS isn't mistaken for the more advanced document.

| Area | SRS's model | What JMS actually has |
|---|---|---|
| Wastage exception handling | "Trigger alert for Production Supervisor" (a TODO-level requirement) | A persisted `WastageRecord` per stage with `exceptionStatus` (`NONE/PENDING/APPROVED/REJECTED`), a `notify()` call that broadcasts to every `MANAGER` (`materials.routes.ts:283-291`), and a Manager approve/reject decision that's remembered even if the figure is later recomputed (`wastage.service.ts:100-108`) |
| Scrap/dust recovery | One flat table: `source_job_card_id, metal_purity, weight_grams, sent_to_refinery` | `DustLot` with vendor assignment, despatch tracking, `recoveredPureGoldG`, and a computed `recoveryPct` against what was sent — a real refinery reconciliation, not just a boolean flag (`schema.prisma:539-554`) |
| Stones | Bulk carat weight per line item only | Bulk carat tracking for costing (matches SRS) **plus** a separate `Stone`/`StoneMovement` model for discrete, individually-coded stones with full custody history (`schema.prisma:935-988`) — used when precision tracking of a specific certified stone matters |
| Karigar accounting | One field: "Labour Fee Payable" | Full `KarigarLedgerEntry` ledger — `METAL_DEBIT/CREDIT`, `LABOUR_EARNED`, `ADVANCE_PAID/ADJUSTED`, `WASTAGE_RECOVERY` — plus per-stage, per-karigar rate differentiation (`KarigarStageRate`) |
| Job card completeness gate | Stated as a rule, no schema/logic given | Actually enforced in code — `close()` blocks on any unresolved wastage exception or unapproved labour entry (`jobcards.routes.ts:172-201`) |
| Estimate lifecycle | One `estimates` table, `status` field only | Full Rough Estimate → Final Costing versioning (`type`, `version`, `@@unique([productId, type, customerId, version])`), immutable-once-approved with an explicit Super Admin amend/reversal flow that preserves the customer ledger |
| Multi-material issue | Gold + generic "stones" | Gold / Polki / Coloured Stone / Finding as distinct `MaterialType`s, each with type-appropriate fields (purity for gold, stone type + carat for stones) |
| Audit trail | Not specified | Generic `AuditLog` (before/after JSON snapshot) on every state-changing route, surfaced as a per-record Activity Timeline on Estimate/Order pages |

---

## 5. Workflow mapping — SRS states vs. JMS states

The SRS's 5-state model (`Costing → Job Card → Karigar Production → Scrap Recovery → Invoice`) maps directly onto JMS, just with a couple of extra, deliberate checkpoints:

```
SRS:   Costing Estimate ─────────────► Job Card Issued ──► Karigar Production ──► Scrap Recovery ──► Client Invoice
                                                                                         │
JMS:   Rough Estimate ──(Send to      Final Costing ──(Send to     Job Card ──(per-stage:      DustLot          Order ──(Convert
       (DRAFT/APPROVED)  Production)   (DRAFT/APPROVED)  Production)  issue → receive &          (auto-created    to Order,
                                                                        reconcile → wastage        from returned   after FC
                                                                        exception → labour          dust, sent to  approved)
                                                                        approval)                    vendor,        ──► Invoice
                                                                                                       recovered %)   PDF
```

The extra checkpoint JMS has that the SRS doesn't: **Rough Estimate and Final Costing are separate, versioned documents** (not one mutable "estimate" row) — this is what lets a quotation be sent to a client, revised, and re-sent without losing the trail, and is also why "Send to Production" and "Convert to Order" are two separate deliberate actions rather than one button (§4 of the earlier session decision) — Order carries real financial commitment (`approvedAmount`, ledger posting) that shouldn't be an automatic side-effect of costing work.

---

## 6. Recommended order of work

1. **Commit, push, and deploy today's local fixes** (§2) — this is likely fixing most of what's currently being perceived as "still broken," for free, with zero new code.
2. **3.1 — Order DELIVERED gate** — small, prevents a real data-integrity hole (order marked done while production isn't actually reconciled).
3. **3.4 — CGST/SGST split on invoice PDFs** — small, invoice-compliance-visible, no schema change needed.
4. **3.3 — Stone-weight-deduction helper on Setting-stage receipts** — medium, meaningfully reduces a manual-calculation error a floor operator could make.
5. **3.2 — Wax/wire stock tracking** — only if the client actually asks for it; confirm before building, since most shops don't inventory-track consumables like this.
