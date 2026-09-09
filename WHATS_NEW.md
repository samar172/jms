# What's New — September 2026 Update

This document summarises the features and fixes added to the JMS Silver ERP in the
September 2026 work (branch `new`, commits `2c9352a` → `f13facd`). Everything below
is **live** (backend on the server, frontend on Vercel `jms-rust.vercel.app`).

---

## 1. Roles & Permissions (RBAC)

Roles are no longer a fixed list — an owner can **create named roles** and grant each
a matrix of permissions.

- **Resources × Actions:** every panel (Dashboard, Job Cards, Karigars, Items, Prices,
  Costing, Settings, Users) can be granted **View / Add / Update / Delete** per role.
- **Roles & Permissions** page (Super-Admin → sidebar): create/edit roles with a
  checkbox matrix; the 8 built-in roles are pre-seeded and editable; `SUPER_ADMIN`
  always has full access.
- **Users page** now assigns any custom role to a user.
- Cost/margin visibility follows the `Costing: View` permission.

**Where:** Sidebar → *Roles & Permissions*, *Users & Roles*.

## 2. Change Requests (request → approve)

Any employee can **request** an add/update/delete they can't do themselves; the owner
is notified and approves or rejects, then applies it.

- Employee raises a request (panel, action, summary, details).
- Super-Admins are notified; they **Approve / Reject**, then **Mark applied** after
  making the change. Requesters can **Cancel** their own pending requests.

**Where:** Sidebar → *Change Requests*.

## 3. Delete a Job Card (permission-gated + audited)

- A **Delete** button appears on a job card **only** for roles granted `Job Cards: Delete`
  (Super-Admin can grant this to Manager or any role).
- Deleting cascades all its stages/work and removes it from the karigar ledger.
- **Every deletion is recorded** (who, when, and a snapshot of the card).

## 4. Deleted Job Cards tab + Audit Log

- **Job Cards → Deleted tab:** shows every deleted job card (job no., item, stages,
  who deleted it, when) — reconstructed from the audit trail.
- **Audit Log** page (Super-Admin / Manager / Auditor): every create/update/delete/
  approve with who, when, and the before/after snapshot; filter by record type & action.

**Where:** Sidebar → *Audit Log*; Job Cards → *Deleted* tab.

## 5. Item Master (designs): archive, guarded delete, full images

- **Delete a design** only when it has **no job cards**; otherwise it must be **Archived**
  (job-card history is never destroyed).
- **Archived tab** on the Item Master: archived designs move here and can be **Restored**.
- **Full image view:** designs show the whole image (no square crop); **click to enlarge**
  in a lightbox.

## 6. Filters (find things fast)

Instant, client-side filters that combine:

- **Item Master:** search (name / serial / design code), category, purity, "has job cards".
- **Job Cards:** search, category, stage, **series**, **created-date range (From/To)**,
  "overdue only" — alongside the existing status tabs.

## 7. Job-card thumbnail hover preview

Hovering a thumbnail in the Job Cards list shows a **large floating preview** of the full
design, so a piece is recognisable without opening it.

## 8. My Profile (self-service password change)

Any signed-in employee can change **their own password** (current → new → confirm),
no admin needed. Backend verifies the current password before changing it.

**Where:** click your name/avatar (top-right) → *My Profile*.

## 9. Sketch / Mood Board

A drawing studio to ideate over a reference image.

- **Upload** a reference image, then sketch over it.
- **Tools:** Pen, **Brush** (translucent marker), **Eraser** (removes only your strokes),
  Line, Box, Circle, Text; 8 colours; thickness; **filled shapes**.
- **Reference controls:** **Fade** slider (image opacity) and **B&W** toggle — trace over
  a faint/grayscale reference.
- **Board colour:** White / Black / Cream (black board suits silver/gold sketches).
- **Undo / Redo / Clear**, **Download** PNG, or **Save to a design** (the merged sketch
  becomes a new image on that design).

**Where:** Sidebar → *Sketch / Mood Board*.

## 10. Fixes & polish

- **Karigars:** the "+ New Karigar" button is always visible (was hidden when the list
  was empty), plus an empty state.
- **Legibility:** faded/thin secondary text made darker and slightly heavier app-wide.

---

## For developers / operators

**Stack:** npm workspaces monorepo — Express + Prisma + PostgreSQL API (run via `tsx`
from source), Next.js web (Vercel), shared TypeScript engine `@jms/shared` (consumed as
source). Server: PM2 (`jms-api`, port 4002), nginx + Let's Encrypt.

**Schema changes this update (additive, backward-compatible):**
- `AppRole`, `RolePermission`, `ChangeRequest` (+ `ChangeRequestStatus`), `User.appRoleId`
- `Product.isArchived`, `Product.archivedAt`

**Deploy runbook (backend):**
```bash
# from repo root, after pulling `new`
rsync -a --delete apps/api/src/     saangri:/opt/apps/jms/apps/api/src/
rsync -a --delete apps/api/prisma/  saangri:/opt/apps/jms/apps/api/prisma/
rsync -a --delete packages/shared/src/ saangri:/opt/apps/jms/packages/shared/src/
ssh saangri 'cd /opt/apps/jms/apps/api \
  && npx prisma migrate deploy \
  && npx prisma generate \
  && set -a; . ./.env; set +a; npx tsx prisma/rbac-seed.ts \  # first time only, idempotent
  && pm2 restart jms-api'
```
- `prisma/rbac-seed.ts` seeds the 8 built-in roles + default permissions and links
  existing users. It is **idempotent** — safe to re-run.

**Deploy (frontend):** from repo root, on Node 20: `npx vercel --prod --yes`
(production alias: `https://jms-rust.vercel.app`).

**Note:** after the RBAC deploy, users already logged in should log out and back in once
so their session picks up the new role/permission fields.
