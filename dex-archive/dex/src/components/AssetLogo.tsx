import { useState, useEffect } from "react";
import { apiUrl } from "@/lib/api-config";

// Global cache: symbol → IPFS URL
let logosCache: Record<string, string> = {};
let cacheLoaded = false;
let cacheLoading = false;
const cacheListeners: (() => void)[] = [];

function loadLogosCache() {
  if (cacheLoaded || cacheLoading) return;
  cacheLoading = true;
  fetch(apiUrl("/api/asset/logos"))
    .then(r => r.json())
    .then(data => {
      if (data && typeof data === "object") {
        logosCache = data;
      }
      cacheLoaded = true;
      cacheLoading = false;
      cacheListeners.forEach(fn => fn());
      cacheListeners.length = 0;
    })
    .catch(() => { cacheLoaded = true; cacheLoading = false; });
}

function useLogoUrl(symbol: string): string | null {
  // Cek exact match dulu, lalu case-insensitive
  const lookup = (s: string) =>
    logosCache[s] || logosCache[s.toUpperCase()] || logosCache[s.toLowerCase()] || null;

  const [url, setUrl] = useState<string | null>(() => lookup(symbol));

  useEffect(() => {
    const found = lookup(symbol);
    if (found) { setUrl(found); return; }
    if (!cacheLoaded) {
      loadLogosCache();
      cacheListeners.push(() => setUrl(lookup(symbol)));
    }
  }, [symbol]);

  return url;
}

function bgColor(tipe?: string) {
  if (tipe === "STABLECOIN") return "#2563eb";
  if (tipe === "OBLIGASI") return "#7c3aed";
  return "#8B0000";
}

// Currency code → country code for flag emoji
const CURRENCY_COUNTRY: Record<string, string> = {
  EUR: "EU", XAF: "CM", XOF: "SN", XPF: "PF", XCD: "AG", XDR: "UN",
  ANG: "CW", AWG: "AW", SHP: "SH", FKP: "FK", GGP: "GG", JEP: "JE",
  IMP: "IM", TVD: "TV", KID: "KI", ZWL: "ZW",
};
const CRYPTO_SET = new Set(["BTC","ETH","ADA","DOT","SOL","AKT","APE","APT","ARB","ATOM","AVAX","AXS","BAT","BCH","BNB","BONK","COMP","CRO","DAI","DOGE","EOS","FET","FIL","FLOKI","FLOW","FTM","GALA","GRT","HBAR","ICP","IMX","INJ","JASMY","JUP","KAS","KERA","LDO","LEO","LINK","LTC","MANA","MATIC","MKR","NEAR","NEO","NOT","OP","PEPE","QNT","RENDER","RUNE","SAND","SEI","SHIB","STX","SUI","TAO","THETA","TIA","TON","TRX","UNI","USDC","USDT","VET","WIF","WLD","XLM","XMR","XRP","ZEC","ZIL","AAVE","ALGO","AMP","CHZ","DASH","DYDX","ENA","ENS","IOTA","MINA","NEXO","ONDO","PENDLE","PYTH","STRK","W","WOO","ZRX","GRD"]);

function getCurrencyFlag(symbol: string): string | null {
  const upper = (symbol || "").toUpperCase();
  // Strip leading 'p' for pegged tokens (pGBP → GBP)
  const base = upper.startsWith("P") && upper.length > 1 ? upper.slice(1) : upper;
  if (CRYPTO_SET.has(upper) || CRYPTO_SET.has(base)) return null;
  const cc = CURRENCY_COUNTRY[base] || base.slice(0, 2);
  if (cc.length !== 2) return null;
  return [...cc].map(c => String.fromCodePoint(0x1F1E6 + c.charCodeAt(0) - 65)).join("");
}

interface AssetLogoProps {
  symbol: string;
  size?: number;
  className?: string;
  tipe?: string;
}

export function AssetLogo({ symbol, size = 32, className = "", tipe }: AssetLogoProps) {
  const logoUrl = useLogoUrl(symbol?.toUpperCase());
  const [imgError, setImgError] = useState(false);

  // Reset error when symbol changes
  useEffect(() => { setImgError(false); }, [symbol]);

  if (logoUrl && !imgError) {
    return (
      <img
        src={logoUrl}
        alt={symbol}
        width={size}
        height={size}
        className={`shrink-0 ${className}`}
        style={{ width: size, height: size, minWidth: size, objectFit: "contain", display: "block" }}
        onError={() => setImgError(true)}
      />
    );
  }

  // Stablecoin fallback: show country flag emoji
  if (tipe === "STABLECOIN" || tipe === "ORACLE" || tipe === "STABLECOIN_PEGGED" || tipe === "SAHAM") {
    const flag = getCurrencyFlag(symbol);
    if (flag) {
      const flagSize = size <= 24 ? 16 : size <= 32 ? 22 : size <= 48 ? 32 : 40;
      return (
        <div
          className={`flex items-center justify-center shrink-0 ${className}`}
          style={{ width: size, height: size, minWidth: size, fontSize: flagSize, lineHeight: 1 }}
        >
          {flag}
        </div>
      );
    }
  }

  // Fallback: inisial berwarna dengan rounded
  const initials = symbol?.slice(0, 3).toUpperCase() || "??";
  const fontSize = size <= 24 ? 8 : size <= 32 ? 10 : size <= 48 ? 13 : 17;

  return (
    <div
      className={`rounded-full flex items-center justify-center font-bold text-white shrink-0 ${className}`}
      style={{ width: size, height: size, minWidth: size, background: bgColor(tipe), fontSize }}
    >
      {initials}
    </div>
  );
}

// Komponen upload logo — dipakai di form penerbitan aset
interface AssetLogoUploadProps {
  symbol: string;
  size?: number;
  onUploaded?: (ipfsUrl: string) => void;
}

export function AssetLogoUpload({ symbol, size = 80, onUploaded }: AssetLogoUploadProps) {
  const [preview, setPreview] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploaded, setUploaded] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setError("Hanya file gambar (PNG, JPG, SVG, WebP)");
      return;
    }
    setError(null);

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

      if (res.status === "ok") {
        setUploaded(true);
        // Update cache
        logosCache[symbol.toUpperCase()] = res.ipfs_url;
        onUploaded?.(res.ipfs_url);
      } else {
        setError(res.error || "Upload gagal");
      }
    } catch {
      setError("Koneksi gagal");
    }
    setUploading(false);
  };

  return (
    <div className="flex flex-col items-center gap-1">
      <label className="cursor-pointer block">
        <div
          className="rounded-full border-2 border-dashed border-border hover:border-[#8B0000] flex items-center justify-center overflow-hidden transition-colors relative"
          style={{ width: size, height: size }}
        >
          {preview ? (
            <img src={preview} alt="logo" className="w-full h-full object-cover" />
          ) : (
            <div className="text-center px-1">
              <p className="text-[9px] text-muted-foreground leading-tight">Upload<br />Logo</p>
            </div>
          )}
          {uploading && (
            <div className="absolute inset-0 bg-black/40 flex items-center justify-center rounded-full">
              <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
            </div>
          )}
          {uploaded && !uploading && (
            <div className="absolute bottom-0 right-0 w-5 h-5 bg-green-500 rounded-full flex items-center justify-center border-2 border-white">
              <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
              </svg>
            </div>
          )}
        </div>
        <input type="file" accept="image/png,image/jpeg,image/svg+xml,image/webp" className="hidden" onChange={handleFile} disabled={uploading} />
      </label>
      <p className="text-[9px] text-muted-foreground">
        {uploaded ? <span className="text-green-600 font-semibold">✓ IPFS</span> : uploading ? "Uploading..." : "PNG/JPG/SVG"}
      </p>
      {error && <p className="text-[9px] text-red-500">{error}</p>}
    </div>
  );
}
