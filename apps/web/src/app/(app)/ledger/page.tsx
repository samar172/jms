"use client";

import { useState } from "react";
import Link from "next/link";
import { useApi, useStockLedgerEnabled, useKarats, useStoneTypes } from "@/lib/hooks";
import { apiFetch, ApiError } from "@/lib/api";
import { formatINR, formatWeight, formatDateTime } from "@/lib/format";
import { useAuth } from "@/lib/auth-context";
import { AddKarigarForm } from "@/components/AddKarigarForm";

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
  const { user } = useAuth();
  const { data, mutate } = useApi<KarigarSummary[]>("/api/labour/karigars-summary");
  const [showAdd, setShowAdd] = useState(false);
  const totalGoldHeld = data?.reduce((s, k) => s + k.goldHeldG, 0) ?? 0;
  const totalPayable = data?.reduce((s, k) => s + k.netPayable, 0) ?? 0;
  const canManage = user?.role === "SUPER_ADMIN" || user?.role === "MANAGER";

  return (
    <div className="space-y-3">
      {canManage && (
        <div className="flex justify-end">
          <button className="btn btn-outline text-xs" onClick={() => setShowAdd((v) => !v)}>
            {showAdd ? "Cancel" : "+ New Karigar"}
          </button>
        </div>
      )}
      {showAdd && (
        <div className="card p-4">
          <AddKarigarForm
            onCreated={() => {
              setShowAdd(false);
              mutate();
            }}
            onCancel={() => setShowAdd(false)}
          />
        </div>
      )}
      <div className="card overflow-hidden">
      <div className="overflow-x-auto">
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
      </div>
      {data?.length === 0 && <p className="text-center text-text-muted py-8">No karigars yet.</p>}
      </div>
    </div>
  );
}

interface CustomerBalance {
  id: string;
  name: string;
  contact?: string;
  balanceDue: number;
}
function CustomersTab() {
  const { user } = useAuth();
  const { data: customers, mutate } = useApi<CustomerBalance[]>("/api/ledger/customers");
  const [showAdd, setShowAdd] = useState(false);
  const canManage = user?.role === "SUPER_ADMIN" || user?.role === "MANAGER" || user?.role === "SALES";

  return (
    <div className="space-y-3">
      {canManage && (
        <div className="flex justify-end">
          <button className="btn btn-outline text-xs" onClick={() => setShowAdd((v) => !v)}>
            {showAdd ? "Cancel" : "+ New Customer"}
          </button>
        </div>
      )}
      {showAdd && (
        <div className="card p-4">
          <AddCustomerForm
            onCreated={() => {
              setShowAdd(false);
              mutate();
            }}
            onCancel={() => setShowAdd(false)}
          />
        </div>
      )}
      <div className="card overflow-hidden">
      <div className="overflow-x-auto">
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
            <tr key={c.id} className="border-b border-border last:border-0 hover:bg-bg">
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
                <Link href={`/customers/${c.id}`} className="btn btn-ghost text-xs">
                  View Profile →
                </Link>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      </div>
      {customers?.length === 0 && <p className="text-center text-text-muted py-8">No customers yet.</p>}
      </div>
    </div>
  );
}

function AddCustomerForm({ onCreated, onCancel }: { onCreated: () => void; onCancel: () => void }) {
  const [name, setName] = useState("");
  const [contact, setContact] = useState("");
  const [address, setAddress] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      await apiFetch("/api/masters/customers", {
        method: "POST",
        body: { name, contact: contact || undefined, address: address || undefined },
      });
      setName("");
      setContact("");
      setAddress("");
      onCreated();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to add customer");
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
        <label className="label">Contact (optional)</label>
        <input className="input w-36" value={contact} onChange={(e) => setContact(e.target.value)} />
      </div>
      <div>
        <label className="label">Address (optional)</label>
        <input className="input w-48" value={address} onChange={(e) => setAddress(e.target.value)} />
      </div>
      <button className="btn btn-primary" disabled={submitting}>
        {submitting ? "Adding…" : "+ Add Customer"}
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
        <div className="overflow-x-auto">
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
      </div>

      <div className="card overflow-hidden">
        <div className="px-5 py-3 border-b border-border font-semibold">Recent Entries</div>
        <div className="overflow-x-auto">
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
