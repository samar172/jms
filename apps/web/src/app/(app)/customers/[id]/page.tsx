"use client";

import { use, useState } from "react";
import Link from "next/link";
import { useApi } from "@/lib/hooks";
import { apiFetch, ApiError, resolveMediaUrl } from "@/lib/api";
import { ProductStatusPill, EstimateStatusPill } from "@/components/StatusPill";
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
  product: { serialNo: string; designName: string };
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
}
interface CustomerProfile {
  id: string;
  name: string;
  contact: string | null;
  address: string | null;
  products: CustomerProduct[];
  estimates: Estimate[];
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

  if (!customer) return <div className="text-mute">Loading…</div>;

  const allJobCards = customer.products.flatMap((p) => p.jobCards.map((jc) => ({ ...jc, product: p })));
  const allEstimates = customer.estimates;

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
    <div>
      <div className="mb-2">
        <div className="text-[11px] text-mute mb-1">
          <Link href="/ledger" className="hover:text-accent">
            Finance
          </Link>{" "}
          / {customer.name}
        </div>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-[19px] font-semibold text-ink">{customer.name}</h1>
            <p className="text-ink2 text-xs mt-0.5">
              {customer.contact ?? "No contact on file"}
              {customer.address ? ` · ${customer.address}` : ""}
            </p>
          </div>
          <div className="console-panel px-3.5 py-2 text-right">
            <div className="text-[10.5px] uppercase tracking-wide text-mute">
              {customer.balanceDue > 0 ? "Owes" : customer.balanceDue < 0 ? "Advance held" : "Balance"}
            </div>
            <div
              className="text-lg font-bold mono"
              style={{ color: customer.balanceDue > 0 ? "var(--color-err-tx)" : customer.balanceDue < 0 ? "var(--color-ok-tx)" : "var(--color-ink)" }}
            >
              {formatINR(Math.abs(customer.balanceDue))}
            </div>
          </div>
        </div>
      </div>

      <div className="grid lg:grid-cols-2 gap-3.5 mt-3.5">
        <div className="console-panel overflow-hidden">
          <div className="ph">Designs Purchased / Purchase History</div>
          <div className="p-1.5">
            {customer.products.length === 0 && <p className="text-sm text-mute p-2">No products linked to this customer yet.</p>}
            {customer.products.map((p) => (
              <Link key={p.id} href={`/products/${p.serialNo}`} className="flex items-center gap-3 p-2 rounded-md hover:bg-neu-bg">
                <div className="w-10 h-10 rounded bg-neu-bg overflow-hidden shrink-0">
                  {p.images[0] && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={resolveMediaUrl(p.images[0].thumbnailUrl ?? p.images[0].url)} alt="" className="w-full h-full object-cover" />
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="mono text-accent text-sm">{p.serialNo}</div>
                  <div className="text-xs text-mute truncate">
                    {p.designName} · {p.category.name}
                  </div>
                </div>
                <ProductStatusPill status={p.status} />
              </Link>
            ))}
          </div>
        </div>

        <div className="console-panel overflow-hidden">
          <div className="ph">Job Cards</div>
          <div className="p-1.5">
            {allJobCards.length === 0 && <p className="text-sm text-mute p-2">No job cards yet.</p>}
            {allJobCards.map((jc) => (
              <Link key={jc.id} href={`/job-cards/${jc.id}`} className="flex items-center justify-between p-2 rounded-md hover:bg-neu-bg">
                <div>
                  <div className="text-sm font-medium text-ink">{jc.product.designName}</div>
                  <div className="text-xs text-mute">{formatDate(jc.createdAt)}</div>
                </div>
                <span className="console-pill neu">{jc.status}</span>
              </Link>
            ))}
          </div>
        </div>

        <div className="console-panel overflow-hidden">
          <div className="ph">Costing History / Estimates</div>
          {allEstimates.length === 0 && <p className="text-sm text-mute p-3">No estimates yet.</p>}
          {allEstimates.length > 0 && (
            <div className="overflow-x-auto">
              <table className="console-table">
                <tbody>
                  {allEstimates.map((e) => (
                    <tr key={e.id}>
                      <td>
                        <Link href={`/costing/${e.id}`} className="rid">
                          {e.product.serialNo}
                        </Link>
                        <div className="text-xs text-mute">
                          {e.type.replace(/_/g, " ")} v{e.version}
                        </div>
                      </td>
                      <td>
                        <EstimateStatusPill status={e.status} />
                      </td>
                      <td className="num mono font-semibold">{formatINR(Number(e.netAmount))}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div className="console-panel overflow-hidden">
          <div className="ph">Outstanding Balance &amp; Payment History</div>
          <div className="p-3">
            <form onSubmit={recordPayment} className="flex items-end gap-2 mb-3">
              <select className="console-field w-auto" value={type} onChange={(e) => setType(e.target.value as typeof type)}>
                <option value="PAYMENT_RECEIVED">Payment Received</option>
                <option value="ADVANCE_RECEIVED">Advance Received</option>
              </select>
              <input
                required
                type="number"
                step="0.01"
                placeholder="Amount"
                className="console-field w-32"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
              />
              <button className="console-btn primary" disabled={submitting}>
                {submitting ? "Saving…" : "Record"}
              </button>
            </form>
            {error && <p className="text-sm text-err-tx mb-2">{error}</p>}
          </div>
          {customer.ledgerEntries.length > 0 && (
            <div className="overflow-x-auto">
              <table className="console-table">
                <tbody>
                  {customer.ledgerEntries.map((e) => (
                    <tr key={e.id}>
                      <td className="text-ink2">{formatDateTime(e.createdAt)}</td>
                      <td>{e.type.replace(/_/g, " ")}</td>
                      <td className="num mono">{formatINR(Number(e.amount))}</td>
                      <td className="text-ink2">{e.note ?? "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {customer.ledgerEntries.length === 0 && <p className="text-mute text-sm px-3 pb-3">No transactions yet.</p>}
        </div>
      </div>
    </div>
  );
}
