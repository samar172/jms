"use client";

import { use, useState } from "react";
import Link from "next/link";
import { useApi } from "@/lib/hooks";
import { apiFetch, ApiError, resolveMediaUrl } from "@/lib/api";
import { ProductStatusPill, JobStageStatusPill, EstimateStatusPill } from "@/components/StatusPill";
import { formatINR, formatDate, formatDateTime } from "@/lib/format";

interface LedgerEntry {
  id: string;
  type: string;
  amount: string;
  note: string | null;
  createdAt: string;
}
interface JobStage {
  id: string;
  status: string;
  processStage: { name: string; sequenceOrder: number };
  karigar?: { name: string } | null;
}
interface JobCard {
  id: string;
  status: string;
  createdAt: string;
  stages: JobStage[];
}
interface Estimate {
  id: string;
  type: string;
  version: number;
  status: string;
  netAmount: string;
  createdAt: string;
}
interface CustomerProduct {
  id: string;
  serialNo: string;
  designName: string;
  status: string;
  createdAt: string;
  category: { name: string };
  images: { thumbnailUrl?: string; url: string }[];
  jobCards: JobCard[];
  estimates: Estimate[];
}
interface CustomerProfile {
  id: string;
  name: string;
  contact: string | null;
  address: string | null;
  products: CustomerProduct[];
  ledgerEntries: LedgerEntry[];
  balanceDue: number;
}

export default function CustomerDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { data: customer, mutate } = useApi<CustomerProfile>(`/api/ledger/customers/${id}/profile`);
  const [type, setType] = useState<"ADVANCE_RECEIVED" | "PAYMENT_RECEIVED">("PAYMENT_RECEIVED");
  const [amount, setAmount] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!customer) return <div className="text-text-muted">Loading…</div>;

  const allJobCards = customer.products.flatMap((p) => p.jobCards.map((jc) => ({ ...jc, product: p })));
  const allEstimates = customer.products
    .flatMap((p) => p.estimates.map((e) => ({ ...e, product: p })))
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  async function recordPayment(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      await apiFetch(`/api/ledger/customers/${id}/ledger`, { method: "POST", body: { type, amount: Number(amount) } });
      setAmount("");
      await mutate();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="text-sm text-text-muted">
        <Link href="/ledger" className="hover:text-gold">
          Ledger
        </Link>{" "}
        / {customer.name}
      </div>

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">{customer.name}</h1>
          <p className="text-text-muted text-sm">
            {customer.contact ?? "No contact on file"}
            {customer.address ? ` · ${customer.address}` : ""}
          </p>
        </div>
        <div
          className={`card px-4 py-2 text-right ${
            customer.balanceDue > 0 ? "border-danger" : customer.balanceDue < 0 ? "border-success" : ""
          }`}
        >
          <div className="text-xs text-text-muted">
            {customer.balanceDue > 0 ? "Owes" : customer.balanceDue < 0 ? "Advance held" : "Balance"}
          </div>
          <div className={`text-lg font-bold tabular ${customer.balanceDue > 0 ? "text-danger" : customer.balanceDue < 0 ? "text-success" : ""}`}>
            {formatINR(Math.abs(customer.balanceDue))}
          </div>
        </div>
      </div>

      <div className="grid lg:grid-cols-2 gap-5">
        <div className="card p-5">
          <h2 className="font-semibold mb-3">Designs Purchased / Purchase History</h2>
          {customer.products.length === 0 && <p className="text-sm text-text-muted">No products linked to this customer yet.</p>}
          <div className="space-y-2">
            {customer.products.map((p) => (
              <Link
                key={p.id}
                href={`/products/${p.serialNo}`}
                className="flex items-center gap-3 p-2 rounded-lg hover:bg-bg -mx-2"
              >
                <div className="w-10 h-10 rounded bg-gold-tint overflow-hidden shrink-0">
                  {p.images[0] && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={resolveMediaUrl(p.images[0].thumbnailUrl ?? p.images[0].url)} alt="" className="w-full h-full object-cover" />
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="font-mono text-gold text-sm">{p.serialNo}</div>
                  <div className="text-xs text-text-muted truncate">
                    {p.designName} · {p.category.name}
                  </div>
                </div>
                <ProductStatusPill status={p.status} />
              </Link>
            ))}
          </div>
        </div>

        <div className="card p-5">
          <h2 className="font-semibold mb-3">Job Cards</h2>
          {allJobCards.length === 0 && <p className="text-sm text-text-muted">No job cards yet.</p>}
          <div className="space-y-2">
            {allJobCards.map((jc) => (
              <Link key={jc.id} href={`/job-cards/${jc.id}`} className="flex items-center justify-between p-2 rounded-lg hover:bg-bg -mx-2">
                <div>
                  <div className="text-sm font-medium">{jc.product.designName}</div>
                  <div className="text-xs text-text-muted">{formatDate(jc.createdAt)}</div>
                </div>
                <span className="pill pill-neutral text-xs">{jc.status}</span>
              </Link>
            ))}
          </div>
        </div>

        <div className="card p-5">
          <h2 className="font-semibold mb-3">Costing History / Estimates</h2>
          {allEstimates.length === 0 && <p className="text-sm text-text-muted">No estimates yet.</p>}
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <tbody>
                {allEstimates.map((e) => (
                  <tr key={e.id} className="border-b border-border last:border-0">
                    <td className="py-1.5">
                      <Link href={`/costing/${e.id}`} className="text-gold hover:underline">
                        {e.product.serialNo}
                      </Link>
                      <div className="text-xs text-text-muted">
                        {e.type.replace(/_/g, " ")} v{e.version}
                      </div>
                    </td>
                    <td className="py-1.5">
                      <EstimateStatusPill status={e.status} />
                    </td>
                    <td className="py-1.5 text-right tabular font-medium">{formatINR(Number(e.netAmount))}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="card p-5">
          <h2 className="font-semibold mb-3">Outstanding Balance &amp; Payment History</h2>
          <form onSubmit={recordPayment} className="flex items-end gap-2 mb-3">
            <select className="input w-auto" value={type} onChange={(e) => setType(e.target.value as typeof type)}>
              <option value="PAYMENT_RECEIVED">Payment Received</option>
              <option value="ADVANCE_RECEIVED">Advance Received</option>
            </select>
            <input
              required
              type="number"
              step="0.01"
              placeholder="Amount"
              className="input w-32"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
            />
            <button className="btn btn-primary" disabled={submitting}>
              {submitting ? "Saving…" : "Record"}
            </button>
          </form>
          {error && <p className="text-sm text-danger mb-2">{error}</p>}
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <tbody>
                {customer.ledgerEntries.map((e) => (
                  <tr key={e.id} className="border-b border-border last:border-0">
                    <td className="py-1.5 text-text-muted">{formatDateTime(e.createdAt)}</td>
                    <td className="py-1.5">{e.type.replace(/_/g, " ")}</td>
                    <td className="py-1.5 text-right tabular">{formatINR(Number(e.amount))}</td>
                    <td className="py-1.5 text-text-muted">{e.note ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {customer.ledgerEntries.length === 0 && <p className="text-text-muted text-sm">No transactions yet.</p>}
        </div>
      </div>
    </div>
  );
}
