"use client";

import { useState } from "react";
import Link from "next/link";
import { useApi } from "@/lib/hooks";
import { apiFetch, ApiError } from "@/lib/api";

import { formatINR, formatDate } from "@/lib/format";
import { Search } from "lucide-react";

interface ReadyToInvoiceJob {
  id: string;
  status: string;
  product: { serialNo: string; designName: string };
  customer?: { name: string } | null;
  estimate?: {
    id: string;
    netAmount: string;
    gstAmount: string;
  } | null;
}

interface InvoiceRow {
  id: string; // order id
  invoiceNo: string;
  invoicedAt: string;
  invoiceAmount: string;
  invoiceGstAmt: string;
  invoiceNetAmt: string;
  status: string;
  customer?: { name: string } | null;
  product: { serialNo: string; designName: string };
  jobCards: { id: string; dispatchMode: string | null; dispatchTracking: string | null }[];
}

export default function DispatchPage() {
  const [search, setSearch] = useState("");
  const { data: readyJobs, mutate: mutateReady } = useApi<ReadyToInvoiceJob[]>("/api/dispatch/ready-to-invoice");
  const { data: invoices, mutate: mutateInvoices } = useApi<InvoiceRow[]>(
    `/api/dispatch/invoices${search ? `?search=${encodeURIComponent(search)}` : ""}`
  );
  const [creatingId, setCreatingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function createInvoice(job: ReadyToInvoiceJob) {
    if (!job.estimate) return;
    setCreatingId(job.id);
    setError(null);
    try {
      await apiFetch(`/api/dispatch/${job.id}/create-invoice`, {
        method: "POST",
        body: {
          estimateId: job.estimate.id,
          invoiceAmount: Number(job.estimate.netAmount) - Number(job.estimate.gstAmount),
          invoiceGstAmt: Number(job.estimate.gstAmount),
          invoiceNetAmt: Number(job.estimate.netAmount),
        },
      });
      await Promise.all([mutateReady(), mutateInvoices()]);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to create invoice");
    } finally {
      setCreatingId(null);
    }
  }

  return (
    <div className="flex flex-col h-full">
      <div className="mb-3.5">
        <div className="flex items-center gap-1.5 text-[11px] font-medium text-slate-500 mb-1.5">
          <span>Finance</span>
          <span className="text-slate-300">/</span>
          <span className="text-slate-900">Dispatch</span>
        </div>
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-[19px] font-semibold text-slate-900 leading-tight">Dispatch & Invoicing</h1>
            <div className="text-[12px] text-slate-500 mt-0.5">
              {invoices ? `${invoices.length} invoices` : "Loading..."}
            </div>
          </div>
        </div>
      </div>

      {error && <div className="mb-3.5 p-3 rounded-md bg-red-50 text-red-600 text-sm border border-red-200">{error}</div>}

      {readyJobs && readyJobs.length > 0 && (
        <div className="mb-4 bg-amber-50 border border-amber-200 rounded-md p-3">
          <div className="text-[11px] uppercase tracking-wider text-amber-800 font-semibold mb-2">
            Dispatched — Ready to Invoice ({readyJobs.length})
          </div>
          <div className="space-y-1.5">
            {readyJobs.map((j) => (
              <div key={j.id} className="flex items-center gap-2 bg-white border border-amber-100 rounded px-2.5 py-1.5">
                <div className="flex-1 min-w-0">
                  <span className="mono text-blue-800 text-[12px]">{j.id}</span>
                  <span className="text-[12px] text-slate-700"> · {j.product.designName}</span>
                  <div className="text-[10.5px] text-slate-400">
                    {j.customer?.name ?? "No Party"}
                    {j.estimate && ` · ${formatINR(Number(j.estimate.netAmount))} payable (incl. GST)`}
                  </div>
                </div>
                {j.estimate && (
                  <Link
                    href={`/costing/${j.estimate.id}`}
                    className="h-6 px-2 rounded border border-slate-200 text-[10.5px] text-slate-700 hover:bg-slate-50 flex items-center"
                  >
                    Open Final Costing
                  </Link>
                )}
                <button
                  onClick={() => createInvoice(j)}
                  disabled={creatingId === j.id || !j.estimate}
                  className="h-6 px-2 rounded bg-blue-800 text-white text-[10.5px] hover:bg-blue-900 disabled:opacity-50"
                >
                  {creatingId === j.id ? "Creating..." : "Create Invoice"}
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="flex items-center gap-2 mb-3.5">
        <div className="relative flex-1 max-w-md">
          <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            placeholder="Filter by invoice no., job, customer…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full h-8 pl-8 pr-3 text-[12px] border border-slate-200 rounded outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
          />
        </div>
      </div>

      <div className="flex-1 overflow-auto bg-white border border-slate-200 rounded-md">
        <table className="w-full border-collapse">
          <thead className="sticky top-0 z-10 bg-slate-50 border-b border-slate-200">
            <tr>
              <th className="px-3 py-2 text-left text-[10px] uppercase tracking-wider font-semibold text-slate-500">Invoice No.</th>
              <th className="px-3 py-2 text-left text-[10px] uppercase tracking-wider font-semibold text-slate-500">Job</th>
              <th className="px-3 py-2 text-left text-[10px] uppercase tracking-wider font-semibold text-slate-500">Customer</th>
              <th className="px-3 py-2 text-left text-[10px] uppercase tracking-wider font-semibold text-slate-500">Date</th>
              <th className="px-3 py-2 text-right text-[10px] uppercase tracking-wider font-semibold text-slate-500">Amount</th>
              <th className="px-3 py-2 text-right text-[10px] uppercase tracking-wider font-semibold text-slate-500">GST (3%)</th>
              <th className="px-3 py-2 text-right text-[10px] uppercase tracking-wider font-semibold text-slate-500">Net Payable</th>
              <th className="px-3 py-2 text-left text-[10px] uppercase tracking-wider font-semibold text-slate-500">Dispatch Mode</th>
              <th className="px-3 py-2 text-left text-[10px] uppercase tracking-wider font-semibold text-slate-500">Tracking</th>
              <th className="px-3 py-2 text-left text-[10px] uppercase tracking-wider font-semibold text-slate-500">Status</th>
            </tr>
          </thead>
          <tbody>
            {invoices?.map((inv) => {
              const jobCard = inv.jobCards?.[0];
              return (
                <tr key={inv.id} className="border-b border-slate-100 h-9 hover:bg-slate-50 cursor-pointer">
                  <td className="px-3 text-[12px] mono text-blue-800">{inv.invoiceNo}</td>
                  <td className="px-3 text-[12px] mono text-slate-700">{jobCard?.id ?? "—"}</td>
                  <td className="px-3 text-[12px] text-slate-900">{inv.customer?.name ?? "—"}</td>
                  <td className="px-3 text-[12px] text-slate-600 tabular">{formatDate(inv.invoicedAt).split(",")[0]}</td>
                  <td className="px-3 text-[12px] text-right tabular mono">{formatINR(Number(inv.invoiceAmount))}</td>
                  <td className="px-3 text-[12px] text-right tabular mono">{formatINR(Number(inv.invoiceGstAmt))}</td>
                  <td className="px-3 text-[12px] text-right tabular mono font-medium">{formatINR(Number(inv.invoiceNetAmt))}</td>
                  <td className="px-3 text-[12px] text-slate-600">{jobCard?.dispatchMode ?? "Pending"}</td>
                  <td className="px-3 text-[12px] text-slate-600 mono">{jobCard?.dispatchTracking ?? "—"}</td>
                  <td className="px-3">
                    <InvoiceStatusPill status={inv.status} />
                  </td>
                </tr>
              );
            })}
            {invoices?.length === 0 && (
              <tr>
                <td colSpan={10} className="py-8 text-center text-slate-500 text-[12px]">
                  {search ? "No invoices match your search." : "No invoices found."}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function InvoiceStatusPill({ status }: { status: string }) {
  const isPaid = status === "PAID" || status === "SETTLED";
  return (
    <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wide ${isPaid ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-100 text-slate-600'}`}>
      {status}
    </span>
  );
}
