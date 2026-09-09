"use client";

import { useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { apiFetch, ApiError } from "@/lib/api";

export default function ProfilePage() {
  const { user } = useAuth();
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const canSubmit = current.length > 0 && next.length >= 8 && next === confirm && !busy;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setDone(false);
    if (next !== confirm) { setError("New passwords do not match."); return; }
    if (next.length < 8) { setError("New password must be at least 8 characters."); return; }
    setBusy(true);
    try {
      await apiFetch("/api/auth/change-password", {
        method: "POST",
        body: { currentPassword: current, newPassword: next },
      });
      setDone(true);
      setCurrent(""); setNext(""); setConfirm("");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not change password.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="max-w-lg">
      <h1 className="text-[18px] font-semibold text-slate-900 mb-1">My Profile</h1>
      <p className="text-[12px] text-slate-500 mb-4">Your account details and password.</p>

      <div className="bg-white border border-slate-200 rounded-md p-4 mb-4">
        <dl className="grid grid-cols-3 gap-y-2 text-[13px]">
          <dt className="text-slate-500">Name</dt><dd className="col-span-2 text-slate-900">{user?.name ?? "—"}</dd>
          <dt className="text-slate-500">Email</dt><dd className="col-span-2 text-slate-900">{user?.email ?? "—"}</dd>
          <dt className="text-slate-500">Role</dt><dd className="col-span-2 text-slate-900">{(user?.roleName ?? user?.role ?? "—").replace(/_/g, " ")}</dd>
        </dl>
      </div>

      <form onSubmit={submit} className="bg-white border border-slate-200 rounded-md p-4 space-y-3">
        <h2 className="text-[14px] font-semibold text-slate-900">Change password</h2>
        <label className="block">
          <span className="text-[12px] text-slate-600">Current password</span>
          <input type="password" autoComplete="current-password" value={current} onChange={(e) => setCurrent(e.target.value)}
            className="mt-1 h-9 w-full px-2 rounded border border-slate-200 text-[13px]" />
        </label>
        <label className="block">
          <span className="text-[12px] text-slate-600">New password</span>
          <input type="password" autoComplete="new-password" value={next} onChange={(e) => setNext(e.target.value)}
            className="mt-1 h-9 w-full px-2 rounded border border-slate-200 text-[13px]" />
          <span className="text-[11px] text-slate-400">At least 8 characters.</span>
        </label>
        <label className="block">
          <span className="text-[12px] text-slate-600">Confirm new password</span>
          <input type="password" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)}
            className="mt-1 h-9 w-full px-2 rounded border border-slate-200 text-[13px]" />
          {confirm.length > 0 && next !== confirm && <span className="text-[11px] text-rose-600">Passwords do not match.</span>}
        </label>

        {error && <p className="text-[12px] text-rose-600">{error}</p>}
        {done && <p className="text-[12px] text-emerald-700">Password changed successfully.</p>}

        <button type="submit" disabled={!canSubmit}
          className="h-9 px-4 rounded bg-blue-800 text-white text-[13px] font-medium hover:bg-blue-900 disabled:opacity-50">
          {busy ? "Saving…" : "Update password"}
        </button>
      </form>
    </div>
  );
}
