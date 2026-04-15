/**
 * AssetLogo — React Native
 * Fetch logo dari /api/asset/logos (sama seperti website),
 * tampilkan dengan Image. Fallback ke inisial berwarna.
 */
import React, { useState, useEffect } from "react";
import { View, Text, Image, Platform } from "react-native";

const BASE =
  Platform.OS === "web"
    ? "http://localhost:5000"
    : "http://192.168.20.155:5000";

// Global cache: symbol.toUpperCase() → URL
let logosCache: Record<string, string> = {};
let cacheLoaded = false;
let cacheLoading = false;
const listeners: (() => void)[] = [];

function loadCache() {
  if (cacheLoaded || cacheLoading) return;
  cacheLoading = true;
  fetch(`${BASE}/api/asset/logos`)
    .then((r) => r.json())
    .then((data) => {
      if (data && typeof data === "object") logosCache = data;
      cacheLoaded = true;
      cacheLoading = false;
      listeners.forEach((fn) => fn());
      listeners.length = 0;
    })
    .catch(() => {
      cacheLoaded = true;
      cacheLoading = false;
    });
}

function lookup(sym: string): string | null {
  return logosCache[sym] || logosCache[sym.toUpperCase()] || logosCache[sym.toLowerCase()] || null;
}

function useLogoUrl(symbol: string): string | null {
  const [url, setUrl] = useState<string | null>(() => lookup(symbol));
  useEffect(() => {
    const found = lookup(symbol);
    if (found) { setUrl(found); return; }
    if (!cacheLoaded) {
      loadCache();
      listeners.push(() => setUrl(lookup(symbol)));
    }
  }, [symbol]);
  return url;
}

function bgColor(tipe?: string) {
  if (tipe === "STABLECOIN" || tipe === "STABLECOIN_PEGGED") return "#2563EB";
  if (tipe === "SAHAM")      return "#8B0000";
  if (tipe === "NATIVE")     return "#C8922A";
  return "#6B7280";
}

interface AssetLogoProps {
  symbol: string;
  size?: number;
  tipe?: string;
}

export function AssetLogo({ symbol, size = 36, tipe }: AssetLogoProps) {
  const logoUrl = useLogoUrl(symbol?.toUpperCase() ?? "");
  const [imgError, setImgError] = useState(false);

  useEffect(() => { setImgError(false); }, [symbol]);

  const radius = size / 2;
  const fontSize = size <= 24 ? 8 : size <= 32 ? 10 : size <= 48 ? 13 : 17;

  if (logoUrl && !imgError) {
    return (
      <Image
        source={{ uri: logoUrl }}
        style={{ width: size, height: size, borderRadius: radius }}
        onError={() => setImgError(true)}
        resizeMode="contain"
      />
    );
  }

  // Fallback: lingkaran berwarna + inisial
  const initials = (symbol ?? "?").slice(0, 3).toUpperCase();
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: radius,
        backgroundColor: bgColor(tipe),
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <Text style={{ fontSize, fontFamily: "Inter_700Bold", color: "#fff" }}>
        {initials}
      </Text>
    </View>
  );
}
