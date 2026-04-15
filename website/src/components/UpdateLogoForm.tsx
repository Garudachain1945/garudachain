import { useState, useRef } from "react";
import { apiUrl } from "@/lib/api-config";
import { AssetLogo } from "@/components/AssetLogo";
import { Upload, CheckCircle2, RefreshCw } from "lucide-react";

// Global cache reference — untuk force refresh setelah update
declare global {
  interface Window { _garudaLogoCache?: Record<string, string>; }
}

interface UpdateLogoFormProps {
  defaultSymbol?: string;   // pre-fill symbol (e.g. dari halaman saham)
  title?: string;
  compact?: boolean;        // tampilan ringkas untuk embed di card
}

export function UpdateLogoForm({ defaultSymbol = "", title = "Update Logo Aset", compact = false }: UpdateLogoFormProps) {
  const [symbol, setSymbol] = useState(defaultSymbol.toUpperCase());
  const [preview, setPreview] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploaded, setUploaded] = useState(false);
  const [ipfsUrl, setIpfsUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [key, setKey] = useState(0); // force re-render AssetLogo
  const inputRef = useRef<HTMLInputElement>(null);

  const handleSymbolChange = (v: string) => {
    setSymbol(v.toUpperCase());
    setPreview(null);
    setUploaded(false);
    setIpfsUrl(null);
    setError(null);
  };

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setError("Hanya file gambar (PNG, JPG, SVG, WebP)");
      return;
    }
    if (!symbol) {
      setError("Masukkan symbol/kode token dulu");
      return;
    }
    setError(null);
    setUploaded(false);
    setIpfsUrl(null);

    // Preview lokal
    const reader = new FileReader();
    reader.onload = (ev) => setPreview(ev.target?.result as string);
    reader.readAsDataURL(file);

    // Upload ke Pinata via API
    setUploading(true);
    try {
      const form = new FormData();
      form.append("logo", file);
      const res = await fetch(apiUrl(`/api/asset/logo/${symbol}`), {
        method: "POST",
        body: form,
      }).then(r => r.json());

      if (res.status === "ok" && res.ipfs_url) {
        setUploaded(true);
        setIpfsUrl(res.ipfs_url);
        // Update global logo cache
        setKey(k => k + 1); // force AssetLogo re-render
        // Invalidate browser cache for this symbol
        if (typeof window !== "undefined") {
          window._garudaLogoCache = window._garudaLogoCache || {};
          window._garudaLogoCache[symbol] = res.ipfs_url;
        }
      } else {
        setError(res.error || "Upload gagal");
      }
    } catch {
      setError("Koneksi gagal");
    }
    setUploading(false);
    if (inputRef.current) inputRef.current.value = "";
  };

  if (compact) {
    return (
      <div className="flex items-center gap-3">
        <div className="relative cursor-pointer" onClick={() => inputRef.current?.click()}>
          <AssetLogo key={key} symbol={symbol} size={48} />
          <div className="absolute inset-0 rounded-full bg-black/0 hover:bg-black/20 flex items-center justify-center transition-all">
            <Upload className="w-4 h-4 text-white opacity-0 group-hover:opacity-100" />
          </div>
        </div>
        <div className="flex-1">
          <p className="text-xs font-semibold text-foreground mb-1">Logo {symbol}</p>
          <label className="cursor-pointer inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border border-border hover:bg-gray-50 transition-colors">
            <Upload className="w-3.5 h-3.5" />
            {uploading ? "Uploading..." : uploaded ? "Update lagi" : "Upload Logo"}
            <input ref={inputRef} type="file" accept="image/*" className="hidden" onChange={handleFile} disabled={uploading} />
          </label>
          {uploaded && <p className="text-[10px] text-green-600 font-semibold mt-1">✓ Logo tersimpan di IPFS</p>}
          {error && <p className="text-[10px] text-red-500 mt-1">{error}</p>}
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white border border-border rounded-xl p-6 shadow-sm">
      <h3 className="font-bold text-lg mb-1 flex items-center gap-2">
        <Upload className="w-5 h-5" style={{ color: "#8B0000" }} />
        {title}
      </h3>
      <p className="text-sm text-muted-foreground mb-5">
        Upload logo untuk saham, stablecoin, atau GRD. Logo disimpan permanen di Pinata IPFS dan otomatis muncul di seluruh website — DEX, halaman saham, token explorer, transfer, dll.
      </p>

      <div className="flex flex-col sm:flex-row gap-6">
        {/* Preview area */}
        <div className="flex flex-col items-center gap-2 shrink-0">
          <div className="relative">
            <AssetLogo key={key} symbol={symbol || "?"} size={80} />
            {uploaded && (
              <div className="absolute -bottom-1 -right-1 w-6 h-6 bg-green-500 rounded-full flex items-center justify-center border-2 border-white">
                <CheckCircle2 className="w-3.5 h-3.5 text-white" />
              </div>
            )}
          </div>
          <p className="text-[11px] text-muted-foreground font-mono">{symbol || "—"}</p>
        </div>

        {/* Form */}
        <div className="flex-1 space-y-4">
          {/* Symbol input */}
          <div>
            <label className="text-xs font-semibold text-muted-foreground block mb-1">Kode Token / Symbol</label>
            <input
              type="text"
              value={symbol}
              onChange={e => handleSymbolChange(e.target.value)}
              placeholder="Contoh: BBCA, gIDR, GRD"
              className="w-full border border-border rounded-lg px-3 py-2 text-sm font-mono uppercase focus:outline-none focus:ring-2 focus:ring-[#8B0000]/20 focus:border-[#8B0000]"
              maxLength={12}
            />
          </div>

          {/* Upload button */}
          <div>
            <label className="text-xs font-semibold text-muted-foreground block mb-1">File Logo</label>
            <label className={`cursor-pointer flex items-center gap-3 border-2 border-dashed rounded-lg px-4 py-3 transition-colors ${
              !symbol ? "opacity-50 cursor-not-allowed border-border" : "border-border hover:border-[#8B0000]/50 hover:bg-red-50/30"
            }`}>
              {preview ? (
                <img src={preview} alt="preview" className="w-10 h-10 rounded-lg object-cover shrink-0" />
              ) : (
                <div className="w-10 h-10 rounded-lg bg-gray-100 flex items-center justify-center shrink-0">
                  <Upload className="w-4 h-4 text-muted-foreground" />
                </div>
              )}
              <div className="flex-1">
                {uploading ? (
                  <div className="flex items-center gap-2">
                    <RefreshCw className="w-4 h-4 animate-spin text-[#8B0000]" />
                    <span className="text-sm font-medium text-[#8B0000]">Uploading ke Pinata IPFS...</span>
                  </div>
                ) : uploaded ? (
                  <div>
                    <p className="text-sm font-semibold text-green-700">Logo berhasil diupdate!</p>
                    {ipfsUrl && <p className="text-[10px] font-mono text-muted-foreground truncate">{ipfsUrl}</p>}
                  </div>
                ) : (
                  <div>
                    <p className="text-sm font-medium text-foreground">Klik untuk pilih gambar</p>
                    <p className="text-[11px] text-muted-foreground">PNG, JPG, SVG, WebP — max 5MB</p>
                  </div>
                )}
              </div>
              <input
                ref={inputRef}
                type="file"
                accept="image/png,image/jpeg,image/svg+xml,image/webp"
                className="hidden"
                onChange={handleFile}
                disabled={uploading || !symbol}
              />
            </label>
          </div>

          {error && (
            <p className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-lg">{error}</p>
          )}

          {uploaded && (
            <div className="bg-green-50 border border-green-200 rounded-lg px-4 py-3 text-sm text-green-700">
              <p className="font-semibold mb-0.5">✓ Logo {symbol} tersimpan di IPFS</p>
              <p className="text-[11px]">Logo akan muncul otomatis di seluruh halaman website. Logo lama otomatis tergantikan.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
