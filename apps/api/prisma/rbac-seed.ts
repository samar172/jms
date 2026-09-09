/**
 * RBAC seed — idempotent. Safe to run repeatedly, including on production right
 * after the RBAC migration. It ONLY:
 *   1. creates/updates the 8 system AppRoles,
 *   2. ensures each system role has its default (resource,action) permissions,
 *   3. links every existing User to the AppRole matching its legacy `role` enum.
 *
 * It never deletes a role, never removes a permission an admin has customised,
 * and never touches any other table. Run with:  npm run rbac:seed  (see package.json)
 */
import { PrismaClient } from "@prisma/client";
import { ROLES, defaultPermissionsFor, type Role } from "@jms/shared";

const prisma = new PrismaClient();

const DESCRIPTIONS: Record<Role, string> = {
  SUPER_ADMIN: "Owner — full access, approves all change requests.",
  MANAGER: "Manages production, karigars, items and prices.",
  COSTING: "Costing & rates; sees margins.",
  STORE: "Store keeper — items and stock.",
  PRODUCTION: "Shop-floor production; no cost visibility.",
  SALES: "Sales desk; no cost visibility.",
  KARIGAR: "Karigar login — own job cards only.",
  AUDITOR: "Read-only across the whole app.",
};

async function main() {
  for (const name of ROLES) {
    const isSuperAdmin = name === "SUPER_ADMIN";

    const role = await prisma.appRole.upsert({
      where: { name },
      update: { isSystem: true, isSuperAdmin, description: DESCRIPTIONS[name] },
      create: { name, isSystem: true, isSuperAdmin, description: DESCRIPTIONS[name] },
    });

    if (!isSuperAdmin) {
      const rows = defaultPermissionsFor(name as Exclude<Role, "SUPER_ADMIN">).map((p) => {
        const [resource, action] = p.split(":");
        return { roleId: role.id, resource, action };
      });
      // skipDuplicates keeps this idempotent and preserves any admin-added rows.
      if (rows.length > 0) {
        await prisma.rolePermission.createMany({ data: rows, skipDuplicates: true });
      }
    }

    // Link users whose legacy enum role matches this AppRole and aren't linked yet.
    await prisma.user.updateMany({
      where: { role: name as Role, appRoleId: null },
      data: { appRoleId: role.id },
    });
  }

  const [roleCount, permCount, unlinked] = await Promise.all([
    prisma.appRole.count(),
    prisma.rolePermission.count(),
    prisma.user.count({ where: { appRoleId: null } }),
  ]);
  console.log(
    `RBAC seed done: ${roleCount} roles, ${permCount} permissions, ${unlinked} users still unlinked.`,
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
