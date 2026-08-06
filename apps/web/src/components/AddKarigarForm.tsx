"use client";

import { useState } from "react";
import { apiFetch, ApiError } from "@/lib/api";
import type { Karigar } from "@/lib/hooks";

export function AddKarigarForm({
  onCreated,
  onCancel,
}: {
  onCreated: (karigar: Karigar) => void;
  onCancel?: () => void;
}) {
  const [name, setName] = useState("");
  const [employmentType, setEmploymentType] = useState<"IN_HOUSE" | "EXTERNAL">("IN_HOUSE");
  const [contactNumber, setContactNumber] = useState("");
  const [specialization, setSpecialization] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const karigar = await apiFetch<Karigar>("/api/masters/karigars", {
        method: "POST",
        body: {
          name,
          employmentType,
          contactNumber: contactNumber || undefined,
          specialization: specialization || undefined,
        },
      });
      setName("");
      setContactNumber("");
      setSpecialization("");
      onCreated(karigar);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to add karigar");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={submit} className="flex flex-wrap items-end gap-2">
      <div>
        <label className="label">Name</label>
        <input required className="input w-40" value={name} onChange={(e) => setName(e.target.value)} />
      </div>
      <div>
        <label className="label">Type</label>
        <select
          className="input"
          value={employmentType}
          onChange={(e) => setEmploymentType(e.target.value as "IN_HOUSE" | "EXTERNAL")}
        >
          <option value="IN_HOUSE">In-house</option>
          <option value="EXTERNAL">External</option>
        </select>
      </div>
      <div>
        <label className="label">Contact (optional)</label>
        <input className="input w-36" value={contactNumber} onChange={(e) => setContactNumber(e.target.value)} />
      </div>
      <div>
        <label className="label">Specialisation (optional)</label>
        <input className="input w-40" value={specialization} onChange={(e) => setSpecialization(e.target.value)} />
      </div>
      <button className="btn btn-primary" disabled={submitting}>
        {submitting ? "Adding…" : "+ Add Karigar"}
      </button>
      {onCancel && (
        <button type="button" className="btn btn-ghost" onClick={onCancel}>
          Cancel
        </button>
      )}
      {error && <p className="text-sm text-danger w-full">{error}</p>}
    </form>
  );
}
