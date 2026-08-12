"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useApi, useKarigars, useCustomers, useKarats, useStoneTypes } from "@/lib/hooks";
import { apiFetch, ApiError } from "@/lib/api";
import { formatINR } from "@/lib/format";
import { deriveRate } from "@jms/shared";

interface ProductOption {
  id: string;
  serialNo: string;
  designName: string;
}

interface GoldLine { id: string; purityId: string; quantity: string; rate: string; }
interface StoneLine { id: string; stoneTypeId: string; pieces: string; quantity: string; rate: string; particular: string; }
interface ChargeLine { id: string; type: "MAKING" | "OTHER" | "WASTAGE"; mode: "amount" | "weight"; amount: string; wt: string; rate: string; }

export default function NewEstimateForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [search, setSearch] = useState("");
  const { data: productResults } = useApi<{ items: ProductOption[] }>(
    search ? `/api/products?search=${encodeURIComponent(search)}&pageSize=8` : `/api/products?pageSize=8`
  );

  const [productId, setProductId] = useState(searchParams.get("productId") ?? "");
  const [customerId, setCustomerId] = useState("");
  const [karigarId, setKarigarId] = useState("");
  const [profitPct, setProfitPct] = useState("12");
  const [gstPct, setGstPct] = useState("3");
  const [pieces, setPieces] = useState("1");
  const [grossWeightG, setGrossWeightG] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const { data: customers } = useCustomers();
  const { data: karigars } = useKarigars();
  const { data: karats } = useKarats();
  const { data: stoneTypes } = useStoneTypes();
  const { data: currentGoldRate } = useApi<{ ratePerGram24k: string }>("/api/masters/gold-rates/current");

  const [goldLines, setGoldLines] = useState<GoldLine[]>([]);
  const [stoneLines, setStoneLines] = useState<StoneLine[]>([]);
  const [chargeLines, setChargeLines] = useState<ChargeLine[]>([]);

  const goldRate24k = Number(currentGoldRate?.ratePerGram24k ?? 0);

  const addGold = () => setGoldLines([...goldLines, { id: Math.random().toString(), purityId: karats?.[0]?.id ?? "", quantity: "", rate: "" }]);
  const addStone = () => setStoneLines([...stoneLines, { id: Math.random().toString(), stoneTypeId: stoneTypes?.[0]?.id ?? "", pieces: "", quantity: "", rate: "", particular: "" }]);
  const addCharge = () => setChargeLines([...chargeLines, { id: Math.random().toString(), type: "MAKING", mode: "amount", amount: "", wt: "", rate: "" }]);

  const goldTotal = goldLines.reduce((acc, g) => {
    const rate = g.rate ? Number(g.rate) : (g.purityId ? deriveRate(goldRate24k, Number(karats?.find(k => k.id === g.purityId)?.purityFactor ?? 0)) : 0);
    return acc + Number(g.quantity) * rate;
  }, 0);

  const stoneTotal = stoneLines.reduce((acc, s) => {
    return acc + Number(s.quantity) * Number(s.rate);
  }, 0);

  const chargeTotal = chargeLines.reduce((acc, c) => {
    if (c.mode === "weight") return acc + Number(c.wt) * Number(c.rate);
    return acc + Number(c.amount);
  }, 0);

  const cost = goldTotal + stoneTotal + chargeTotal;
  const profitAmt = cost * (Number(profitPct) / 100);
  const net = cost + profitAmt;
  const gstAmt = net * (Number(gstPct) / 100);
  const grandTotal = net + gstAmt;

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!productId) return setError("Product is required");
    setSubmitting(true);
    setError(null);
    try {
      const formattedLines = [
        ...goldLines
          .filter(g => Number(g.quantity) > 0)
          .map(g => ({
            head: "GOLD" as const,
            purityId: g.purityId,
            quantity: Number(g.quantity),
            rate: g.rate ? Number(g.rate) : undefined,
          })),
        ...stoneLines
          .filter(s => Number(s.quantity) > 0)
          .map(s => {
            const sType = stoneTypes?.find(st => st.id === s.stoneTypeId);
            return {
              head: sType?.category === "POLKI" ? "POLKI" as const : "COLOURED_STONE" as const,
              stoneTypeId: s.stoneTypeId,
              description: s.particular || undefined,
              quantity: Number(s.quantity),
              pieces: s.pieces ? Number(s.pieces) : undefined,
              rate: Number(s.rate) || 0,
            };
          }),
        ...chargeLines
          .filter(c => Number(c.amount) > 0 || (Number(c.wt) > 0 && Number(c.rate) > 0))
          .map(c => ({
            head: c.type,
            quantity: c.mode === "weight" ? Number(c.wt) || 1 : 1,
            rate: c.mode === "weight" ? Number(c.rate) : Number(c.amount),
          })),
      ];

      const estimate = await apiFetch<{ id: string }>("/api/estimates", {
        method: "POST",
        body: {
          productId,
          type: "ROUGH_ESTIMATE",
          pieces: pieces ? Number(pieces) : undefined,
          grossWeightG: grossWeightG ? Number(grossWeightG) : undefined,
          profitPct: Number(profitPct),
          gstPct: Number(gstPct),
          lines: formattedLines,
          ...(customerId ? { customerId } : {}),
          ...(karigarId ? { karigarId } : {}),
        },
      });
      router.push(`/costing/${estimate.id}`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to create estimate");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex flex-col h-full">
      <div className="mb-3.5">
        <div className="flex items-center gap-1.5 text-[11px] font-medium text-slate-500 mb-1.5">
          <span>Sales</span>
          <span className="text-slate-300">/</span>
          <span className="text-slate-900">Estimates</span>
        </div>
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-[19px] font-semibold text-slate-900 leading-tight">New Estimate</h1>
            <p className="text-[12px] text-slate-500 mt-0.5">Will be saved as Draft status</p>
          </div>
        </div>
      </div>
      
      <div className="flex-1 overflow-auto">
        <form onSubmit={onSubmit} className="max-w-[1200px] grid md:grid-cols-3 gap-4 pb-12">
          
          <div className="md:col-span-2 space-y-4">
            
            {/* ITEM SELECTION */}
            <div className="bg-white border border-slate-200 rounded-md">
              <div className="px-3 pt-2 text-[10px] uppercase tracking-wider text-slate-400 font-semibold">Item & Header</div>
              <div className="p-3 grid md:grid-cols-4 gap-3">
                <div className="md:col-span-4">
                  <label className="text-[11px] text-slate-500">Product</label>
                  <input
                    className="mt-0.5 w-full h-8 px-2 rounded border border-slate-200 text-[12px] mb-1"
                    placeholder="Search by serial number or design name…"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                  />
                  <select required className="w-full h-8 px-2 rounded border border-slate-200 text-[12px]" value={productId} onChange={(e) => setProductId(e.target.value)}>
                    <option value="">Select a product…</option>
                    {productResults?.items.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.serialNo} — {p.designName}
                      </option>
                    ))}
                  </select>
                </div>
                
                <div className="md:col-span-1">
                  <label className="text-[11px] text-slate-500">Party / Customer</label>
                  <select className="mt-0.5 w-full h-8 px-2 rounded border border-slate-200 text-[12px]" value={customerId} onChange={(e) => setCustomerId(e.target.value)}>
                    <option value="">Select a customer…</option>
                    {customers?.map((c) => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                  </select>
                </div>

                <div className="md:col-span-1">
                  <label className="text-[11px] text-slate-500">Pieces</label>
                  <input 
                    type="number" 
                    className="mt-0.5 w-full h-8 px-2 rounded border border-slate-200 text-[12px] mono" 
                    value={pieces} 
                    onChange={(e) => setPieces(e.target.value)} 
                    placeholder="1"
                  />
                </div>

                <div className="md:col-span-1">
                  <label className="text-[11px] text-slate-500">Gross Weight — GW (g)</label>
                  <input 
                    type="number" 
                    step="0.001" 
                    className="mt-0.5 w-full h-8 px-2 rounded border border-slate-200 text-[12px] mono" 
                    value={grossWeightG} 
                    onChange={(e) => setGrossWeightG(e.target.value)} 
                    placeholder="0.000"
                  />
                </div>

                <div className="md:col-span-1">
                  <label className="text-[11px] text-slate-500">Karigar (Optional)</label>
                  <select className="mt-0.5 w-full h-8 px-2 rounded border border-slate-200 text-[12px]" value={karigarId} onChange={(e) => setKarigarId(e.target.value)}>
                    <option value="">No karigar yet…</option>
                    {karigars?.map((k) => (
                      <option key={k.id} value={k.id}>{k.name}</option>
                    ))}
                  </select>
                </div>
              </div>
            </div>

            {/* GOLD */}
            <div className="bg-white border border-slate-200 rounded-md">
              <div className="px-3 pt-2 text-[10px] uppercase tracking-wider text-slate-400 font-semibold">Pure Gold</div>
              <div className="p-3">
                {goldLines.length > 0 && (
                  <table className="w-full text-[12px] mb-2">
                    <thead>
                      <tr className="text-slate-400 text-[10px] uppercase">
                        <th className="text-left font-medium pb-1">Karat</th>
                        <th className="text-right font-medium pb-1">Wt (g)</th>
                        <th className="text-right font-medium pb-1">Rate</th>
                        <th className="text-right font-medium pb-1">Amount</th>
                        <th></th>
                      </tr>
                    </thead>
                    <tbody>
                      {goldLines.map((g, i) => {
                        const defaultRate = karats?.find(k => k.id === g.purityId) ? deriveRate(goldRate24k, Number(karats.find(k => k.id === g.purityId)!.purityFactor)) : 0;
                        const amt = Number(g.quantity) * (g.rate ? Number(g.rate) : defaultRate);
                        return (
                          <tr key={g.id} className="border-t border-slate-100">
                            <td className="py-1.5">
                              <select 
                                className="h-7 border border-slate-200 rounded text-[12px] w-full"
                                value={g.purityId} onChange={e => setGoldLines(goldLines.map(x => x.id === g.id ? { ...x, purityId: e.target.value } : x))}
                              >
                                {karats?.map(k => <option key={k.id} value={k.id}>{k.code}</option>)}
                              </select>
                            </td>
                            <td className="py-1.5 text-right"><input type="number" step="0.001" className="w-20 h-7 px-2 text-right border border-slate-200 rounded text-[12px] mono" value={g.quantity} onChange={e => setGoldLines(goldLines.map(x => x.id === g.id ? { ...x, quantity: e.target.value } : x))} placeholder="0.00" /></td>
                            <td className="py-1.5 text-right"><input type="number" className="w-20 h-7 px-2 text-right border border-slate-200 rounded text-[12px] mono" value={g.rate} onChange={e => setGoldLines(goldLines.map(x => x.id === g.id ? { ...x, rate: e.target.value } : x))} placeholder={defaultRate.toString()} /></td>
                            <td className="py-1.5 text-right mono">{formatINR(amt)}</td>
                            <td className="py-1.5 text-right"><button type="button" onClick={() => setGoldLines(goldLines.filter(x => x.id !== g.id))} className="text-slate-400 hover:text-rose-600">✕</button></td>
                          </tr>
                        );
                      })}
                      <tr className="border-t border-slate-200 font-semibold">
                        <td className="py-1.5 text-slate-900">Total</td><td></td><td></td>
                        <td className="py-1.5 text-right mono">{formatINR(goldTotal)}</td><td></td>
                      </tr>
                    </tbody>
                  </table>
                )}
                <button type="button" onClick={addGold} className="text-[12px] text-accent hover:underline flex items-center gap-1">+ Add gold row</button>
              </div>
            </div>

            {/* STONES */}
            <div className="bg-white border border-slate-200 rounded-md">
              <div className="px-3 pt-2 text-[10px] uppercase tracking-wider text-slate-400 font-semibold">Polki / Kundan / Stones</div>
              <div className="p-3">
                {stoneLines.length > 0 && (
                  <table className="w-full text-[12px] mb-2">
                    <thead>
                      <tr className="text-slate-400 text-[10px] uppercase">
                        <th className="text-left font-medium pb-1">Group</th>
                        <th className="text-left font-medium pb-1">Particular</th>
                        <th className="text-right font-medium pb-1">Pcs</th>
                        <th className="text-right font-medium pb-1">Wt</th>
                        <th className="text-right font-medium pb-1">Rate</th>
                        <th className="text-right font-medium pb-1">Amount</th>
                        <th></th>
                      </tr>
                    </thead>
                    <tbody>
                      {stoneLines.map((s) => {
                        const amt = Number(s.quantity) * Number(s.rate);
                        return (
                          <tr key={s.id} className="border-t border-slate-100">
                            <td className="py-1.5">
                              <select className="h-7 border border-slate-200 rounded text-[12px] w-full" value={s.stoneTypeId} onChange={e => setStoneLines(stoneLines.map(x => x.id === s.id ? { ...x, stoneTypeId: e.target.value } : x))}>
                                {stoneTypes?.map(st => <option key={st.id} value={st.id}>{st.name}</option>)}
                              </select>
                            </td>
                            <td className="py-1.5"><input className="w-24 h-7 px-2 border border-slate-200 rounded text-[12px]" value={s.particular} onChange={e => setStoneLines(stoneLines.map(x => x.id === s.id ? { ...x, particular: e.target.value } : x))} placeholder="e.g. Polki" /></td>
                            <td className="py-1.5 text-right"><input type="number" className="w-12 h-7 px-2 text-right border border-slate-200 rounded text-[12px]" value={s.pieces} onChange={e => setStoneLines(stoneLines.map(x => x.id === s.id ? { ...x, pieces: e.target.value } : x))} /></td>
                            <td className="py-1.5 text-right"><input type="number" step="0.001" className="w-16 h-7 px-2 text-right border border-slate-200 rounded text-[12px] mono" value={s.quantity} onChange={e => setStoneLines(stoneLines.map(x => x.id === s.id ? { ...x, quantity: e.target.value } : x))} /></td>
                            <td className="py-1.5 text-right"><input type="number" className="w-20 h-7 px-2 text-right border border-slate-200 rounded text-[12px] mono" value={s.rate} onChange={e => setStoneLines(stoneLines.map(x => x.id === s.id ? { ...x, rate: e.target.value } : x))} /></td>
                            <td className="py-1.5 text-right mono">{formatINR(amt)}</td>
                            <td className="py-1.5 text-right"><button type="button" onClick={() => setStoneLines(stoneLines.filter(x => x.id !== s.id))} className="text-slate-400 hover:text-rose-600">✕</button></td>
                          </tr>
                        );
                      })}
                      <tr className="border-t border-slate-200 font-semibold">
                        <td colSpan={5} className="py-1.5 text-slate-900">Total</td>
                        <td className="py-1.5 text-right mono">{formatINR(stoneTotal)}</td><td></td>
                      </tr>
                    </tbody>
                  </table>
                )}
                <button type="button" onClick={addStone} className="text-[12px] text-accent hover:underline flex items-center gap-1">+ Add stone row</button>
              </div>
            </div>

            {/* CHARGES */}
            <div className="bg-white border border-slate-200 rounded-md">
              <div className="px-3 pt-2 text-[10px] uppercase tracking-wider text-slate-400 font-semibold">Charges</div>
              <div className="p-3">
                <div className="grid grid-cols-2 gap-2 mb-2">
                  {chargeLines.map((c) => {
                    const amt = c.mode === "weight" ? Number(c.wt) * Number(c.rate) : Number(c.amount);
                    return (
                      <div key={c.id} className="border border-slate-200 rounded-md p-2 relative">
                        <button type="button" onClick={() => setChargeLines(chargeLines.filter(x => x.id !== c.id))} className="absolute top-1.5 right-1.5 text-slate-400 hover:text-rose-600">✕</button>
                        <div className="flex items-center gap-1.5 mb-1.5 w-[85%]">
                          <select className="h-7 flex-1 border border-slate-200 rounded text-[12px]" value={c.type} onChange={e => setChargeLines(chargeLines.map(x => x.id === c.id ? { ...x, type: e.target.value as any } : x))}>
                            <option value="MAKING">Making Charge</option>
                            <option value="WASTAGE">Wastage Charge</option>
                            <option value="OTHER">Other Charge</option>
                          </select>
                          <select className="h-7 w-20 border border-slate-200 rounded text-[11px]" value={c.mode} onChange={e => setChargeLines(chargeLines.map(x => x.id === c.id ? { ...x, mode: e.target.value as any } : x))}>
                            <option value="amount">Fixed</option>
                            <option value="weight">By Wt</option>
                          </select>
                        </div>
                        {c.mode === "weight" ? (
                          <div className="flex items-center gap-1.5">
                            <input type="number" step="0.001" className="w-1/2 h-7 px-2 border border-slate-200 rounded text-[12px] mono" placeholder="Wt (g)" value={c.wt} onChange={e => setChargeLines(chargeLines.map(x => x.id === c.id ? { ...x, wt: e.target.value } : x))} />
                            <input type="number" className="w-1/2 h-7 px-2 border border-slate-200 rounded text-[12px] mono" placeholder="Rate/g" value={c.rate} onChange={e => setChargeLines(chargeLines.map(x => x.id === c.id ? { ...x, rate: e.target.value } : x))} />
                          </div>
                        ) : (
                          <input type="number" className="w-full h-7 px-2 border border-slate-200 rounded text-[12px] mono" placeholder="Amount" value={c.amount} onChange={e => setChargeLines(chargeLines.map(x => x.id === c.id ? { ...x, amount: e.target.value } : x))} />
                        )}
                        <div className="text-right text-[12px] font-medium text-slate-900 mono mt-1">{formatINR(amt)}</div>
                      </div>
                    );
                  })}
                </div>
                <button type="button" onClick={addCharge} className="text-[12px] text-accent hover:underline flex items-center gap-1">+ Add charge card</button>
              </div>
            </div>

          </div>

          <div className="md:col-span-1">
            <div className="sticky top-0 space-y-3">
              <div className="bg-white border border-slate-200 rounded-md">
                <div className="px-3 pt-2 text-[10px] uppercase tracking-wider text-slate-400 font-semibold mb-2">Costing Summary</div>
                <div className="px-3 pb-3 space-y-2 text-[12px]">
                  <div className="flex justify-between text-slate-600"><span>Gold Total</span> <span className="mono">{formatINR(goldTotal)}</span></div>
                  <div className="flex justify-between text-slate-600"><span>Stones Total</span> <span className="mono">{formatINR(stoneTotal)}</span></div>
                  <div className="flex justify-between text-slate-600"><span>Charges Total</span> <span className="mono">{formatINR(chargeTotal)}</span></div>
                  <div className="border-t border-slate-100 my-1"></div>
                  <div className="flex justify-between font-medium"><span>Cost (Rs.)</span> <span className="mono">{formatINR(cost)}</span></div>
                  <div className="flex items-center gap-2">
                    <span className="text-slate-500 flex-1">Profit %</span>
                    <input type="number" step="0.01" className="w-20 h-7 px-2 text-right border border-slate-200 rounded text-[12px] mono" value={profitPct} onChange={e => setProfitPct(e.target.value)} />
                  </div>
                  <div className="flex justify-between text-slate-600"><span>Add Profit Amount</span> <span className="mono">{formatINR(profitAmt)}</span></div>
                  <div className="border-t border-slate-100 my-1"></div>
                  <div className="flex justify-between font-medium"><span>Net Amount (Rs.)</span> <span className="mono">{formatINR(net)}</span></div>
                  <div className="flex items-center gap-2">
                    <span className="text-slate-500 flex-1">GST %</span>
                    <input type="number" step="0.01" className="w-20 h-7 px-2 text-right border border-slate-200 rounded text-[12px] mono" value={gstPct} onChange={e => setGstPct(e.target.value)} />
                  </div>
                  <div className="flex justify-between text-slate-600"><span>GST Amount</span> <span className="mono">{formatINR(gstAmt)}</span></div>
                  <div className="border-t border-slate-100 my-1"></div>
                  <div className="flex justify-between font-semibold text-lg text-ink"><span>Payable</span> <span className="mono">{formatINR(grandTotal)}</span></div>
                </div>
              </div>
              
              {error && <p className="text-sm text-err-tx">{error}</p>}
              <div className="flex gap-2">
                <button type="button" className="console-btn flex-1 justify-center" onClick={() => router.back()}>Cancel</button>
                <button type="submit" className="console-btn primary flex-1 justify-center" disabled={submitting}>
                  {submitting ? "Saving…" : "Save Estimate"}
                </button>
              </div>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
