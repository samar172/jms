"use client";

import { useMemo, useState } from "react";
import { useApi } from "@/lib/hooks";
import { apiFetch, ApiError } from "@/lib/api";

interface RoleRow {
  id: string;
  name: string;
  description: string | null;
  isSystem: boolean;
  isSuperAdmin: boolean;
  userCount: number;
  permissions: string[]; // "resource:action"
}
interface Meta {
  resources: { key: string; label: string; actions: string[] }[];
  actions: { key: string; label: string }[];
}

export default function RolesPage() {
  const { data: roles, mutate } = useApi<RoleRow[]>("/api/roles");
  const { data: meta } = useApi<Meta>("/api/roles/meta");
  const [editing, setEditing] = useState<null | { mode: "new" | "edit"; role?: RoleRow }>(null);

  return (
    <div className="flex flex-col">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-[18px] font-semibold text-slate-900">Roles &amp; Permissions</h1>
          <p className="text-[12px] text-slate-500">
            Create roles and grant each what it can view, add, update or delete.
          </p>
        </div>
        <button
          onClick={() => setEditing({ mode: "new" })}
          className="h-8 px-3 rounded bg-blue-800 text-white text-[12px] font-medium hover:bg-blue-900"
        >
          + New Role
        </button>
      </div>

      <div className="bg-white border border-slate-200 rounded-md overflow-hidden">
        <table className="w-full border-collapse">
          <thead className="bg-slate-50">
            <tr className="h-9 text-left border-b border-slate-200">
              {["Role", "Description", "Users", "Permissions", ""].map((h) => (
                <th key={h} className="px-3 text-[10px] uppercase tracking-wider text-slate-500 font-semibold">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {!roles && (
              <tr><td colSpan={5} className="py-8 text-center text-[12px] text-slate-400">Loading…</td></tr>
            )}
            {roles?.map((r) => (
              <tr key={r.id} className="border-b border-slate-50 h-11">
                <td className="px-3 text-[12px] font-medium text-slate-900">
                  {r.name}
                  {r.isSystem && <span className="ml-2 text-[9px] uppercase tracking-wide text-slate-400">built-in</span>}
                  {r.isSuperAdmin && <span className="ml-2 text-[9px] uppercase tracking-wide text-amber-600">full access</span>}
                </td>
                <td className="px-3 text-[11px] text-slate-500">{r.description ?? "—"}</td>
                <td className="px-3 text-[11px] mono text-slate-600">{r.userCount}</td>
                <td className="px-3 text-[11px] mono text-slate-500">
                  {r.isSuperAdmin ? "everything" : `${r.permissions.length} granted`}
                </td>
                <td className="px-3 text-right">
                  {!r.isSuperAdmin && (
                    <button
                      onClick={() => setEditing({ mode: "edit", role: r })}
                      className="text-[11px] text-blue-700 hover:underline"
                    >
                      Edit
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {editing && meta && (
        <RoleEditor
          mode={editing.mode}
          role={editing.role}
          meta={meta}
          onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); mutate(); }}
        />
      )}
    </div>
  );
}

function RoleEditor({
  mode, role, meta, onClose, onSaved,
}: {
  mode: "new" | "edit";
  role?: RoleRow;
  meta: Meta;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState(role?.name ?? "");
  const [description, setDescription] = useState(role?.description ?? "");
  const [granted, setGranted] = useState<Set<string>>(new Set(role?.permissions ?? []));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const toggle = (key: string) =>
    setGranted((prev) => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });

  const setRow = (resource: string, actions: string[], on: boolean) =>
    setGranted((prev) => {
      const next = new Set(prev);
      for (const a of actions) {
        const k = `${resource}:${a}`;
        on ? next.add(k) : next.delete(k);
      }
      return next;
    });

  const permissions = useMemo(
    () => [...granted].map((k) => {
      const [resource, action] = k.split(":");
      return { resource, action };
    }),
    [granted],
  );

  async function save() {
    setBusy(true); setError(null);
    try {
      if (mode === "new") {
        await apiFetch("/api/roles", { method: "POST", body: { name, description: description || undefined, permissions } });
      } else {
        await apiFetch(`/api/roles/${role!.id}`, { method: "PATCH", body: { name, description: description || null, permissions } });
      }
      onSaved();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Could not save the role.");
    } finally { setBusy(false); }
  }

  async function remove() {
    if (!role) return;
    setBusy(true); setError(null);
    try {
      await apiFetch(`/api/roles/${role.id}`, { method: "DELETE" });
      onSaved();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Could not delete the role.");
      setBusy(false);
    }
  }

  const nameLocked = role?.isSystem ?? false;

  return (
    <div className="fixed inset-0 bg-black/30 flex items-start justify-center z-50 overflow-auto py-8" onClick={onClose}>
      <div className="bg-white rounded-lg w-[680px] max-w-[95vw] shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="px-4 py-3 border-b border-slate-100">
          <h2 className="text-[14px] font-semibold">{mode === "new" ? "New Role" : `Edit ${role?.name}`}</h2>
          {nameLocked && <p className="text-[11px] text-slate-500">Built-in role — name is fixed, permissions are editable.</p>}
        </div>

        <div className="p-4 space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className="text-[11px] text-slate-600">Name</span>
              <input value={name} disabled={nameLocked} onChange={(e) => setName(e.target.value)}
                className="mt-1 h-8 w-full px-2 rounded border border-slate-200 text-[12px] disabled:bg-slate-50" />
            </label>
            <label className="block">
              <span className="text-[11px] text-slate-600">Description</span>
              <input value={description} onChange={(e) => setDescription(e.target.value)}
                className="mt-1 h-8 w-full px-2 rounded border border-slate-200 text-[12px]" />
            </label>
          </div>

          <div className="border border-slate-200 rounded overflow-hidden">
            <table className="w-full border-collapse">
              <thead className="bg-slate-50">
                <tr className="h-8 text-left border-b border-slate-200">
                  <th className="px-3 text-[10px] uppercase tracking-wider text-slate-500 font-semibold">Panel</th>
                  {meta.actions.map((a) => (
                    <th key={a.key} className="px-2 text-[10px] uppercase tracking-wider text-slate-500 font-semibold text-center w-16">{a.label}</th>
                  ))}
                  <th className="px-2 w-12" />
                </tr>
              </thead>
              <tbody>
                {meta.resources.map((res) => {
                  const allOn = res.actions.every((a) => granted.has(`${res.key}:${a}`));
                  return (
                    <tr key={res.key} className="border-b border-slate-50 h-9">
                      <td className="px-3 text-[12px] text-slate-800">{res.label}</td>
                      {meta.actions.map((a) => {
                        const supported = res.actions.includes(a.key);
                        const key = `${res.key}:${a.key}`;
                        return (
                          <td key={a.key} className="px-2 text-center">
                            {supported ? (
                              <input type="checkbox" checked={granted.has(key)} onChange={() => toggle(key)} />
                            ) : (
                              <span className="text-slate-300">—</span>
                            )}
                          </td>
                        );
                      })}
                      <td className="px-2 text-center">
                        <button
                          onClick={() => setRow(res.key, res.actions, !allOn)}
                          className="text-[10px] text-blue-700 hover:underline"
                        >
                          {allOn ? "none" : "all"}
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {error && <p className="text-[12px] text-rose-600">{error}</p>}
        </div>

        <div className="px-4 py-3 border-t border-slate-100 flex items-center justify-between">
          <div>
            {mode === "edit" && !role?.isSystem && (
              <button onClick={remove} disabled={busy} className="h-8 px-3 rounded border border-rose-200 text-rose-700 text-[12px] hover:bg-rose-50 disabled:opacity-50">
                Delete role
              </button>
            )}
          </div>
          <div className="flex gap-2">
            <button onClick={onClose} className="h-8 px-3 rounded border border-slate-200 text-[12px]">Cancel</button>
            <button onClick={save} disabled={busy || name.trim().length < 2} className="h-8 px-3 rounded bg-blue-800 text-white text-[12px] font-medium disabled:opacity-50">
              {busy ? "Saving…" : "Save"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
