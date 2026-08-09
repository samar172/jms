import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

export interface Crumb {
  label: string;
  /** Parent route. Omit on the last (current) crumb, or to render as plain text. */
  href?: string;
}

/**
 * A compact breadcrumb trail for deep pages (e.g. Job Cards › NK-18K-2607-0042).
 * The last crumb renders as the current page (non-link). Intended to sit
 * above a page title — usually via `<PageHeader breadcrumbs={...} />`.
 */
export function Breadcrumbs({ items, className }: { items: Crumb[]; className?: string }) {
  if (!items.length) return null;
  return (
    <nav
      aria-label="Breadcrumb"
      className={cn("flex items-center gap-1 text-sm text-muted-foreground", className)}
    >
      {items.map((c, i) => {
        const last = i === items.length - 1;
        return (
          <span key={`${c.label}-${i}`} className="flex items-center gap-1 min-w-0">
            {c.href && !last ? (
              <Link
                href={c.href}
                className="truncate hover:text-foreground transition-colors"
              >
                {c.label}
              </Link>
            ) : (
              <span
                className={cn("truncate", last && "font-medium text-foreground")}
                aria-current={last ? "page" : undefined}
              >
                {c.label}
              </span>
            )}
            {!last && <ChevronRight className="h-3.5 w-3.5 shrink-0 opacity-60" />}
          </span>
        );
      })}
    </nav>
  );
}
