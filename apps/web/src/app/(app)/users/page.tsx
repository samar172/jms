"use client";

import { useState } from "react";
import { useApi } from "@/lib/hooks";
import { apiFetch, ApiError } from "@/lib/api";
import { formatDate } from "@/lib/format";

const ROLES = ["SUPER_ADMIN", "MANAGER", "COSTING", "STORE", "PRODUCTION", "SALES", "KARIGAR", "AUDITOR"] as const;

interface UserRow {
  id: string;
  email: string;
  name: string;
  role: (typeof ROLES)[number];
  isActive: boolean;
  karigarId: string | null;
  createdAt: string;
}

export default function UsersPage() {
  const { data: users, mutate } = useApi<UserRow[]>("/api/users");
  const [showAdd, setShowAdd] = useState(false);
  const [tempPassword, setTempPassword] = useState<{ email: string; password: string } | null>(null);

  async function updateRole(id: string, role: string) {
    await apiFetch(`/api/users/${id}`, { method: "PATCH", body: { role } });
    await mutate();
  }

  async function toggleActive(u: UserRow) {
    await apiFetch(`/api/users/${u.id}`, { method: "PATCH", body: { isActive: !u.isActive } });
    await mutate();
  }

  async function resetPassword(id: string, email: string) {
    const res = await apiFetch<{ temporaryPassword: string }>(`/api/users/${id}/reset-password`, { method: "POST" });
    setTempPassword({ email, password: res.temporaryPassword });
  }

  return (
    <div>
      <div className="mb-2">
        <div className="text-[11px] text-mute mb-1">Admin</div>
        <h1 className="text-[19px] font-semibold flex items-center gap-2.5 text-ink">
          Users &amp; Roles
          <span className="text-xs text-mute font-medium">{users ? `${users.length} users` : ""}</span>
        </h1>
      </div>

      <div className="flex items-center gap-2 py-2.5 border-t border-b border-line -mx-3.5 px-3.5 sm:-mx-[18px] sm:px-[18px] mb-3.5">
        <button className="console-btn primary" onClick={() => setShowAdd((v) => !v)}>
          {showAdd ? "Cancel" : "+ New User"}
        </button>
      </div>

      {tempPassword && (
        <div className="console-panel p-3.5 mb-3.5" style={{ background: "var(--color-ok-bg)", borderColor: "var(--color-ok-bd)" }}>
          <div className="text-[11px] font-bold uppercase text-ok-tx tracking-wide mb-1">Temporary password issued</div>
          <p className="text-[12.5px] text-ink">
            {tempPassword.email}: <span className="mono font-semibold">{tempPassword.password}</span> — share this out-of-band and ask the user to change it on first login.
          </p>
          <button className="text-xs text-accent mt-1" onClick={() => setTempPassword(null)}>
            Dismiss
          </button>
        </div>
      )}

      {showAdd && (
        <div className="console-panel p-3.5 mb-3.5">
          <AddUserForm
            onCreated={(res) => {
              setShowAdd(false);
              if (res.temporaryPassword) setTempPassword({ email: res.email, password: res.temporaryPassword });
              mutate();
            }}
            onCancel={() => setShowAdd(false)}
          />
        </div>
      )}

      <div className="console-panel overflow-hidden">
        <div className="overflow-x-auto">
          <table className="console-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Email</th>
                <th>Role</th>
                <th>Status</th>
                <th>Created</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {users?.map((u) => (
                <tr key={u.id}>
                  <td className="font-medium text-ink">{u.name}</td>
                  <td className="text-ink2">{u.email}</td>
                  <td>
                    <select className="console-field w-auto" value={u.role} onChange={(e) => updateRole(u.id, e.target.value)}>
                      {ROLES.map((r) => (
                        <option key={r} value={r}>
                          {r.replace(/_/g, " ")}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td>
                    <button
                      className={`console-pill ${u.isActive ? "ok" : "neu"}`}
                      onClick={() => toggleActive(u)}
                      title="Click to toggle"
                    >
                      {u.isActive ? "Active" : "Deactivated"}
                    </button>
                  </td>
                  <td className="text-ink2">{formatDate(u.createdAt)}</td>
                  <td className="text-right">
                    <button className="text-accent text-xs" onClick={() => resetPassword(u.id, u.email)}>
                      Reset Password
                    </button>
                  </td>
                </tr>
              ))}
              {users?.length === 0 && (
                <tr>
                  <td colSpan={6} className="py-8 text-center text-mute">
                    No users yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function AddUserForm({
  onCreated,
  onCancel,
}: {
  onCreated: (res: { email: string; temporaryPassword?: string }) => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<(typeof ROLES)[number]>("SALES");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const res = await apiFetch<{ email: string; temporaryPassword?: string }>("/api/users", {
        method: "POST",
        body: { name, email, role },
      });
      onCreated(res);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to create user");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={submit} className="flex flex-wrap items-end gap-2">
      <div>
        <label className="console-field-label">Name</label>
        <input required className="console-field w-40" value={name} onChange={(e) => setName(e.target.value)} />
      </div>
      <div>
        <label className="console-field-label">Email</label>
        <input required type="email" className="console-field w-56" value={email} onChange={(e) => setEmail(e.target.value)} />
      </div>
      <div>
        <label className="console-field-label">Role</label>
        <select className="console-field" value={role} onChange={(e) => setRole(e.target.value as typeof role)}>
          {ROLES.map((r) => (
            <option key={r} value={r}>
              {r.replace(/_/g, " ")}
            </option>
          ))}
        </select>
      </div>
      <button className="console-btn primary" disabled={submitting}>
        {submitting ? "Creating…" : "Create User"}
      </button>
      <button type="button" className="console-btn" onClick={onCancel}>
        Cancel
      </button>
      {error && <p className="text-sm text-err-tx w-full">{error}</p>}
    </form>
  );
}
