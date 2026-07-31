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
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Visual Search</h1>
        <p className="text-sm text-text-muted mt-1">
          Upload a photo of a jewelry piece to instantly find visually similar designs from your catalogue using AI.
        </p>
      </div>

      <div className="grid md:grid-cols-3 gap-6">
        <div className="md:col-span-1 space-y-4">
          <div className="card p-5 border-dashed border-2 border-border flex flex-col items-center justify-center text-center bg-bg">
            {preview ? (
              <div className="space-y-4 w-full">
                <img src={preview} alt="Upload preview" className="w-full max-h-64 object-contain rounded-lg" />
                <button 
                  className="btn btn-outline w-full"
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
              <div className="py-10 space-y-3 cursor-pointer w-full" onClick={() => fileInputRef.current?.click()}>
                <div className="mx-auto w-12 h-12 rounded-full bg-gold-tint text-gold flex items-center justify-center">
                  <Upload size={24} />
                </div>
                <div>
                  <p className="font-medium">Click to upload image</p>
                  <p className="text-xs text-text-muted mt-1">JPEG, PNG up to 5MB</p>
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
            className="btn btn-primary w-full py-3"
            disabled={!file || loading}
            onClick={handleSearch}
          >
            {loading ? "Searching..." : <><Search size={18} className="mr-2 inline" /> Find Similar Designs</>}
          </button>

          {error && <p className="text-sm text-danger text-center">{error}</p>}
        </div>

        <div className="md:col-span-2">
          {loading && (
            <div className="h-full flex items-center justify-center text-text-muted py-20">
              <div className="animate-pulse flex flex-col items-center">
                <Search size={40} className="mb-4 text-gold" />
                <p>Analyzing image vectors...</p>
              </div>
            </div>
          )}

          {!loading && results && (
            <div className="space-y-4">
              <h2 className="font-medium border-b border-border pb-2">
                Top Matches ({results.length})
              </h2>
              
              {results.length === 0 ? (
                <p className="text-text-muted py-10 text-center">No similar designs found in the catalogue.</p>
              ) : (
                <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  {results.map((res) => (
                    <Link key={res.imageId} href={`/products/${res.serialNo}`} className="card overflow-hidden hover:border-gold transition-colors group">
                      <div className="aspect-square bg-bg relative overflow-hidden">
                        <img 
                          src={resolveMediaUrl(res.imageUrl)}  
                          alt={res.designName}
                          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" 
                        />
                        <div className="absolute top-2 left-2">
                          <ProductStatusPill status={res.status} />
                        </div>
                      </div>
                      <div className="p-3">
                        <div className="font-mono text-xs text-gold mb-1">{res.serialNo}</div>
                        <h3 className="font-medium text-sm truncate">{res.designName}</h3>
                        {/* Cosine distance: 0 = perfect match, 2 = opposite. 
                            If it's L2 distance, it might be different, but pgvector <-> is L2. 
                            For L2 distance on normalized vectors, max is 2. */}
                        <div className="text-xs text-text-muted mt-2 text-right">
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
            <div className="h-full flex flex-col items-center justify-center text-text-muted py-20 border-2 border-dashed border-border rounded-lg">
              <ImageIcon size={48} className="mb-4 opacity-20" />
              <p>Upload a photo to see results</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
