"use client";

import { useEffect, useRef, useState } from "react";
import { useItemMasters, uploadItemImage, type ItemMaster } from "@/lib/production";
import { ApiError } from "@/lib/api";

type Tool = "pen" | "line" | "rect" | "circle" | "text";
type Pt = { x: number; y: number };
type Obj =
  | { type: "pen"; color: string; width: number; points: Pt[] }
  | { type: "line" | "rect" | "circle"; color: string; width: number; a: Pt; b: Pt }
  | { type: "text"; color: string; size: number; at: Pt; text: string };

const CW = 1000;
const CH = 640;
const COLORS = ["#111827", "#dc2626", "#2563eb", "#16a34a", "#d97706", "#7c3aed", "#ffffff"];

export default function MoodBoardPage() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const bgRef = useRef<HTMLImageElement | null>(null);
  const [objects, setObjects] = useState<Obj[]>([]);
  const [tool, setTool] = useState<Tool>("pen");
  const [color, setColor] = useState(COLORS[0]);
  const [width, setWidth] = useState(3);
  const [hasBg, setHasBg] = useState(false);
  const [saveOpen, setSaveOpen] = useState(false);

  // Active-drawing scratch state (kept in refs to avoid re-render per move).
  const drawing = useRef(false);
  const startPt = useRef<Pt | null>(null);
  const penPts = useRef<Pt[]>([]);

  function ctx() {
    return canvasRef.current?.getContext("2d") ?? null;
  }

  function paintObj(c: CanvasRenderingContext2D, o: Obj) {
    c.strokeStyle = o.type === "text" ? "" : o.color;
    if (o.type !== "text") {
      c.lineWidth = o.width;
      c.lineCap = "round";
      c.lineJoin = "round";
    }
    if (o.type === "pen") {
      c.beginPath();
      o.points.forEach((p, i) => (i ? c.lineTo(p.x, p.y) : c.moveTo(p.x, p.y)));
      c.stroke();
    } else if (o.type === "line") {
      c.beginPath(); c.moveTo(o.a.x, o.a.y); c.lineTo(o.b.x, o.b.y); c.stroke();
    } else if (o.type === "rect") {
      c.strokeRect(Math.min(o.a.x, o.b.x), Math.min(o.a.y, o.b.y), Math.abs(o.b.x - o.a.x), Math.abs(o.b.y - o.a.y));
    } else if (o.type === "circle") {
      c.beginPath();
      c.ellipse((o.a.x + o.b.x) / 2, (o.a.y + o.b.y) / 2, Math.abs(o.b.x - o.a.x) / 2, Math.abs(o.b.y - o.a.y) / 2, 0, 0, Math.PI * 2);
      c.stroke();
    } else if (o.type === "text") {
      c.fillStyle = o.color;
      c.font = `${o.size}px ui-sans-serif, system-ui, sans-serif`;
      c.textBaseline = "top";
      c.fillText(o.text, o.at.x, o.at.y);
    }
  }

  function redraw(extra?: Obj) {
    const c = ctx();
    if (!c) return;
    c.fillStyle = "#ffffff";
    c.fillRect(0, 0, CW, CH);
    const img = bgRef.current;
    if (img) {
      const scale = Math.min(CW / img.width, CH / img.height);
      const w = img.width * scale, h = img.height * scale;
      c.drawImage(img, (CW - w) / 2, (CH - h) / 2, w, h);
    }
    objects.forEach((o) => paintObj(c, o));
    if (extra) paintObj(c, extra);
  }

  useEffect(() => { redraw(); }, [objects, hasBg]); // eslint-disable-line react-hooks/exhaustive-deps

  function toCanvas(e: React.PointerEvent): Pt {
    const rect = canvasRef.current!.getBoundingClientRect();
    return { x: ((e.clientX - rect.left) / rect.width) * CW, y: ((e.clientY - rect.top) / rect.height) * CH };
  }

  function onDown(e: React.PointerEvent) {
    const p = toCanvas(e);
    if (tool === "text") {
      const text = window.prompt("Text:");
      if (text) setObjects((o) => [...o, { type: "text", color, size: Math.max(14, width * 6), at: p, text }]);
      return;
    }
    drawing.current = true;
    startPt.current = p;
    penPts.current = [p];
    canvasRef.current?.setPointerCapture(e.pointerId);
  }

  function onMove(e: React.PointerEvent) {
    if (!drawing.current) return;
    const p = toCanvas(e);
    if (tool === "pen") {
      penPts.current.push(p);
      redraw({ type: "pen", color, width, points: penPts.current });
    } else {
      redraw({ type: tool as "line" | "rect" | "circle", color, width, a: startPt.current!, b: p });
    }
  }

  function onUp(e: React.PointerEvent) {
    if (!drawing.current) return;
    drawing.current = false;
    const p = toCanvas(e);
    if (tool === "pen") {
      const pts = penPts.current;
      if (pts.length > 1) setObjects((o) => [...o, { type: "pen", color, width, points: pts }]);
    } else {
      const a = startPt.current!;
      if (a.x !== p.x || a.y !== p.y) setObjects((o) => [...o, { type: tool as "line" | "rect" | "circle", color, width, a, b: p }]);
    }
    penPts.current = [];
    startPt.current = null;
  }

  function onUploadBg(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => { bgRef.current = img; setHasBg(true); };
      img.src = reader.result as string;
    };
    reader.readAsDataURL(file);
  }

  function undo() { setObjects((o) => o.slice(0, -1)); }
  function clearAll() { setObjects([]); }

  function download() {
    const url = canvasRef.current!.toDataURL("image/png");
    const a = document.createElement("a");
    a.href = url; a.download = `mood-board-${Date.now()}.png`; a.click();
  }

  const TOOLS: { key: Tool; label: string }[] = [
    { key: "pen", label: "Pen" },
    { key: "line", label: "Line" },
    { key: "rect", label: "Box" },
    { key: "circle", label: "Circle" },
    { key: "text", label: "Text" },
  ];

  return (
    <div className="flex flex-col">
      <div className="mb-3">
        <h1 className="text-[18px] font-semibold text-slate-900">Sketch / Mood Board</h1>
        <p className="text-[12px] text-slate-500">Upload a reference image, sketch your ideas over it, then save it onto a design.</p>
      </div>

      <div className="flex flex-wrap items-center gap-2 mb-2 bg-white border border-slate-200 rounded-md p-2">
        <label className="h-8 px-3 rounded bg-blue-800 text-white text-[12px] font-medium hover:bg-blue-900 cursor-pointer flex items-center">
          Upload image
          <input type="file" accept="image/*" className="hidden" onChange={onUploadBg} />
        </label>
        <span className="w-px h-6 bg-slate-200" />
        {TOOLS.map((t) => (
          <button key={t.key} onClick={() => setTool(t.key)}
            className={`h-8 px-3 rounded text-[12px] border ${tool === t.key ? "bg-slate-900 text-white border-slate-900" : "border-slate-200 text-slate-700 hover:bg-slate-50"}`}>
            {t.label}
          </button>
        ))}
        <span className="w-px h-6 bg-slate-200" />
        <div className="flex items-center gap-1">
          {COLORS.map((c) => (
            <button key={c} onClick={() => setColor(c)} title={c}
              className={`w-6 h-6 rounded-full border ${color === c ? "ring-2 ring-offset-1 ring-blue-500" : "border-slate-300"}`}
              style={{ background: c }} />
          ))}
        </div>
        <label className="flex items-center gap-1.5 text-[12px] text-slate-600">
          Size
          <input type="range" min={1} max={20} value={width} onChange={(e) => setWidth(Number(e.target.value))} />
        </label>
        <span className="w-px h-6 bg-slate-200" />
        <button onClick={undo} className="h-8 px-3 rounded border border-slate-200 text-[12px] text-slate-700 hover:bg-slate-50">Undo</button>
        <button onClick={clearAll} className="h-8 px-3 rounded border border-slate-200 text-[12px] text-slate-700 hover:bg-slate-50">Clear</button>
        <div className="ml-auto flex gap-2">
          <button onClick={download} className="h-8 px-3 rounded border border-slate-200 text-[12px] text-slate-700 hover:bg-slate-50">Download</button>
          <button onClick={() => setSaveOpen(true)} className="h-8 px-3 rounded bg-emerald-600 text-white text-[12px] font-medium hover:bg-emerald-700">Save to design</button>
        </div>
      </div>

      <div className="bg-slate-100 border border-slate-200 rounded-md overflow-hidden inline-block max-w-full">
        <canvas
          ref={canvasRef}
          width={CW}
          height={CH}
          onPointerDown={onDown}
          onPointerMove={onMove}
          onPointerUp={onUp}
          onPointerLeave={onUp}
          className="w-full h-auto touch-none block"
          style={{ cursor: tool === "text" ? "text" : "crosshair", aspectRatio: `${CW} / ${CH}` }}
        />
      </div>

      {saveOpen && canvasRef.current && (
        <SaveToDesign canvas={canvasRef.current} onClose={() => setSaveOpen(false)} />
      )}
    </div>
  );
}

function SaveToDesign({ canvas, onClose }: { canvas: HTMLCanvasElement; onClose: () => void }) {
  const { data: items } = useItemMasters();
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  const filtered = (items ?? []).filter((it) =>
    !q.trim() ? true : `${it.name} ${it.serialNo ?? ""} ${it.designCode ?? ""}`.toLowerCase().includes(q.toLowerCase()),
  );

  async function saveTo(it: ItemMaster) {
    setBusy(true); setError(null);
    canvas.toBlob(async (blob) => {
      if (!blob) { setError("Could not render the sketch."); setBusy(false); return; }
      try {
        const file = new File([blob], `sketch-${Date.now()}.png`, { type: "image/png" });
        await uploadItemImage(it.id, file);
        setDone(it.name);
      } catch (e) {
        setError(e instanceof ApiError ? e.message : "Save failed.");
      } finally {
        setBusy(false);
      }
    }, "image/png");
  }

  return (
    <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50" onClick={onClose}>
      <div className="bg-white rounded-lg w-[440px] max-w-[95vw] shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="px-4 py-3 border-b border-slate-100"><h2 className="text-[14px] font-semibold">Save sketch to a design</h2></div>
        <div className="p-4">
          {done ? (
            <div className="text-[13px] text-emerald-700">Saved to <b>{done}</b> as a new image. You can close this.</div>
          ) : (
            <>
              <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search design by name / serial…"
                className="h-8 w-full px-2 rounded border border-slate-200 text-[12px] mb-2" />
              <div className="max-h-64 overflow-auto border border-slate-100 rounded">
                {filtered.length === 0 && <div className="py-6 text-center text-[12px] text-slate-400">No designs found.</div>}
                {filtered.map((it) => (
                  <button key={it.id} disabled={busy} onClick={() => saveTo(it)}
                    className="w-full text-left px-3 py-2 border-b border-slate-50 hover:bg-slate-50 disabled:opacity-50 text-[12px]">
                    <span className="font-medium text-slate-900">{it.name}</span>
                    <span className="text-slate-400 ml-2 mono">{it.serialNo}</span>
                  </button>
                ))}
              </div>
              {busy && <p className="text-[12px] text-slate-500 mt-2">Saving…</p>}
              {error && <p className="text-[12px] text-rose-600 mt-2">{error}</p>}
            </>
          )}
        </div>
        <div className="px-4 py-3 border-t border-slate-100 flex justify-end">
          <button onClick={onClose} className="h-8 px-3 rounded border border-slate-200 text-[12px]">Close</button>
        </div>
      </div>
    </div>
  );
}
