import { Router } from "express";
import { z } from "zod";
import { prisma } from "../../db";
import { requireAuth, requireRole } from "../../middleware/auth";
import { asyncHandler } from "../../utils/asyncHandler";
import { recordAudit } from "../../services/audit";

const router = Router();

// --- Customers (FR-1.09) ---------------------------------------------------
const customerSchema = z.object({
  name: z.string().min(1),
  contact: z.string().optional(),
  address: z.string().optional(),
});

router.get(
  "/customers",
  requireAuth,
  asyncHandler(async (_req, res) => {
    res.json(await prisma.customer.findMany({ where: { isActive: true }, orderBy: { name: "asc" } }));
  })
);

router.post(
  "/customers",
  requireRole("SUPER_ADMIN", "MANAGER", "SALES"),
  asyncHandler(async (req, res) => {
    const body = customerSchema.parse(req.body);
    const customer = await prisma.customer.create({ data: body });
    await recordAudit(prisma, {
      userId: req.user!.id,
      action: "CREATE",
      entityType: "Customer",
      entityId: customer.id,
      after: customer,
      ipAddress: req.ip ?? null,
    });
    res.status(201).json(customer);
  })
);

// --- Vendors / Refiners (FR-1.09) ------------------------------------------
const vendorSchema = z.object({
  name: z.string().min(1),
  type: z.enum(["REFINER", "SUPPLIER"]),
  contact: z.string().optional(),
});

router.get(
  "/vendors",
  requireRole("SUPER_ADMIN", "MANAGER", "STORE", "COSTING", "AUDITOR"),
  asyncHandler(async (_req, res) => {
    res.json(await prisma.vendor.findMany({ where: { isActive: true }, orderBy: { name: "asc" } }));
  })
);

router.post(
  "/vendors",
  requireRole("SUPER_ADMIN"),
  asyncHandler(async (req, res) => {
    const body = vendorSchema.parse(req.body);
    const vendor = await prisma.vendor.create({ data: body });
    await recordAudit(prisma, {
      userId: req.user!.id,
      action: "CREATE",
      entityType: "Vendor",
      entityId: vendor.id,
      after: vendor,
      ipAddress: req.ip ?? null,
    });
    res.status(201).json(vendor);
  })
);

// --- Charge Types — hallmarking, certification, packing... (FR-1.10) -------
const chargeTypeSchema = z.object({ name: z.string().min(1) });

router.get(
  "/charge-types",
  requireRole("SUPER_ADMIN", "MANAGER", "COSTING", "AUDITOR"),
  asyncHandler(async (_req, res) => {
    res.json(await prisma.chargeType.findMany({ where: { isActive: true }, orderBy: { name: "asc" } }));
  })
);

router.post(
  "/charge-types",
  requireRole("SUPER_ADMIN"),
  asyncHandler(async (req, res) => {
    const body = chargeTypeSchema.parse(req.body);
    const chargeType = await prisma.chargeType.create({ data: body });
    await recordAudit(prisma, {
      userId: req.user!.id,
      action: "CREATE",
      entityType: "ChargeType",
      entityId: chargeType.id,
      after: chargeType,
      ipAddress: req.ip ?? null,
    });
    res.status(201).json(chargeType);
  })
);

export default router;
