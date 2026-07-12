"use client";

import Link from "next/link";
import { useKarigars } from "@/lib/hooks";

export default function KarigarsPage() {
  const { data: karigars } = useKarigars();

  return (
    <div className="space-y-5">
      <h1 className="text-xl font-semibold">Karigars</h1>
      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {karigars?.map((k) => (
          <Link key={k.id} href={`/karigars/${k.id}`} className="card p-4 flex items-center gap-3 hover:shadow-md">
            <div className="w-12 h-12 rounded-full bg-gold-tint text-gold flex items-center justify-center font-semibold">
              {k.name.charAt(0)}
            </div>
            <div>
              <div className="font-medium">{k.name}</div>
              <div className="text-xs text-text-muted">
                {k.code} · {k.employmentType === "IN_HOUSE" ? "In-house" : "External"}
              </div>
              {k.specialization && <div className="text-xs text-text-muted">{k.specialization}</div>}
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
