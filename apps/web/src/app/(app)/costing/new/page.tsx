"use client";

import { useState, Suspense } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useApi, useCustomers, type Customer } from "@/lib/hooks";
import { apiFetch, ApiError } from "@/lib/api";
import { toast } from "@/lib/toast";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { AddCustomerDialog } from "@/components/shared/add-customer-dialog";

interface ProductOption {
  id: string;
  serialNo: string;
  designName: string;
  customerId?: string | null;
}

const TYPE_ITEMS = [
  { value: "ROUGH_ESTIMATE", label: "Rough Estimate" },
  { value: "FINAL_COSTING", label: "Final Costing" },
];

function NewEstimateForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [search, setSearch] = useState("");
  const { data: productResults } = useApi<{ items: ProductOption[] }>(
    search ? `/api/products?search=${encodeURIComponent(search)}&pageSize=8` : `/api/products?pageSize=8`
  );

  const [productId, setProductId] = useState(searchParams.get("productId") ?? "");
  const [type, setType] = useState<"ROUGH_ESTIMATE" | "FINAL_COSTING">("ROUGH_ESTIMATE");
  const [customerId, setCustomerId] = useState("");
  const [profitPct, setProfitPct] = useState("12");
  const [gstPct, setGstPct] = useState("3");
  const [submitting, setSubmitting] = useState(false);
  const { data: customers, mutate: mutateCustomers } = useCustomers();

  const productItems = (productResults?.items ?? []).map((p) => ({
    value: p.id,
    label: `${p.serialNo} — ${p.designName}`,
  }));
  const customerItems = (customers ?? []).map((c) => ({ value: c.id, label: c.name }));

  function onCustomerCreated(customer: Customer) {
    mutateCustomers([...(customers ?? []), customer], { revalidate: false });
    setCustomerId(customer.id);
  }

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSubmitting(true);
    try {
      const estimate = await apiFetch<{ id: string }>("/api/estimates", {
        method: "POST",
        body: {
          productId,
          type,
          profitPct: Number(profitPct),
          gstPct: Number(gstPct),
          lines: [],
          ...(customerId ? { customerId } : {}),
        },
      });
      toast.success("Estimate created");
      router.push(`/costing/${estimate.id}`);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Failed to create estimate");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="max-w-lg space-y-5">
      <h1 className="text-xl font-semibold">New Estimate</h1>
      <Card>
        <CardContent>
          <form onSubmit={onSubmit} className="space-y-4">
            <div>
              <div className="mb-2 flex items-center justify-between">
                <Label>Product</Label>
                <Link href="/products/new" target="_blank" className="text-xs text-primary hover:underline">
                  + Add New Design
                </Link>
              </div>
              <Input
                className="mb-2"
                placeholder="Search by serial number or design name…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
              <Select required value={productId} onValueChange={(v) => setProductId(v ?? "")} items={productItems}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Select a product…" />
                </SelectTrigger>
                <SelectContent>
                  {productResults?.items.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.serialNo} — {p.designName}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="mt-1 text-xs text-muted-foreground">
                Design not listed yet? Add it in the new tab, then search for it here.
              </p>
            </div>

            {productId && (
              <div>
                <div className="mb-1.5 flex items-center justify-between">
                  <Label>Customer</Label>
                  <AddCustomerDialog onCreated={onCustomerCreated} />
                </div>
                <Select
                  value={customerId}
                  onValueChange={(v) => setCustomerId(v ?? "")}
                  items={customerItems}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Select or add a customer…" />
                  </SelectTrigger>
                  <SelectContent>
                    {customers?.map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="mt-1 text-xs text-muted-foreground">
                  Same design, different customer? Just pick who this particular estimate is for.
                </p>
              </div>
            )}

            <div>
              <Label className="mb-1.5">Estimate Type</Label>
              <Select
                value={type}
                onValueChange={(v) => setType((v as typeof type) ?? "ROUGH_ESTIMATE")}
                items={TYPE_ITEMS}
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ROUGH_ESTIMATE">Rough Estimate</SelectItem>
                  <SelectItem value="FINAL_COSTING">Final Costing</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label className="mb-1.5">Profit %</Label>
                <Input type="number" step="0.01" value={profitPct} onChange={(e) => setProfitPct(e.target.value)} />
              </div>
              <div>
                <Label className="mb-1.5">GST %</Label>
                <Input type="number" step="0.01" value={gstPct} onChange={(e) => setGstPct(e.target.value)} />
              </div>
            </div>

            <div className="flex justify-end gap-2 border-t border-border pt-2">
              <Button type="button" variant="ghost" onClick={() => router.back()}>
                Cancel
              </Button>
              <Button type="submit" disabled={submitting || !productId}>
                {submitting ? "Creating…" : "Create Estimate"}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}

export default function NewEstimatePage() {
  return (
    <Suspense>
      <NewEstimateForm />
    </Suspense>
  );
}
