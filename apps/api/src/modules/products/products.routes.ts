import { Router } from "express";
import multer from "multer";
import { z } from "zod";
import { prisma } from "../../db";
import { requireAuth, requireRole } from "../../middleware/auth";
import { asyncHandler } from "../../utils/asyncHandler";
import { recordAudit } from "../../services/audit";
import { badRequest, notFound } from "../../utils/httpError";
import { round3 } from "@jms/shared";
import { generateSerialNumber } from "./serialNumber.service";
import { storeProductImage } from "../../services/imageStorage";
import { embedImage } from "./vision.service";
import { buildProductTimeline } from "./timeline.service";

const router = Router();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 15 * 1024 * 1024 }, // FR-8.01 default 15MB
  fileFilter: (_req, file, cb) => {
    const allowed = ["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif"];
    cb(null, allowed.includes(file.mimetype));
  },
});

const CARAT_TO_GRAM = 0.2;

// --- Catalogue listing (FR-2.09) --------------------------------------------
const listQuerySchema = z.object({
  categoryId: z.string().optional(),
  subcategoryId: z.string().optional(),
  purityId: z.string().optional(),
  status: z
    .enum(["DESIGN", "ESTIMATED", "IN_PRODUCTION", "FINISHED", "SOLD", "MELTED"])
    .optional(),
  customerId: z.string().optional(),
  minWeight: z.coerce.number().optional(),
  maxWeight: z.coerce.number().optional(),
  search: z.string().optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(40),
});

router.get(
  "/",
  requireAuth,
  asyncHandler(async (req, res) => {
    const q = listQuerySchema.parse(req.query);
    const where = {
      ...(q.categoryId && { categoryId: q.categoryId }),
      ...(q.subcategoryId && { subcategoryId: q.subcategoryId }),
      ...(q.purityId && { purityId: q.purityId }),
      ...(q.status && { status: q.status }),
      ...(q.customerId && { customerId: q.customerId }),
      ...(q.minWeight !== undefined || q.maxWeight !== undefined
        ? {
            grossWeightG: {
              ...(q.minWeight !== undefined && { gte: q.minWeight }),
              ...(q.maxWeight !== undefined && { lte: q.maxWeight }),
            },
          }
        : {}),
      ...(q.search && {
        OR: [
          { serialNo: { contains: q.search, mode: "insensitive" as const } },
          { designName: { contains: q.search, mode: "insensitive" as const } },
        ],
      }),
    };

    const [items, total] = await Promise.all([
      prisma.product.findMany({
        where,
        include: {
          category: true,
          subcategory: true,
          purity: true,
          images: { where: { isActive: true, isPrimary: true }, take: 1 },
        },
        orderBy: { createdAt: "desc" },
        skip: (q.page - 1) * q.pageSize,
        take: q.pageSize,
      }),
      prisma.product.count({ where }),
    ]);

    res.json({ items, total, page: q.page, pageSize: q.pageSize });
  })
);

router.get(
  "/:id",
  requireAuth,
  asyncHandler(async (req, res) => {
    // Accepts either the internal id or the human-facing serial number, so
    // catalogue links can read NK-18K-2607-0042 in the URL (design.md
    // Screen 4 breadcrumb) without a separate lookup round-trip.
    const include = {
      category: true,
      subcategory: true,
      purity: true,
      customer: true,
      images: { where: { isActive: true }, orderBy: { createdAt: "asc" as const } },
      jobCards: { include: { stages: { include: { processStage: true, karigar: true } } } },
      estimates: { orderBy: [{ type: "asc" as const }, { version: "desc" as const }] },
    };
    const product =
      (await prisma.product.findUnique({ where: { id: req.params.id }, include })) ??
      (await prisma.product.findUnique({ where: { serialNo: req.params.id }, include }));
    if (!product) throw notFound("Product not found");
    res.json(product);
  })
);

router.get(
  "/:id/timeline",
  requireAuth,
  asyncHandler(async (req, res) => {
    res.json(await buildProductTimeline(req.params.id));
  })
);

// --- Create (FR-2.01 to FR-2.04) --------------------------------------------
const createSchema = z.object({
  designName: z.string().min(1),
  categoryId: z.string().min(1),
  subcategoryId: z.string().optional(),
  purityId: z.string().min(1),
  grossWeightG: z.number().positive(),
  stoneWeightCt: z.number().nonnegative().optional(),
  size: z.string().optional(),
  description: z.string().optional(),
  designSource: z.enum(["IN_HOUSE", "CUSTOMER_SUPPLIED"]).default("IN_HOUSE"),
  customerId: z.string().optional(),
  legacyRef: z.string().optional(),
  wastageRuleJson: z.any().optional(),
});

router.post(
  "/",
  requireRole("SUPER_ADMIN", "MANAGER", "SALES"),
  asyncHandler(async (req, res) => {
    const body = createSchema.parse(req.body);

    const [category, purity] = await Promise.all([
      prisma.category.findUnique({ where: { id: body.categoryId } }),
      prisma.karat.findUnique({ where: { id: body.purityId } }),
    ]);
    if (!category) throw badRequest("Unknown category");
    if (!purity) throw badRequest("Unknown purity");

    const stoneWeightG = (body.stoneWeightCt ?? 0) * CARAT_TO_GRAM;
    const netWeightG = round3(body.grossWeightG - stoneWeightG);
    if (netWeightG < 0) throw badRequest("Stone weight cannot exceed gross weight");

    const serialNo = await generateSerialNumber(category.code, purity.code);

    const product = await prisma.product.create({
      data: {
        serialNo,
        legacyRef: body.legacyRef,
        designName: body.designName,
        categoryId: body.categoryId,
        subcategoryId: body.subcategoryId,
        purityId: body.purityId,
        grossWeightG: body.grossWeightG,
        netWeightG,
        stoneWeightCt: body.stoneWeightCt,
        size: body.size,
        description: body.description,
        designSource: body.designSource,
        customerId: body.customerId,
        wastageRuleJson: body.wastageRuleJson,
        createdById: req.user!.id,
      },
      include: { category: true, purity: true },
    });

    await recordAudit(prisma, {
      userId: req.user!.id,
      action: "CREATE",
      entityType: "Product",
      entityId: product.id,
      after: product,
      ipAddress: req.ip ?? null,
    });

    res.status(201).json(product);
  })
);

// --- Clone (FR-2.07) ---------------------------------------------------------
router.post(
  "/:id/clone",
  requireRole("SUPER_ADMIN", "MANAGER", "SALES"),
  asyncHandler(async (req, res) => {
    const source = await prisma.product.findUnique({
      where: { id: req.params.id },
      include: { category: true, purity: true },
    });
    if (!source) throw notFound("Product not found");

    const serialNo = await generateSerialNumber(source.category.code, source.purity.code);

    const clone = await prisma.product.create({
      data: {
        serialNo,
        designName: `${source.designName} (Clone)`,
        categoryId: source.categoryId,
        subcategoryId: source.subcategoryId,
        purityId: source.purityId,
        grossWeightG: source.grossWeightG,
        netWeightG: source.netWeightG,
        stoneWeightCt: source.stoneWeightCt,
        size: source.size,
        description: source.description,
        designSource: source.designSource,
        clonedFromId: source.id,
        createdById: req.user!.id,
      },
    });

    await recordAudit(prisma, {
      userId: req.user!.id,
      action: "CREATE",
      entityType: "Product",
      entityId: clone.id,
      after: clone,
      ipAddress: req.ip ?? null,
    });

    res.status(201).json(clone);
  })
);

// --- Update mutable fields / status lifecycle (FR-2.08) ---------------------
const updateSchema = z.object({
  designName: z.string().min(1).optional(),
  description: z.string().optional(),
  size: z.string().optional(),
  status: z
    .enum(["DESIGN", "ESTIMATED", "IN_PRODUCTION", "FINISHED", "SOLD", "MELTED"])
    .optional(),
  customerId: z.string().optional(),
  wastageRuleJson: z.any().optional(),
});

router.patch(
  "/:id",
  requireRole("SUPER_ADMIN", "MANAGER"),
  asyncHandler(async (req, res) => {
    const before = await prisma.product.findUnique({ where: { id: req.params.id } });
    if (!before) throw notFound("Product not found");
    const body = updateSchema.parse(req.body);
    const product = await prisma.product.update({
      where: { id: req.params.id },
      data: {
        designName: body.designName,
        description: body.description,
        size: body.size,
        status: body.status,
        customerId: body.customerId,
        wastageRuleJson: body.wastageRuleJson,
      },
    });
    await recordAudit(prisma, {
      userId: req.user!.id,
      action: "UPDATE",
      entityType: "Product",
      entityId: product.id,
      before,
      after: product,
      ipAddress: req.ip ?? null,
    });
    res.json(product);
  })
);

// --- Images (FR-2.05, FR-8.01 to FR-8.09) ------------------------------------
router.post(
  "/:id/images",
  requireRole("SUPER_ADMIN", "MANAGER", "SALES", "PRODUCTION"),
  upload.single("file"),
  asyncHandler(async (req, res) => {
    if (!req.file) throw badRequest("No image file uploaded, or unsupported file type");
    const product = await prisma.product.findUnique({ where: { id: req.params.id } });
    if (!product) throw notFound("Product not found");

    const type = z
      .enum(["SKETCH", "WORK_IN_PROGRESS", "FINAL_PRODUCT"])
      .parse(req.body.type ?? "SKETCH");
    const isPrimary = req.body.isPrimary === "true";

    const { url, thumbnailUrl } = await storeProductImage(product.id, req.file.buffer, req.file.mimetype);

    if (isPrimary) {
      await prisma.productImage.updateMany({
        where: { productId: product.id },
        data: { isPrimary: false },
      });
    }

    const image = await prisma.productImage.create({
      data: {
        productId: product.id,
        type,
        url,
        thumbnailUrl,
        isPrimary,
        uploadedById: req.user!.id,
      },
    });

    try {
      const vector = await embedImage(req.file.buffer);
      const vectorStr = `[${vector.join(",")}]`;
      await prisma.$executeRaw`UPDATE "ProductImage" SET embedding = ${vectorStr}::vector WHERE id = ${image.id}`;
    } catch (err) {
      console.error("Failed to generate embedding for image", image.id, err);
      // We do not fail the upload just because AI embedding failed.
    }

    await recordAudit(prisma, {
      userId: req.user!.id,
      action: "CREATE",
      entityType: "ProductImage",
      entityId: image.id,
      after: image,
      ipAddress: req.ip ?? null,
    });

    // FR-8.09: Final Product images are auto-queued for visual search indexing.
    // The embedding pipeline (Module 9) is a separate service — this system
    // records the image as index-pending so that service can pick it up.

    res.status(201).json(image);
  })
);

router.delete(
  "/images/:imageId",
  requireRole("SUPER_ADMIN", "MANAGER"),
  asyncHandler(async (req, res) => {
    const before = await prisma.productImage.findUnique({ where: { id: req.params.imageId } });
    if (!before) throw notFound("Image not found");
    // FR-8.08: never silently deleted — deactivated only.
    const image = await prisma.productImage.update({
      where: { id: req.params.imageId },
      data: { isActive: false },
    });
    await recordAudit(prisma, {
      userId: req.user!.id,
      action: "UPDATE",
      entityType: "ProductImage",
      entityId: image.id,
      before,
      after: image,
      ipAddress: req.ip ?? null,
    });
    res.status(204).send();
  })
);

export default router;
