"use client";

import { useState, Fragment } from "react";
import Link from "next/link";
import { useApi, useCustomers, useStockLedgerEnabled, useKarats, useStoneTypes } from "@/lib/hooks";
import { apiFetch, ApiError } from "@/lib/api";
import { formatINR, formatWeight, formatDateTime } from "@/lib/format";

type Tab = "karigars" | "customers" | "stock";

export default function LedgerPage() {
  const { data: stockEnabled } = useStockLedgerEnabled();
  const [tab, setTab] = useState<Tab>("karigars");

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-semibold">Ledger</h1>
        <p className="text-sm text-text-muted">
          The full khata — gold and money movement across karigars, customers{stockEnabled?.enabled ? " and store stock" : ""}.
        </p>
      </div>

      <div className="flex gap-2 border-b border-border">
        <TabButton active={tab === "karigars"} onClick={() => setTab("karigars")}>
          Karigars
        </TabButton>
        <TabButton active={tab === "customers"} onClick={() => setTab("customers")}>
          Customers
        </TabButton>
        {stockEnabled?.enabled && (
          <TabButton active={tab === "stock"} onClick={() => setTab("stock")}>
            Store Stock
          </TabButton>
        )}
      </div>

      {tab === "karigars" && <KarigarsTab />}
      {tab === "customers" && <CustomersTab />}
      {tab === "stock" && stockEnabled?.enabled && <StockTab />}
    </div>
  );
}

function TabButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px ${
        active ? "border-gold text-gold" : "border-transparent text-text-muted hover:text-text"
      }`}
    >
      {children}
    </button>
  );
}

interface KarigarSummary {
  id: string;
  name: string;
  code: string;
  goldHeldG: number;
  netPayable: number;
}

function KarigarsTab() {
  const { data } = useApi<KarigarSummary[]>("/api/labour/karigars-summary");
  const totalGoldHeld = data?.reduce((s, k) => s + k.goldHeldG, 0) ?? 0;
  const totalPayable = data?.reduce((s, k) => s + k.netPayable, 0) ?? 0;

  return (
    <div className="card overflow-hidden">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-text-muted border-b border-border bg-bg">
            <th className="py-2.5 px-4 font-medium">Karigar</th>
            <th className="py-2.5 px-4 font-medium text-right">Gold Held</th>
            <th className="py-2.5 px-4 font-medium text-right">Net Payable</th>
          </tr>
        </thead>
        <tbody>
          {data?.map((k) => (
            <tr key={k.id} className="border-b border-border last:border-0 hover:bg-bg">
              <td className="py-2.5 px-4">
                <Link href={`/karigars/${k.id}`} className="font-medium text-gold">
                  {k.name}
                </Link>
                <span className="text-text-muted text-xs ml-2">{k.code}</span>
              </td>
              <td className="py-2.5 px-4 text-right tabular">{formatWeight(k.goldHeldG)}</td>
              <td className="py-2.5 px-4 text-right tabular font-medium">{formatINR(k.netPayable)}</td>
            </tr>
          ))}
        </tbody>
        {data && data.length > 0 && (
          <tfoot>
            <tr className="border-t-2 border-border font-semibold bg-bg">
              <td className="py-2.5 px-4">Total</td>
              <td className="py-2.5 px-4 text-right tabular">{formatWeight(totalGoldHeld)}</td>
              <td className="py-2.5 px-4 text-right tabular">{formatINR(totalPayable)}</td>
            </tr>
          </tfoot>
        )}
      </table>
      {data?.length === 0 && <p className="text-center text-text-muted py-8">No karigars yet.</p>}
    </div>
  );
}

interface CustomerBalance {
  id: string;
  name: string;
  contact?: string;
  balanceDue: number;
}
interface CustomerLedgerEntry {
  id: string;
  type: string;
  amount: string;
  note: string | null;
  createdAt: string;
}

function CustomersTab() {
  const { data: customers, mutate: mutateCustomers } = useApi<CustomerBalance[]>("/api/ledger/customers");
  const [expandedId, setExpandedId] = useState<string | null>(null);

  return (
    <div className="card overflow-hidden">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-text-muted border-b border-border bg-bg">
            <th className="py-2.5 px-4 font-medium">Customer</th>
            <th className="py-2.5 px-4 font-medium text-right">Balance Due</th>
            <th className="py-2.5 px-4 font-medium" />
          </tr>
        </thead>
        <tbody>
          {customers?.map((c) => (
            <Fragment key={c.id}>
              <tr className="border-b border-border last:border-0 hover:bg-bg">
                <td className="py-2.5 px-4">
                  <div className="font-medium">{c.name}</div>
                  {c.contact && <div className="text-text-muted text-xs">{c.contact}</div>}
                </td>
                <td
                  className={`py-2.5 px-4 text-right tabular font-medium ${
                    c.balanceDue > 0 ? "text-danger" : c.balanceDue < 0 ? "text-success" : ""
                  }`}
                >
                  {formatINR(Math.abs(c.balanceDue))}
                  {c.balanceDue !== 0 && (
                    <span className="text-xs text-text-muted ml-1">{c.balanceDue > 0 ? "owes" : "advance"}</span>
                  )}
                </td>
                <td className="py-2.5 px-4 text-right">
                  <button
                    className="btn btn-ghost text-xs"
                    onClick={() => setExpandedId(expandedId === c.id ? null : c.id)}
                  >
                    {expandedId === c.id ? "Hide" : "Details"}
                  </button>
                </td>
              </tr>
              {expandedId === c.id && (
                <tr>
                  <td colSpan={3} className="bg-bg px-4 py-3">
                    <CustomerDetail customerId={c.id} onChange={mutateCustomers} />
                  </td>
                </tr>
              )}
            </Fragment>
          ))}
        </tbody>
      </table>
      {customers?.length === 0 && <p className="text-center text-text-muted py-8">No customers yet.</p>}
    </div>
  );
}

function CustomerDetail({ customerId, onChange }: { customerId: string; onChange: () => void }) {
  const { data, mutate } = useApi<{ entries: CustomerLedgerEntry[]; balanceDue: number }>(
    `/api/ledger/customers/${customerId}/ledger`
  );
  const [type, setType] = useState<"ADVANCE_RECEIVED" | "PAYMENT_RECEIVED">("PAYMENT_RECEIVED");
  const [amount, setAmount] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function record(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      await apiFetch(`/api/ledger/customers/${customerId}/ledger`, {
        method: "POST",
        body: { type, amount: Number(amount) },
      });
      setAmount("");
      await mutate();
      await onChange();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="space-y-3">
      <form onSubmit={record} className="flex items-end gap-2">
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
          Record
        </button>
        {error && <p className="text-sm text-danger">{error}</p>}
      </form>
      <table className="w-full text-xs">
        <tbody>
          {data?.entries.map((e) => (
            <tr key={e.id} className="border-b border-border last:border-0">
              <td className="py-1.5 text-text-muted">{formatDateTime(e.createdAt)}</td>
              <td className="py-1.5">{e.type.replace(/_/g, " ")}</td>
              <td className="py-1.5 text-right tabular">{formatINR(Number(e.amount))}</td>
              <td className="py-1.5 text-text-muted">{e.note ?? "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {data?.entries.length === 0 && <p className="text-text-muted">No entries yet.</p>}
    </div>
  );
}

interface StockEntry {
  id: string;
  materialType: string;
  direction: "IN" | "OUT";
  quantity: string;
  purity?: { code: string } | null;
  stoneType?: { name: string } | null;
  vendor?: { name: string } | null;
  note: string | null;
  createdAt: string;
}

function StockTab() {
  const { data: balances } = useApi<{ materialType: string; purity?: string; stoneType?: string; balance: number }[]>(
    "/api/ledger/stock/balances"
  );
  const { data: entries, mutate } = useApi<StockEntry[]>("/api/ledger/stock/entries");
  const { data: karats } = useKarats();
  const { data: stoneTypes } = useStoneTypes();
  const [showPurchase, setShowPurchase] = useState(false);

  return (
    <div className="space-y-4">
      <div className="card overflow-hidden">
        <div className="px-5 py-3 border-b border-border font-semibold flex items-center justify-between">
          Balances
          <button className="btn btn-outline text-xs" onClick={() => setShowPurchase((s) => !s)}>
            + Record Purchase
          </button>
        </div>
        {showPurchase && (
          <div className="p-4 border-b border-border">
            <PurchaseForm
              karats={karats ?? []}
              stoneTypes={stoneTypes ?? []}
              onDone={() => {
                setShowPurchase(false);
                mutate();
              }}
            />
          </div>
        )}
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-text-muted border-b border-border bg-bg">
              <th className="py-2 px-4 font-medium">Material</th>
              <th className="py-2 px-4 font-medium text-right">Balance</th>
            </tr>
          </thead>
          <tbody>
            {balances?.map((b, i) => (
              <tr key={i} className="border-b border-border last:border-0">
                <td className="py-2 px-4">
                  {b.materialType} {b.purity ?? b.stoneType ?? ""}
                </td>
                <td className="py-2 px-4 text-right tabular">
                  {b.purity ? formatWeight(b.balance) : `${b.balance.toFixed(3)} crt`}
                </td>
              </tr>
            ))}
            {balances?.length === 0 && (
              <tr>
                <td colSpan={2} className="py-8 text-center text-text-muted">
                  No stock recorded yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="card overflow-hidden">
        <div className="px-5 py-3 border-b border-border font-semibold">Recent Entries</div>
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-text-muted border-b border-border bg-bg">
              <th className="py-2 px-4 font-medium">Date</th>
              <th className="py-2 px-4 font-medium">Material</th>
              <th className="py-2 px-4 font-medium">Direction</th>
              <th className="py-2 px-4 font-medium text-right">Qty</th>
              <th className="py-2 px-4 font-medium">Note</th>
            </tr>
          </thead>
          <tbody>
            {entries?.map((e) => (
              <tr key={e.id} className="border-b border-border last:border-0">
                <td className="py-2 px-4 text-text-muted">{formatDateTime(e.createdAt)}</td>
                <td className="py-2 px-4">
                  {e.materialType} {e.purity?.code ?? e.stoneType?.name ?? ""}
                </td>
                <td className={`py-2 px-4 ${e.direction === "IN" ? "text-success" : "text-danger"}`}>{e.direction}</td>
                <td className="py-2 px-4 text-right tabular">{Number(e.quantity).toFixed(3)}</td>
                <td className="py-2 px-4 text-text-muted">{e.note ?? "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function PurchaseForm({
  karats,
  stoneTypes,
  onDone,
}: {
  karats: { id: string; code: string }[];
  stoneTypes: { id: string; name: string }[];
  onDone: () => void;
}) {
  const [materialType, setMaterialType] = useState<"GOLD" | "POLKI" | "COLOURED_STONE" | "FINDING">("GOLD");
  const [purityId, setPurityId] = useState("");
  const [stoneTypeId, setStoneTypeId] = useState("");
  const [quantity, setQuantity] = useState("");
  const [rate, setRate] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      await apiFetch("/api/ledger/stock/purchases", {
        method: "POST",
        body: {
          materialType,
          purityId: materialType === "GOLD" ? purityId : undefined,
          stoneTypeId: materialType !== "GOLD" ? stoneTypeId : undefined,
          quantity: Number(quantity),
          rate: rate ? Number(rate) : undefined,
        },
      });
      onDone();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={submit} className="flex flex-wrap items-end gap-2">
      <select className="input w-auto" value={materialType} onChange={(e) => setMaterialType(e.target.value as typeof materialType)}>
        <option value="GOLD">Gold</option>
        <option value="POLKI">Polki</option>
        <option value="COLOURED_STONE">Coloured Stone</option>
        <option value="FINDING">Finding</option>
      </select>
      {materialType === "GOLD" ? (
        <select required className="input w-auto" value={purityId} onChange={(e) => setPurityId(e.target.value)}>
          <option value="">Purity…</option>
          {karats.map((k) => (
            <option key={k.id} value={k.id}>
              {k.code}
            </option>
          ))}
        </select>
      ) : (
        <select required className="input w-auto" value={stoneTypeId} onChange={(e) => setStoneTypeId(e.target.value)}>
          <option value="">Stone type…</option>
          {stoneTypes.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
      )}
      <input
        required
        type="number"
        step="0.001"
        placeholder="Quantity"
        className="input w-28"
        value={quantity}
        onChange={(e) => setQuantity(e.target.value)}
      />
      <input
        type="number"
        step="0.01"
        placeholder="Rate (optional)"
        className="input w-32"
        value={rate}
        onChange={(e) => setRate(e.target.value)}
      />
      <button className="btn btn-primary" disabled={submitting}>
        {submitting ? "Saving…" : "Record Purchase"}
      </button>
      {error && <p className="text-sm text-danger w-full">{error}</p>}
    </form>
  );
}
