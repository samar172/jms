import express from "express";
import cors from "cors";
import helmet from "helmet";
import morgan from "morgan";
import cookieParser from "cookie-parser";
import rateLimit from "express-rate-limit";
import path from "node:path";
import { env } from "./env";
import { errorHandler } from "./middleware/errorHandler";
import { requireAuth } from "./middleware/auth";

import authRoutes from "./modules/auth/auth.routes";
import mastersRoutes from "./modules/masters";
import productsRoutes from "./modules/products/products.routes";
import searchRoutes from "./modules/products/search.routes";
import jobcardsRoutes from "./modules/jobcards/jobcards.routes";
import materialsRoutes from "./modules/materials/materials.routes";
import labourRoutes from "./modules/labour/labour.routes";
import estimatesRoutes from "./modules/estimates/estimates.routes";
import dashboardRoutes from "./modules/dashboard/dashboard.routes";
import auditRoutes from "./modules/audit/audit.routes";
import usersRoutes from "./modules/users/users.routes";
import settingsRoutes from "./modules/settings/settings.routes";
import stockLedgerRoutes from "./modules/ledger/stock.routes";
import customerLedgerRoutes from "./modules/ledger/customer.routes";
import cashBankLedgerRoutes from "./modules/ledger/cash-bank.routes";
import reportsRoutes from "./modules/reports/reports.routes";
import ordersRoutes from "./modules/orders/orders.routes";
import notificationsRoutes from "./modules/notifications/notifications.routes";
import assemblyRoutes from "./modules/assembly/assembly.routes";
import qcRoutes from "./modules/qc/qc.routes";
import stonesRoutes from "./modules/stones/stones.routes";
import globalSearchRoutes from "./modules/search/global.routes";
import dispatchRoutes from "./modules/dispatch/dispatch.routes";

export const app = express();

app.use(helmet());
app.use(cors({ origin: (origin, callback) => callback(null, true), credentials: true }));
app.use(express.json());
app.use(cookieParser());
app.use(morgan("dev"));

// NFR-2 / FR-11.05: rate limit auth endpoints against brute force.
const authLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 20 });
app.use("/api/auth/login", authLimiter);

// FR-8.05 note: served directly from local disk in this dev build. Swap for
// S3 + signed URLs (as specified) before production deployment.
app.use("/uploads", express.static(path.resolve(env.UPLOAD_DIR)));

app.get("/health", (_req, res) => res.json({ ok: true }));

app.use("/api/auth", authRoutes);
app.use("/api/masters", requireAuth, mastersRoutes);
app.use("/api/products", requireAuth, searchRoutes);
app.use("/api/products", requireAuth, productsRoutes);
app.use("/api/job-cards", requireAuth, jobcardsRoutes);
app.use("/api/materials", requireAuth, materialsRoutes);
app.use("/api/labour", requireAuth, labourRoutes);
app.use("/api/estimates", requireAuth, estimatesRoutes);
app.use("/api/dispatch", requireAuth, dispatchRoutes);
app.use("/api/dashboard", requireAuth, dashboardRoutes);
app.use("/api/audit-logs", requireAuth, auditRoutes);
app.use("/api/users", requireAuth, usersRoutes);
app.use("/api/settings", requireAuth, settingsRoutes);
app.use("/api/ledger/stock", requireAuth, stockLedgerRoutes);
app.use("/api/ledger/customers", requireAuth, customerLedgerRoutes);
app.use("/api/ledger/cash-bank", requireAuth, cashBankLedgerRoutes);
app.use("/api/reports", requireAuth, reportsRoutes);
app.use("/api/orders", requireAuth, ordersRoutes);
app.use("/api/notifications", requireAuth, notificationsRoutes);
app.use("/api/assembly", requireAuth, assemblyRoutes);
app.use("/api/qc", requireAuth, qcRoutes);
app.use("/api/stones", requireAuth, stonesRoutes);
app.use("/api/search", requireAuth, globalSearchRoutes);

app.use(errorHandler);
