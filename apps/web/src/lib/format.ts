export { formatINR } from "@jms/shared";

export function formatWeight(g: number | string | null | undefined): string {
  if (g === null || g === undefined) return "—";
  return `${Number(g).toFixed(3)} g`;
}

export function formatCarat(ct: number | string | null | undefined): string {
  if (ct === null || ct === undefined) return "—";
  return `${Number(ct).toFixed(3)} crt`;
}

export function formatPct(pct: number | string | null | undefined): string {
  if (pct === null || pct === undefined) return "—";
  return `${Number(pct).toFixed(2)}%`;
}

export function formatDate(d: string | Date | null | undefined): string {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}

export function formatDateTime(d: string | Date | null | undefined): string {
  if (!d) return "—";
  return new Date(d).toLocaleString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}
