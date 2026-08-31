import type { NextFunction, Request, Response } from "express";
import { ZodError, type ZodIssue } from "zod";
import { HttpError } from "../utils/httpError";

// Friendlier labels for the fields our forms post, so a validation error reads
// like "Number of pieces is required" instead of "pieceCount: Required".
const FIELD_LABELS: Record<string, string> = {
  pieceCount: "Number of pieces",
  weight: "Weight",
  returnedWeight: "Returned weight",
  issuedWeight: "Issued weight",
  wastagePercent: "Wastage %",
  labourAmount: "Labour amount",
  karigarId: "Karigar",
  assignmentId: "Assignment",
  purity: "Purity",
  returnedPurity: "Returned purity",
  carat: "Carat",
  rate: "Rate",
  amount: "Amount",
  label: "Name",
  percent: "Percent",
  reason: "Reason",
  approvedBy: "Approved by",
};

function humanizeZodIssue(issue: ZodIssue): string {
  const key = issue.path.length ? String(issue.path[issue.path.length - 1]) : "";
  const label = FIELD_LABELS[key] ?? (key || "Value");
  if (issue.code === "invalid_type" && issue.received === "undefined") return `${label} is required`;
  if (issue.code === "too_small") {
    if ((issue as { type?: string }).type === "string") return `${label} is required`;
    return `${label} must be greater than ${issue.minimum}`;
  }
  if (issue.code === "invalid_type") return `${label} is invalid`;
  return `${label}: ${issue.message}`;
}

export function errorHandler(
  err: unknown,
  _req: Request,
  res: Response,
  _next: NextFunction
) {
  if (err instanceof ZodError) {
    const message = Array.from(new Set(err.issues.map(humanizeZodIssue))).join("; ") || "Please check the entered values";
    return res.status(400).json({ error: message, details: err.flatten() });
  }
  if (err instanceof HttpError) {
    return res.status(err.status).json({ error: err.message, details: err.details });
  }
  // eslint-disable-next-line no-console
  console.error(err);
  return res.status(500).json({ error: "Internal server error" });
}
