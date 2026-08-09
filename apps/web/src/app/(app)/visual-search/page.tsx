"use client";

import { useState, useRef } from "react";
import Link from "next/link";
import { Upload, Image as ImageIcon, Search } from "lucide-react";
import { ProductStatusPill } from "@/components/StatusPill";
import { apiFetch, resolveMediaUrl } from "@/lib/api";

interface SearchResult {
  imageId: string;
  imageUrl: string;
  productId: string;
  serialNo: string;
  designName: string;
  status: string;
  distance: number;
}

export default function VisualSearchPage() {
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<SearchResult[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const selected = e.target.files[0];
      setFile(selected);
      setPreview(URL.createObjectURL(selected));
      setResults(null);
      setError(null);
    }
  };

  const handleSearch = async () => {
    if (!file) return;
    setLoading(true);
    setError(null);

    const formData = new FormData();
    formData.append("image", file);

    try {
      const data = await apiFetch<SearchResult[]>("/api/products/visual-search", {
        method: "POST",
        body: formData,
      });
      setResults(data);
    } catch (err: any) {
      setError(err.message || "An error occurred during search");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      <div className="mb-3.5">
        <div className="text-[11px] text-mute mb-1">Product</div>
        <h1 className="text-[19px] font-semibold text-ink">Visual Search</h1>
        <p className="text-xs text-ink2 mt-0.5">
          Upload a photo of a jewelry piece to instantly find visually similar designs from your catalogue using AI.
        </p>
      </div>

      <div className="grid md:grid-cols-3 gap-3.5">
        <div className="md:col-span-1 space-y-3">
          <div className="console-panel p-4 border-dashed border-2 flex flex-col items-center justify-center text-center bg-neu-bg">
            {preview ? (
              <div className="space-y-3 w-full">
                <img src={preview} alt="Upload preview" className="w-full max-h-64 object-contain rounded-md" />
                <button
                  className="console-btn w-full justify-center"
                  onClick={() => {
                    setFile(null);
                    setPreview(null);
                    setResults(null);
                  }}
                >
                  Clear Image
                </button>
              </div>
            ) : (
              <div className="py-10 space-y-2.5 cursor-pointer w-full" onClick={() => fileInputRef.current?.click()}>
                <div className="mx-auto w-11 h-11 rounded-full bg-accent-bg text-accent flex items-center justify-center">
                  <Upload size={22} />
                </div>
                <div>
                  <p className="font-medium text-[12.5px] text-ink">Click to upload image</p>
                  <p className="text-xs text-mute mt-1">JPEG, PNG up to 5MB</p>
                </div>
              </div>
            )}
            <input
              type="file"
              className="hidden"
              ref={fileInputRef}
              accept="image/jpeg, image/png, image/webp"
              onChange={handleFileChange}
            />
          </div>

          <button
            className="console-btn primary w-full justify-center py-2.5"
            disabled={!file || loading}
            onClick={handleSearch}
          >
            {loading ? "Searching..." : <><Search size={16} className="mr-1.5 inline" /> Find Similar Designs</>}
          </button>

          {error && <p className="text-sm text-err-tx text-center">{error}</p>}
        </div>

        <div className="md:col-span-2">
          {loading && (
            <div className="h-full flex items-center justify-center text-mute py-20">
              <div className="animate-pulse flex flex-col items-center">
                <Search size={36} className="mb-3 text-accent" />
                <p className="text-sm">Analyzing image vectors...</p>
              </div>
            </div>
          )}

          {!loading && results && (
            <div>
              <h2 className="text-[11px] font-bold uppercase text-ink2 tracking-wide border-b border-line pb-2 mb-3">
                Top Matches ({results.length})
              </h2>

              {results.length === 0 ? (
                <p className="text-mute py-10 text-center text-sm">No similar designs found in the catalogue.</p>
              ) : (
                <div className="pgrid">
                  {results.map((res) => (
                    <Link key={res.imageId} href={`/products/${res.serialNo}`} className="border border-line rounded-md overflow-hidden bg-panel hover:border-accent transition-colors">
                      <div className="aspect-square bg-neu-bg relative overflow-hidden">
                        <img
                          src={resolveMediaUrl(res.imageUrl)}
                          alt={res.designName}
                          className="w-full h-full object-cover"
                        />
                        <div className="absolute top-2 left-2">
                          <ProductStatusPill status={res.status} />
                        </div>
                      </div>
                      <div className="p-2.5">
                        <div className="mono text-[11px] text-accent mb-0.5">{res.serialNo}</div>
                        <h3 className="text-[12.5px] font-semibold text-ink truncate">{res.designName}</h3>
                        <div className="text-[11px] text-mute mt-1.5 text-right mono">
                          Score: {res.distance.toFixed(3)}
                        </div>
                      </div>
                    </Link>
                  ))}
                </div>
              )}
            </div>
          )}

          {!loading && !results && !preview && (
            <div className="h-full flex flex-col items-center justify-center text-mute py-20 border-2 border-dashed border-line rounded-md">
              <ImageIcon size={44} className="mb-3 opacity-20" />
              <p className="text-sm">Upload a photo to see results</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
