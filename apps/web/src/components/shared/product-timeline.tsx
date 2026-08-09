"use client";

import { useApi } from "@/lib/hooks";
import { formatDate } from "@/lib/format";

interface TimelineEntry {
  type: string;
  timestamp: string;
  description: string;
}

export function ProductTimeline({ productId }: { productId: string }) {
  const { data: timeline } = useApi<TimelineEntry[]>(`/api/products/${productId}/timeline`);

  return (
    <ol className="relative ml-2 space-y-4 border-l border-border">
      {timeline?.map((e, i) => (
        <li key={i} className="ml-4">
          <div className="absolute -ml-[21px] mt-1.5 size-2 rounded-full bg-primary" />
          <time className="text-xs text-muted-foreground">{formatDate(e.timestamp)}</time>
          <p className="text-sm">{e.description}</p>
        </li>
      ))}
      {(!timeline || timeline.length === 0) && <p className="ml-2 text-sm text-muted-foreground">No history yet.</p>}
    </ol>
  );
}
