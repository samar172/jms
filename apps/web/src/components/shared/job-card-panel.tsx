"use client";

import { useState } from "react";
import { Plus } from "lucide-react";
import { useApi, useKarigars } from "@/lib/hooks";
import { apiFetch, ApiError } from "@/lib/api";
import { JobStageStatusBadge } from "@/components/shared/status-badge";
import { formatINR, formatWeight, formatPct } from "@/lib/format";
import { computeWastage, fineWeight } from "@jms/shared";
import { hi } from "@/lib/hi";
import { AddKarigarForm } from "@/components/AddKarigarForm";
import { useAuth } from "@/lib/auth-context";
import { toast } from "@/lib/toast";
import { cn } from "@/lib/utils";
import { PageFormSkeleton } from "@/components/shared/page-skeleton";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

interface WastageRecord {
  id: string;
  netWastageG: string;
  wastagePct: string;
  tolerancePct: string;
  withinTolerance: boolean;
  exceptionStatus: "NONE" | "PENDING" | "APPROVED" | "REJECTED";
  exceptionReason?: string | null;
}
interface LabourEntry {
  id: string;
  quantity: string;
  rate: string;
  amount: string;
  status: string;
  rateBasis: string;
}
interface MaterialIssue {
  id: string;
  materialType: string;
  fineWeightG: string;
  grossWeightG: string | null;
}
interface Stage {
  id: string;
  status: string;
  karigarId: string | null;
  karigar?: { name: string } | null;
  processStage: { id: string; name: string; sequenceOrder: number; wastageTolerancePct: string };
  materialIssues: MaterialIssue[];
  materialReceipts: unknown[];
  labourEntries: LabourEntry[];
  wastageRecord: WastageRecord | null;
}
interface JobCardDetail {
  id: string;
  status: string;
  productId: string;
  product: { serialNo: string; designName: string; purity: { code: string; purityFactor: string } };
  stages: Stage[];
}

export function JobCardPanel({ jobCardId }: { jobCardId: string }) {
  const { data: jobCard, mutate } = useApi<JobCardDetail>(`/api/job-cards/${jobCardId}`);
  const { data: karigars, mutate: mutateKarigars } = useKarigars();
  const [busyStage, setBusyStage] = useState<string | null>(null);
  const [closeError, setCloseError] = useState<string | null>(null);

  if (!jobCard) return <PageFormSkeleton sections={3} />;

  async function closeJobCard() {
    setCloseError(null);
    try {
      await apiFetch(`/api/job-cards/${jobCardId}/close`, { method: "POST" });
      toast.success("Job card closed");
      await mutate();
    } catch (err) {
      if (err instanceof ApiError) {
        const blockers = (err.details as { blockers?: string[] } | undefined)?.blockers;
        setCloseError(blockers ? `${err.message}: ${blockers.join(", ")}` : err.message);
      }
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <Badge variant="secondary">{jobCard.status}</Badge>
        {jobCard.status !== "CLOSED" && <Button onClick={closeJobCard}>Close Job Card</Button>}
      </div>
      {closeError && (
        <Card className="border-destructive/30 py-3">
          <p className="px-4 text-sm text-destructive">{closeError}</p>
        </Card>
      )}

      <div className="space-y-4">
        {jobCard.stages
          .slice()
          .sort((a, b) => a.processStage.sequenceOrder - b.processStage.sequenceOrder)
          .map((stage) => (
            <StageCard
              key={stage.id}
              stage={stage}
              purityFactor={Number(jobCard.product.purity.purityFactor)}
              karigars={karigars ?? []}
              onKarigarCreated={() => mutateKarigars()}
              busy={busyStage === stage.id}
              setBusy={(v) => setBusyStage(v ? stage.id : null)}
              onChange={() => mutate()}
            />
          ))}
      </div>
    </div>
  );
}

function StageCard({
  stage,
  purityFactor,
  karigars,
  onKarigarCreated,
  busy,
  setBusy,
  onChange,
}: {
  stage: Stage;
  purityFactor: number;
  karigars: { id: string; name: string }[];
  onKarigarCreated: () => void;
  busy: boolean;
  setBusy: (v: boolean) => void;
  onChange: () => void;
}) {
  const [karigarId, setKarigarId] = useState(stage.karigarId ?? "");
  const [showIssueDialog, setShowIssueDialog] = useState(false);
  const [showReceiptDialog, setShowReceiptDialog] = useState(false);
  const [showAddKarigar, setShowAddKarigar] = useState(false);

  async function assignKarigar() {
    setBusy(true);
    try {
      await apiFetch(`/api/job-cards/stages/${stage.id}`, { method: "PATCH", body: { karigarId } });
      toast.success("Karigar assigned");
      onChange();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Failed to assign karigar");
    } finally {
      setBusy(false);
    }
  }

  async function approveStage() {
    setBusy(true);
    try {
      await apiFetch(`/api/job-cards/stages/${stage.id}`, { method: "PATCH", body: { status: "APPROVED" } });
      toast.success("Stage approved");
      onChange();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Failed to approve stage");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="p-5">
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h3 className="font-semibold">{stage.processStage.name}</h3>
          <JobStageStatusBadge status={stage.status} />
        </div>
        {stage.status !== "APPROVED" && (
          <Button variant="outline" disabled={busy} onClick={approveStage}>
            Approve Stage
          </Button>
        )}
      </div>

      <div className="mb-3 flex flex-wrap items-center gap-2">
        <Select
          value={karigarId}
          onValueChange={(v) => setKarigarId(v ?? "")}
          items={karigars.map((k) => ({ value: k.id, label: k.name }))}
        >
          <SelectTrigger className="w-48">
            <SelectValue placeholder="Unassigned" />
          </SelectTrigger>
          <SelectContent>
            {karigars.map((k) => (
              <SelectItem key={k.id} value={k.id}>
                {k.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button variant="outline" disabled={busy || !karigarId} onClick={assignKarigar}>
          Assign
        </Button>
        <Button variant="link" size="sm" onClick={() => setShowAddKarigar(true)}>
          <Plus size={14} /> New Karigar
        </Button>
      </div>

      <Dialog open={showAddKarigar} onOpenChange={setShowAddKarigar}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Add Karigar</DialogTitle>
          </DialogHeader>
          <AddKarigarForm
            onCreated={(k) => {
              setKarigarId(k.id);
              setShowAddKarigar(false);
              onKarigarCreated();
              toast.success("Karigar added");
            }}
            onCancel={() => setShowAddKarigar(false)}
          />
        </DialogContent>
      </Dialog>

      {stage.materialIssues.length === 0 ? (
        <Button variant="outline" className="mb-3" onClick={() => setShowIssueDialog(true)} disabled={!stage.karigarId}>
          Issue Material
        </Button>
      ) : (
        <div className="mb-3 text-sm text-muted-foreground">
          Issued: {stage.materialIssues.map((mi) => formatWeight(mi.fineWeightG)).join(", ")} fine gold
        </div>
      )}
      <Dialog open={showIssueDialog} onOpenChange={setShowIssueDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Issue Material</DialogTitle>
          </DialogHeader>
          <IssueForm
            stageId={stage.id}
            karigarId={stage.karigarId!}
            onDone={() => {
              setShowIssueDialog(false);
              onChange();
            }}
          />
        </DialogContent>
      </Dialog>

      {stage.materialIssues.length > 0 && !stage.wastageRecord && (
        <Button size="shop-floor" variant="outline" className="mb-3 w-full sm:w-auto" onClick={() => setShowReceiptDialog(true)}>
          Receive &amp; Reconcile <span className="ml-1 opacity-70">· {hi.receipt.title}</span>
        </Button>
      )}
      <Dialog open={showReceiptDialog} onOpenChange={setShowReceiptDialog}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>
              Receive &amp; Reconcile <span className="font-normal text-muted-foreground">· {hi.receipt.title}</span>
            </DialogTitle>
          </DialogHeader>
          <ReceiptForm
            stageId={stage.id}
            karigarId={stage.karigarId!}
            fineIssuedG={stage.materialIssues.reduce((s, i) => s + Number(i.fineWeightG), 0)}
            grossIssuedG={stage.materialIssues.reduce((s, i) => s + Number(i.grossWeightG ?? 0), 0)}
            purityFactor={purityFactor}
            tolerancePct={Number(stage.processStage.wastageTolerancePct)}
            onDone={() => {
              setShowReceiptDialog(false);
              onChange();
            }}
          />
        </DialogContent>
      </Dialog>

      {stage.wastageRecord && <WastageDisplay wastage={stage.wastageRecord} stageId={stage.id} onChange={onChange} />}

      <LabourSection stage={stage} onChange={onChange} />
    </Card>
  );
}

function IssueForm({ stageId, karigarId, onDone }: { stageId: string; karigarId: string; onDone: () => void }) {
  const { data: karats } = useApi<{ id: string; code: string }[]>("/api/masters/karats");
  const [purityId, setPurityId] = useState("");
  const [grossWeightG, setGrossWeightG] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSubmitting(true);
    try {
      await apiFetch("/api/materials/issues", {
        method: "POST",
        body: {
          jobStageId: stageId,
          karigarId,
          materialType: "GOLD",
          purityId,
          grossWeightG: Number(grossWeightG),
        },
      });
      toast.success("Material issued");
      onDone();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Failed to issue material");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <div className="space-y-1.5">
        <Label>Purity</Label>
        <Select
          required
          value={purityId}
          onValueChange={(v) => setPurityId(v ?? "")}
          items={(karats ?? []).map((k) => ({ value: k.id, label: k.code }))}
        >
          <SelectTrigger className="w-full">
            <SelectValue placeholder="Select…" />
          </SelectTrigger>
          <SelectContent>
            {karats?.map((k) => (
              <SelectItem key={k.id} value={k.id}>
                {k.code}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-1.5">
        <Label>Gross Weight (g)</Label>
        <Input
          required
          type="number"
          step="0.001"
          value={grossWeightG}
          onChange={(e) => setGrossWeightG(e.target.value)}
        />
      </div>
      <Button type="submit" className="w-full" disabled={submitting}>
        {submitting ? "Issuing…" : "Issue"}
      </Button>
    </form>
  );
}

interface DustLot {
  id: string;
  lotNo: string;
  status: string;
}

function ReceiptForm({
  stageId,
  karigarId,
  fineIssuedG,
  grossIssuedG,
  purityFactor,
  tolerancePct,
  onDone,
}: {
  stageId: string;
  karigarId: string;
  fineIssuedG: number;
  grossIssuedG: number;
  purityFactor: number;
  tolerancePct: number;
  onDone: () => void;
}) {
  const { data: dustLots } = useApi<DustLot[]>("/api/materials/dust-lots");
  const openDustLots = dustLots?.filter((l) => l.status === "OPEN") ?? [];
  const [finishedPieceWeightG, setFinishedPieceWeightG] = useState("");
  const [fillerWeightG, setFillerWeightG] = useState("0");
  const [fillerNote, setFillerNote] = useState("");
  const [pieceWeightIsFine, setPieceWeightIsFine] = useState(true);
  const [dustWeightG, setDustWeightG] = useState("0");
  const [unusedReturnedWeightG, setUnusedReturnedWeightG] = useState("0");
  const [dustLotId, setDustLotId] = useState("");
  const [submitting, setSubmitting] = useState(false);

  // Weighted-average purity of what was actually issued to the karigar —
  // "unused returned" gold was never melted/alloyed, so it's valued at that
  // purity rather than the finished piece's target karat.
  const issuedPurityFactor = grossIssuedG > 0 ? fineIssuedG / grossIssuedG : purityFactor;
  const netPieceWeightG = Math.max((Number(finishedPieceWeightG) || 0) - (Number(fillerWeightG) || 0), 0);
  const preview = computeWastage({
    fineIssuedG,
    finePieceG: pieceWeightIsFine ? netPieceWeightG : fineWeight(netPieceWeightG, purityFactor),
    fineDustG: fineWeight(Number(dustWeightG) || 0, purityFactor),
    fineReturnedG: fineWeight(Number(unusedReturnedWeightG) || 0, issuedPurityFactor),
  });
  const withinTolerance = preview.wastagePct <= tolerancePct;
  const totalReturnedRawG =
    (Number(finishedPieceWeightG) || 0) + (Number(dustWeightG) || 0) + (Number(unusedReturnedWeightG) || 0);

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSubmitting(true);
    try {
      await apiFetch("/api/materials/receipts", {
        method: "POST",
        body: {
          jobStageId: stageId,
          karigarId,
          finishedPieceWeightG: Number(finishedPieceWeightG) || 0,
          fillerWeightG: Number(fillerWeightG) || 0,
          fillerNote: fillerNote || undefined,
          pieceWeightIsFine,
          dustWeightG: Number(dustWeightG) || 0,
          unusedReturnedWeightG: Number(unusedReturnedWeightG) || 0,
          dustLotId: Number(dustWeightG) > 0 && dustLotId ? dustLotId : undefined,
        },
      });
      toast.success("Receipt recorded");
      onDone();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Failed to record receipt");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={submit} className="grid gap-4 sm:grid-cols-2">
      <div className="space-y-4">
        <div className="space-y-1 rounded-lg border border-border p-3">
          <div className="text-sm text-muted-foreground">
            Gross Weight Issued <span className="text-xs">(karigar ko diya gaya kul vazan — weigh returns against this)</span>:{" "}
            <span className="font-medium text-foreground tabular-nums">{formatWeight(grossIssuedG)}</span>
          </div>
          <div className="text-xs text-muted-foreground">
            Fine Gold Issued <span className="text-xs">({hi.receipt.fineGoldIssued})</span>:{" "}
            <span className="tabular-nums">{formatWeight(fineIssuedG)}</span>
          </div>
          <p className="pt-1 text-xs text-muted-foreground">
            Enter weights exactly as weighed on the scale (raw, not fine). Their total should come close to the
            Gross Weight Issued above, not the Fine Gold Issued figure — unless the karigar mixed in wax or other
            filler to shape the piece, in which case the returned total will run higher; enter that filler weight
            separately below so it doesn't get counted as gold.
          </p>
        </div>
        <div>
          <label className="label-lg">
            Finished Piece Weight (g)
            <span className="label-hi">{hi.receipt.finishedPieceWeight} (ग्राम)</span>
          </label>
          <Input
            uiSize="shop-floor"
            required
            type="number"
            inputMode="decimal"
            step="0.001"
            className="tabular-nums"
            value={finishedPieceWeightG}
            onChange={(e) => setFinishedPieceWeightG(e.target.value)}
          />
        </div>
        <div>
          <label className="label-lg">
            Wax / Filler Weight (g)
            <span className="label-hi">{hi.receipt.fillerWeight} (ग्राम)</span>
          </label>
          <p className="mb-1 text-xs text-muted-foreground">
            Wax, solder, support wire, etc. mixed into the piece above purely to shape/hold it — has no gold value,
            so it's netted out before working out fine gold.
          </p>
          <Input
            uiSize="shop-floor"
            type="number"
            inputMode="decimal"
            step="0.001"
            max={finishedPieceWeightG || undefined}
            className="tabular-nums"
            value={fillerWeightG}
            onChange={(e) => setFillerWeightG(e.target.value)}
          />
          {Number(fillerWeightG) > 0 && (
            <Input
              className="mt-2"
              placeholder="What was added? (optional — e.g. wax, copper wire)"
              value={fillerNote}
              onChange={(e) => setFillerNote(e.target.value)}
            />
          )}
          <label className="mt-2 flex items-start gap-2 text-sm">
            <input
              type="checkbox"
              className="mt-0.5"
              checked={pieceWeightIsFine}
              onChange={(e) => setPieceWeightIsFine(e.target.checked)}
            />
            <span>
              The weight above (net of filler) is already the real gold content — don&apos;t reduce it further by
              the piece&apos;s karat.{" "}
              <span className="text-xs text-muted-foreground">(Recommended — uncheck only if that net weight is still raw alloy needing the purity factor applied.)</span>
            </span>
          </label>
        </div>
        <div>
          <label className="label-lg">
            Gold Dust Recovered (g)
            <span className="label-hi">{hi.receipt.dustRecovered} (ग्राम)</span>
          </label>
          <Input
            uiSize="shop-floor"
            type="number"
            inputMode="decimal"
            step="0.001"
            className="tabular-nums"
            value={dustWeightG}
            onChange={(e) => setDustWeightG(e.target.value)}
          />
          {Number(dustWeightG) > 0 && (
            <Select
              value={dustLotId}
              onValueChange={(v) => setDustLotId(v ?? "")}
              items={openDustLots.map((lot) => ({ value: lot.id, label: `Add to ${lot.lotNo}` }))}
            >
              <SelectTrigger className="mt-2 w-full">
                <SelectValue placeholder="Don't add to a dust lot" />
              </SelectTrigger>
              <SelectContent>
                {openDustLots.map((lot) => (
                  <SelectItem key={lot.id} value={lot.id}>
                    Add to {lot.lotNo}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>
        <div>
          <label className="label-lg">
            Unused Gold Returned (g)
            <span className="label-hi">{hi.receipt.unusedReturned} (ग्राम)</span>
          </label>
          <Input
            uiSize="shop-floor"
            type="number"
            inputMode="decimal"
            step="0.001"
            className="tabular-nums"
            value={unusedReturnedWeightG}
            onChange={(e) => setUnusedReturnedWeightG(e.target.value)}
          />
        </div>
        <div className="text-xs text-muted-foreground tabular-nums">
          Returned so far: {formatWeight(totalReturnedRawG)} of {formatWeight(grossIssuedG)} gross issued
        </div>
      </div>
      <div
        className={cn(
          "flex flex-col items-center justify-center rounded-lg p-4",
          withinTolerance ? "bg-success/10" : "bg-destructive/10"
        )}
      >
        <div className="mb-1 text-center text-sm text-muted-foreground">
          Net Wastage <span className="block">{hi.receipt.netWastage}</span>
        </div>
        <div className={cn("text-4xl font-bold tabular-nums", withinTolerance ? "text-success" : "text-destructive")}>
          {formatPct(preview.wastagePct)}
        </div>
        <div className="mt-1 text-sm text-muted-foreground">
          {formatWeight(preview.netWastageG)} · Tolerance {formatPct(tolerancePct)}
        </div>
        {!withinTolerance && (
          <p className="mt-2 text-center text-sm font-medium text-destructive">
            Exceeds tolerance — Manager approval required.
            <span className="block font-normal">{hi.receipt.exceedsTolerance}</span>
          </p>
        )}
        <Button type="submit" size="shop-floor" className="mt-3 w-full" disabled={submitting}>
          {submitting ? "Saving…" : `Submit Receipt · ${hi.receipt.submit}`}
        </Button>
      </div>
    </form>
  );
}

function WastageDisplay({ wastage, stageId, onChange }: { wastage: WastageRecord; stageId: string; onChange: () => void }) {
  const { user } = useAuth();
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [revising, setRevising] = useState(false);
  const canRevise = user?.role === "SUPER_ADMIN";
  const isPending = wastage.exceptionStatus === "PENDING";
  const isDecided = wastage.exceptionStatus === "APPROVED" || wastage.exceptionStatus === "REJECTED";
  const showForm = isPending || revising;

  async function decide(approve: boolean) {
    setSubmitting(true);
    try {
      await apiFetch(`/api/materials/wastage/${stageId}/decide`, {
        method: "POST",
        body: { approve, reason: reason || "No reason provided" },
      });
      toast.success(approve ? "Exception approved" : "Exception rejected");
      setRevising(false);
      onChange();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Failed to record decision");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className={cn("mb-3 rounded-lg p-3", wastage.withinTolerance ? "bg-success/10" : "bg-destructive/10")}>
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium">
          Wastage {formatPct(wastage.wastagePct)} ({wastage.withinTolerance ? "within tolerance" : "exceeds tolerance"})
        </span>
        <div className="flex items-center gap-2">
          <Badge variant="secondary">{wastage.exceptionStatus}</Badge>
          {canRevise && isDecided && !revising && (
            <Button variant="link" size="sm" onClick={() => setRevising(true)}>
              Edit Decision
            </Button>
          )}
        </div>
      </div>
      {showForm && (
        <div className="mt-3 space-y-2">
          {revising && wastage.exceptionReason && (
            <p className="text-xs text-muted-foreground">Current reason on file: {wastage.exceptionReason}</p>
          )}
          <Textarea
            className="min-h-24 text-base"
            placeholder={`Reason for excess wastage (required) · ${hi.receipt.reasonRequired}`}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
          />
          <div className="flex gap-2">
            <Button size="shop-floor" className="flex-1" disabled={submitting || !reason} onClick={() => decide(true)}>
              Approve Exception · {hi.receipt.approve}
            </Button>
            <Button
              size="shop-floor"
              variant="outline"
              className="flex-1"
              disabled={submitting || !reason}
              onClick={() => decide(false)}
            >
              Reject · {hi.receipt.reject}
            </Button>
            {revising && (
              <Button type="button" size="shop-floor" variant="ghost" onClick={() => setRevising(false)}>
                Cancel
              </Button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function LabourSection({ stage, onChange }: { stage: Stage; onChange: () => void }) {
  const [quantity, setQuantity] = useState("");
  const [rate, setRate] = useState("");
  const [rateBasis, setRateBasis] = useState("PER_GRAM");
  const [submitting, setSubmitting] = useState(false);

  async function addEntry(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSubmitting(true);
    try {
      await apiFetch("/api/labour/entries", {
        method: "POST",
        body: {
          jobStageId: stage.id,
          karigarId: stage.karigarId,
          rateBasis,
          quantity: Number(quantity),
          rate: rate ? Number(rate) : undefined,
        },
      });
      setQuantity("");
      setRate("");
      toast.success("Labour entry added");
      onChange();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Failed to add labour entry");
    } finally {
      setSubmitting(false);
    }
  }

  async function approve(id: string) {
    try {
      await apiFetch(`/api/labour/entries/${id}/approve`, { method: "POST" });
      toast.success("Labour entry approved");
      onChange();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Failed to approve entry");
    }
  }

  return (
    <div className="mt-3 border-t border-border pt-3">
      <h4 className="mb-2 text-sm font-medium">Labour</h4>
      {stage.labourEntries.map((l) => (
        <div key={l.id} className="flex items-center justify-between py-1 text-sm">
          <span>
            {l.rateBasis.replace(/_/g, " ")} · {l.quantity} × {formatINR(Number(l.rate))} ={" "}
            <span className="font-medium tabular-nums">{formatINR(Number(l.amount))}</span>
          </span>
          {l.status === "PENDING" ? (
            <Button variant="ghost" size="xs" onClick={() => approve(l.id)}>
              Approve
            </Button>
          ) : (
            <Badge variant="success">Approved</Badge>
          )}
        </div>
      ))}
      {stage.karigarId && (
        <form onSubmit={addEntry} className="mt-2 flex flex-wrap items-end gap-2">
          <Select
            value={rateBasis}
            onValueChange={(v) => setRateBasis(v ?? "PER_GRAM")}
            items={[
              { value: "PER_GRAM", label: "Per Gram" },
              { value: "PER_PIECE", label: "Per Piece" },
              { value: "PER_CARAT", label: "Per Carat" },
              { value: "DAILY_WAGE", label: "Daily Wage" },
            ]}
          >
            <SelectTrigger className="w-36">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="PER_GRAM">Per Gram</SelectItem>
              <SelectItem value="PER_PIECE">Per Piece</SelectItem>
              <SelectItem value="PER_CARAT">Per Carat</SelectItem>
              <SelectItem value="DAILY_WAGE">Daily Wage</SelectItem>
            </SelectContent>
          </Select>
          <Input
            required
            type="number"
            step="0.001"
            placeholder="Qty"
            className="w-24"
            value={quantity}
            onChange={(e) => setQuantity(e.target.value)}
          />
          <Input
            type="number"
            step="0.01"
            placeholder="Rate (optional)"
            className="w-32"
            value={rate}
            onChange={(e) => setRate(e.target.value)}
          />
          <Button type="submit" variant="outline" disabled={submitting}>
            Add
          </Button>
        </form>
      )}
    </div>
  );
}
