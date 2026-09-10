"use client";

import { useState } from "react";
import { downloadAuthenticated, ApiError } from "@/lib/api";

export default function BackupPage() {
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [busy, setBusy] = useState<"" | "all" | "range">("");
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);

  async function run(kind: "all" | "range") {
    setError(null); setOk(null);
    if (kind === "range" && !from && !to) { setError("Choose at least a From or To date."); return; }
    setBusy(kind);
    try {
      const qs = kind === "all"
        ? "scope=all"
        : `scope=range${from ? `&from=${from}` : ""}${to ? `&to=${to}` : ""}`;
      await downloadAuthenticated(`/api/backup?${qs}`, `jms-backup-${kind}.json`);
      setOk(kind === "all" ? "Full backup downloaded." : "Date-range backup downloaded.");
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Backup failed.");
    } finally {
      setBusy("");
    }
  }

  return (
    <div className="max-w-xl">
      <h1 className="text-[18px] font-semibold text-slate-900 mb-1">Backup</h1>
      <p className="text-[12px] text-slate-500 mb-4">
        Download a snapshot of your data as a JSON file. Keep it somewhere safe. Passwords are never included.
      </p>

      <div className="bg-white border border-slate-200 rounded-md p-4 mb-3">
        <h2 className="text-[14px] font-semibold text-slate-900">Entire backup</h2>
        <p className="text-[12px] text-slate-500 mb-3">Everything — karigars, designs, all job cards & ledgers, settings, roles, users, and the audit log.</p>
        <button onClick={() => run("all")} disabled={!!busy}
          className="h-9 px-4 rounded bg-blue-800 text-white text-[13px] font-medium hover:bg-blue-900 disabled:opacity-50">
          {busy === "all" ? "Preparing…" : "Download entire backup"}
        </button>
      </div>

      <div className="bg-white border border-slate-200 rounded-md p-4">
        <h2 className="text-[14px] font-semibold text-slate-900">Date-range backup</h2>
        <p className="text-[12px] text-slate-500 mb-3">Master data (karigars, designs, settings) plus only the job cards, bulk stock movements and audit entries created in this period.</p>
        <div className="flex flex-wrap items-end gap-3">
          <label className="text-[12px] text-slate-600">From
            <input type="date" value={from} onChange={(e) => setFrom(e.target.value)}
              className="mt-1 block h-9 px-2 rounded border border-slate-200 text-[13px]" />
          </label>
          <label className="text-[12px] text-slate-600">To
            <input type="date" value={to} onChange={(e) => setTo(e.target.value)}
              className="mt-1 block h-9 px-2 rounded border border-slate-200 text-[13px]" />
          </label>
          <button onClick={() => run("range")} disabled={!!busy}
            className="h-9 px-4 rounded bg-emerald-600 text-white text-[13px] font-medium hover:bg-emerald-700 disabled:opacity-50">
            {busy === "range" ? "Preparing…" : "Download date-range backup"}
          </button>
        </div>
      </div>

      {error && <p className="text-[12px] text-rose-600 mt-3">{error}</p>}
      {ok && <p className="text-[12px] text-emerald-700 mt-3">{ok}</p>}
    </div>
  );
}
