"use client";

import { useState } from "react";
import Link from "next/link";
import { useApi, useStockLedgerEnabled, useKarats, useStoneTypes } from "@/lib/hooks";
import { apiFetch, ApiError } from "@/lib/api";
import { formatINR, formatWeight, formatDateTime } from "@/lib/format";
import { useAuth } from "@/lib/auth-context";
import { AddKarigarForm } from "@/components/AddKarigarForm";
import { AddCustomerForm } from "@/components/AddCustomerForm";

type Tab = "karigars" | "customers" | "stock";

export default function LedgerPage() {
  const { data: stockEnabled } = useStockLedgerEnabled();
  const [tab, setTab] = useState<Tab>("karigars");

  return (
    <div>
      <div className="mb-2">
        <div className="text-[11px] text-mute mb-1">Finance</div>
        <h1 className="text-[19px] font-semibold text-ink mb-2">Ledger</h1>
        <p className="text-xs text-ink2 mb-2">
          The full khata — gold and money movement across karigars, customers{stockEnabled?.enabled ? " and store stock" : ""}.
        </p>
        <div className="flex gap-2">
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
      </div>

      <div className="mt-3.5">
        {tab === "karigars" && <KarigarsTab />}
        {tab === "customers" && <CustomersTab />}
        {tab === "stock" && stockEnabled?.enabled && <StockTab />}
      </div>
    </div>
  );
}

function TabButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={`px-3 py-1.5 text-[12.5px] border-b-2 -mb-px ${
        active ? "border-accent text-accent font-semibold" : "border-transparent text-ink2 hover:text-ink"
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
    <div>
      {canManage && (
        <div className="flex justify-end mb-2">
          <button className="console-btn" onClick={() => setShowAdd((v) => !v)}>
            {showAdd ? "Cancel" : "+ New Karigar"}
          </button>
        </div>
      )}
      {showAdd && (
        <div className="console-panel p-4 mb-3">
          <AddKarigarForm
            onCreated={() => {
              setShowAdd(false);
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
                <th>Karigar</th>
                <th className="num">Gold Held</th>
                <th className="num">Net Payable</th>
              </tr>
            </thead>
            <tbody>
              {data?.map((k) => (
                <tr key={k.id}>
                  <td>
                    <Link href={`/karigars/${k.id}`} className="rid">
                      {k.name}
                    </Link>
                    <span className="text-mute text-xs ml-2">{k.code}</span>
                  </td>
                  <td className="num mono">{formatWeight(k.goldHeldG)}</td>
                  <td className="num mono font-semibold">{formatINR(k.netPayable)}</td>
                </tr>
              ))}
            </tbody>
            {data && data.length > 0 && (
              <tfoot>
                <tr className="font-semibold bg-neu-bg">
                  <td className="px-2.5 py-2">Total</td>
                  <td className="num mono px-2.5 py-2">{formatWeight(totalGoldHeld)}</td>
                  <td className="num mono px-2.5 py-2">{formatINR(totalPayable)}</td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
        {data?.length === 0 && <p className="text-center text-mute py-8 text-sm">No karigars yet.</p>}
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
    <div>
      {canManage && (
        <div className="flex justify-end mb-2">
          <button className="console-btn" onClick={() => setShowAdd((v) => !v)}>
            {showAdd ? "Cancel" : "+ New Customer"}
          </button>
        </div>
      )}
      {showAdd && (
        <div className="console-panel p-4 mb-3">
          <AddCustomerForm
            onCreated={() => {
              setShowAdd(false);
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
                <th>Customer</th>
                <th className="num">Balance Due</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {customers?.map((c) => (
                <tr key={c.id}>
                  <td>
                    <div className="font-medium text-ink">{c.name}</div>
                    {c.contact && <div className="text-mute text-[11px]">{c.contact}</div>}
                  </td>
                  <td
                    className="num mono font-semibold"
                    style={{ color: c.balanceDue > 0 ? "var(--color-err-tx)" : c.balanceDue < 0 ? "var(--color-ok-tx)" : undefined }}
                  >
                    {formatINR(Math.abs(c.balanceDue))}
                    {c.balanceDue !== 0 && (
                      <span className="text-xs text-mute ml-1 font-normal">{c.balanceDue > 0 ? "owes" : "advance"}</span>
                    )}
                  </td>
                  <td className="text-right">
                    <Link href={`/customers/${c.id}`} className="text-accent text-xs font-semibold">
                      View Profile →
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {customers?.length === 0 && <p className="text-center text-mute py-8 text-sm">No customers yet.</p>}
      </div>
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
    <div className="space-y-3.5">
      <div className="console-panel overflow-hidden">
        <div className="ph">
          Balances
          <button className="console-btn" onClick={() => setShowPurchase((s) => !s)}>
            + Record Purchase
          </button>
        </div>
        {showPurchase && (
          <div className="p-3.5 border-b border-line">
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
          <table className="console-table">
            <thead>
              <tr>
                <th>Material</th>
                <th className="num">Balance</th>
              </tr>
            </thead>
            <tbody>
              {balances?.map((b, i) => (
                <tr key={i}>
                  <td>
                    {b.materialType} {b.purity ?? b.stoneType ?? ""}
                  </td>
                  <td className="num mono">{b.purity ? formatWeight(b.balance) : `${b.balance.toFixed(3)} crt`}</td>
                </tr>
              ))}
              {balances?.length === 0 && (
                <tr>
                  <td colSpan={2} className="py-8 text-center text-mute">
                    No stock recorded yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="console-panel overflow-hidden">
        <div className="ph">Recent Entries</div>
        <div className="overflow-x-auto">
          <table className="console-table">
            <thead>
              <tr>
                <th>Date</th>
                <th>Material</th>
                <th>Direction</th>
                <th className="num">Qty</th>
                <th>Note</th>
              </tr>
            </thead>
            <tbody>
              {entries?.map((e) => (
                <tr key={e.id}>
                  <td className="text-ink2">{formatDateTime(e.createdAt)}</td>
                  <td>
                    {e.materialType} {e.purity?.code ?? e.stoneType?.name ?? ""}
                  </td>
                  <td>
                    <span className={`console-pill ${e.direction === "IN" ? "ok" : "err"}`}>{e.direction}</span>
                  </td>
                  <td className="num mono">{Number(e.quantity).toFixed(3)}</td>
                  <td className="text-ink2">{e.note ?? "—"}</td>
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
      <select className="console-field w-auto" value={materialType} onChange={(e) => setMaterialType(e.target.value as typeof materialType)}>
        <option value="GOLD">Gold</option>
        <option value="POLKI">Polki</option>
        <option value="COLOURED_STONE">Coloured Stone</option>
        <option value="FINDING">Finding</option>
      </select>
      {materialType === "GOLD" ? (
        <select required className="console-field w-auto" value={purityId} onChange={(e) => setPurityId(e.target.value)}>
          <option value="">Purity…</option>
          {karats.map((k) => (
            <option key={k.id} value={k.id}>
              {k.code}
            </option>
          ))}
        </select>
      ) : (
        <select required className="console-field w-auto" value={stoneTypeId} onChange={(e) => setStoneTypeId(e.target.value)}>
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
        className="console-field w-28"
        value={quantity}
        onChange={(e) => setQuantity(e.target.value)}
      />
      <input
        type="number"
        step="0.01"
        placeholder="Rate (optional)"
        className="console-field w-32"
        value={rate}
        onChange={(e) => setRate(e.target.value)}
      />
      <button className="console-btn primary" disabled={submitting}>
        {submitting ? "Saving…" : "Record Purchase"}
      </button>
      {error && <p className="text-sm text-err-tx w-full">{error}</p>}
    </form>
  );
}
