"use client";

import { useState } from "react";
import { mutate } from "swr";
import { apiFetch, ApiError } from "@/lib/api";

export function AddCustomerForm({ onCreated, onCancel }: { onCreated: (customer: any) => void; onCancel: () => void }) {
  const [name, setName] = useState("");
  const [contact, setContact] = useState("");
  const [address, setAddress] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    if (!name.trim()) {
      setError("Name is required");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const customer = await apiFetch("/api/masters/customers", {
        method: "POST",
        body: { name, contact: contact || undefined, address: address || undefined },
      });
      setName("");
      setContact("");
      setAddress("");
      mutate("/api/masters/customers");
      onCreated(customer);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to add customer");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex flex-wrap items-end gap-2">
      <div>
        <label className="console-field-label">Name <span className="text-err-tx">*</span></label>
        <input className="console-field w-40" value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && submit()} />
      </div>
      <div>
        <label className="console-field-label">Contact (optional)</label>
        <input className="console-field w-36" value={contact} onChange={(e) => setContact(e.target.value)} />
      </div>
      <div>
        <label className="console-field-label">Address (optional)</label>
        <input className="console-field w-48" value={address} onChange={(e) => setAddress(e.target.value)} />
      </div>
      <button type="button" className="console-btn primary" disabled={submitting} onClick={submit}>
        Save
      </button>
      <button type="button" className="console-btn" onClick={onCancel}>
        Cancel
      </button>
      {error && <div className="text-err-tx text-xs w-full mt-1">{error}</div>}
    </div>
  );
}
