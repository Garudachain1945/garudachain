/**
 * GarudaChain API Client
 * Terhubung ke REST API blockchain di port 5000
 */

import { Platform } from "react-native";

const BASE =
  Platform.OS === "web"
    ? "http://localhost:5000"
    : "http://192.168.20.155:5000";

async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });
  if (!res.ok) {
    const txt = await res.text().catch(() => res.statusText);
    throw new Error(`API ${path} → ${res.status}: ${txt}`);
  }
  return res.json() as Promise<T>;
}

// ── Types ────────────────────────────────────────────────────────────────

export interface BlockchainStats {
  latestBlock: number;
  totalTransactions: number;
  totalAddresses: number;
  avgBlockTime: number;
  tps: number;
  validators: number;
  networkName: string;
  chainId: number;
  tokenSymbol: string;
  hashrate: number;
  difficulty: number;
  blockReward: number;
  totalSupply: number;
}

export interface TxItem {
  txid: string;
  block: number;
  timestamp: string;
  from: string;
  to: string;
  value: number;   // satoshi
  fee: number;     // satoshi
  method: string;
  confirmed: boolean;
}

export interface AddressInfo {
  address: string;
  balance: number;       // satoshi
  received: number;      // satoshi
  sent: number;          // satoshi
  txCount: number;
  transactions: TxItem[];
  utxoCount: number;
}

export interface UTXO {
  txid: string;
  vout: number;
  value: number;   // satoshi
  amount: number;  // GRD float
}

export interface Block {
  height: number;
  hash: string;
  time: number;
  txCount: number;
  size: number;
  miner: string;
}

export interface AssetInfo {
  id: string;
  name: string;
  symbol: string;
  supply: number;
  price: number;
  type: string;
}

// ── Helpers ──────────────────────────────────────────────────────────────

/** Konversi satoshi ke GRD string e.g. "10.50000000 GRD" */
export function satoshiToGRD(sat: number): number {
  return sat / 1e8;
}

/** Format GRD dengan 8 desimal */
export function formatGRD(sat: number): string {
  const grd = satoshiToGRD(sat);
  if (grd === 0) return "0 GRD";
  if (grd < 0.001) return `${grd.toFixed(8)} GRD`;
  if (grd < 1) return `${grd.toFixed(6)} GRD`;
  return `${grd.toLocaleString("id-ID", { maximumFractionDigits: 4 })} GRD`;
}

/** Potong alamat grd1q... menjadi grd1q...xxxx */
export function shortAddr(addr: string): string {
  if (!addr || addr.length < 12) return addr;
  return `${addr.slice(0, 10)}...${addr.slice(-6)}`;
}

// ── Endpoints ────────────────────────────────────────────────────────────

export async function getBlockchainStats(): Promise<BlockchainStats> {
  return apiFetch<BlockchainStats>("/api/blockchain/stats");
}

export async function getAddressInfo(address: string): Promise<AddressInfo> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const raw = await apiFetch<any>(`/api/blockchain/address/${address}`);
  // API mengembalikan nilai dalam GRD string (e.g. "2001.00000000")
  // Konversi ke satoshi agar formatGRD() bekerja dengan benar
  const toSat = (v: unknown): number => {
    if (typeof v === "number") return v;
    const f = parseFloat(String(v));
    return isNaN(f) ? 0 : Math.round(f * 1e8);
  };
  return {
    ...raw,
    balance: toSat(raw.balance),
    received: toSat(raw.received),
    sent: toSat(raw.sent),
    transactions: Array.isArray(raw.transactions) ? raw.transactions : [],
  } as AddressInfo;
}

export async function getUTXOs(address: string): Promise<UTXO[]> {
  const data = await apiFetch<{ utxos: UTXO[] } | UTXO[]>(
    `/api/wallet/utxos?address=${address}`
  );
  return Array.isArray(data) ? data : (data as { utxos: UTXO[] }).utxos ?? [];
}

export async function broadcastTx(hex: string): Promise<{ txid: string }> {
  return apiFetch<{ txid: string }>("/api/broadcast", {
    method: "POST",
    body: JSON.stringify({ hex }),
  });
}

export async function getLatestBlocks(limit = 10): Promise<Block[]> {
  const data = await apiFetch<{ blocks: Block[] } | Block[]>(
    `/api/blockchain/blocks?limit=${limit}`
  );
  return Array.isArray(data) ? data : (data as { blocks: Block[] }).blocks ?? [];
}

export async function getLatestTransactions(limit = 20): Promise<TxItem[]> {
  const data = await apiFetch<{ transactions: TxItem[] } | TxItem[]>(
    `/api/blockchain/transactions?limit=${limit}`
  );
  return Array.isArray(data)
    ? data
    : (data as { transactions: TxItem[] }).transactions ?? [];
}

export async function searchChain(q: string) {
  return apiFetch<{ type: string; data: unknown }>(`/api/blockchain/search?q=${encodeURIComponent(q)}`);
}

export async function getAssets(): Promise<AssetInfo[]> {
  const data = await apiFetch<{ assets: AssetInfo[] } | AssetInfo[]>(
    "/api/blockchain/stocks"
  );
  return Array.isArray(data) ? data : (data as { assets: AssetInfo[] }).assets ?? [];
}

export async function getAssetDetail(id: string): Promise<AssetInfo | null> {
  try {
    return await apiFetch<AssetInfo>(`/api/blockchain/stock/${id}`);
  } catch {
    return null;
  }
}

export async function getAssetOrderbook(id: string) {
  return apiFetch(`/api/blockchain/orderbook/${id}`);
}

export async function placeDEXOrder(params: {
  order_type: "limit" | "market";
  side: "buy" | "sell";
  asset_id: string;
  amount: number;
  price?: number;
  address: string;
}) {
  return apiFetch("/api/dex/order", {
    method: "POST",
    body: JSON.stringify(params),
  });
}

export async function cbdcTransfer(params: {
  from: string;
  to: string;
  asset_id: string;
  amount: number;
  privkey?: string;
}) {
  return apiFetch("/api/cbdc/transfer", {
    method: "POST",
    body: JSON.stringify(params),
  });
}

export async function getStablecoins() {
  return apiFetch<{ stablecoins: AssetInfo[] }>("/api/blockchain/stablecoins");
}

export async function getMiningInfo() {
  return apiFetch("/api/blockchain/mining");
}

// ── DEX / Swap ────────────────────────────────────────────────────────────

export interface StablecoinEntry {
  assetId: string;
  symbol: string;
  name: string;
}

export interface StockEntry {
  assetId: string;
  symbol: string;
  name: string;
}

export async function getStablecoinList(): Promise<StablecoinEntry[]> {
  const data = await apiFetch<any>("/api/blockchain/stablecoins");
  const list: any[] = Array.isArray(data) ? data : (data?.stablecoins ?? []);
  return list.map((s) => ({
    assetId: s.assetId ?? s.asset_id ?? "",
    symbol: s.symbol ?? s.kode ?? "",
    name: s.name ?? s.nama ?? "",
  }));
}

export async function getStablecoinPegRate(assetId: string, symbol?: string): Promise<number> {
  // Use real-time oracle rates (updated per second) if symbol is available
  if (symbol) {
    try {
      const data = await apiFetch<{ grd_per_unit: number }[]>(`/api/oracle/rates?symbol=${symbol}`);
      if (Array.isArray(data) && data.length > 0 && data[0].grd_per_unit > 0) {
        return data[0].grd_per_unit;
      }
    } catch { /* fallback below */ }
  }
  // Fallback: query peg info by asset ID
  try {
    const data = await apiFetch<{ peg_rate_grd?: number; peg_rate?: number }>(`/api/blockchain/peg/${assetId}`);
    if (data.peg_rate_grd && data.peg_rate_grd > 0) return data.peg_rate_grd;
    if (data.peg_rate && data.peg_rate > 0) return data.peg_rate;
    return 0.001;
  } catch {
    return 0.001;
  }
}

export async function getPeggedStablecoinList(): Promise<StablecoinEntry[]> {
  const data = await apiFetch<any[]>("/api/blockchain/tokens");
  const list: any[] = Array.isArray(data) ? data : [];
  return list
    .filter((t) => t.type === "STABLECOIN_PEGGED")
    .map((s) => ({
      assetId: s.assetId ?? s.asset_id ?? "",
      symbol: s.symbol ?? "",
      name: s.name ?? "",
    }));
}

export async function getStockList(): Promise<StockEntry[]> {
  const data = await apiFetch<any>("/api/blockchain/stocks");
  const list: any[] = Array.isArray(data) ? data : (data?.assets ?? data?.stocks ?? []);
  return list.map((s) => ({
    assetId: s.assetId ?? s.asset_id ?? "",
    symbol: s.kode ?? s.symbol ?? "",
    name: s.nama ?? s.name ?? "",
  }));
}

export async function prepareTokenTransfer(params: {
  asset_id: string;
  amount: number;
  from: string;
  to: string;
}): Promise<{ opreturn_data?: string; error?: string }> {
  return apiFetch("/api/dex/prepare-transfer", {
    method: "POST",
    body: JSON.stringify(params),
  });
}

export async function receiveGRD(params: {
  asset_id: string;
  amount: number;
  address: string;
}): Promise<{ status?: string; grd_out?: number; error?: string }> {
  return apiFetch("/api/dex/receive-grd", {
    method: "POST",
    body: JSON.stringify(params),
  });
}

export async function crossSwap(params: {
  pay_type: "STABLECOIN" | "SAHAM";
  pay_asset_id: string;
  receive_type: "SAHAM" | "STABLECOIN";
  receive_asset_id: string;
  amount: number;
  address: string;
}): Promise<{ status?: string; error?: string; saham_out?: number; stablecoin_out?: number }> {
  return apiFetch("/api/dex/cross-swap", {
    method: "POST",
    body: JSON.stringify(params),
  });
}

export async function dexSwap(params: {
  direction: "buy" | "sell";
  asset_id: string;
  amount: number;
  address: string;
  price: number;
}): Promise<{ success?: boolean; error?: string }> {
  return apiFetch("/api/dex/swap", {
    method: "POST",
    body: JSON.stringify(params),
  });
}

export async function dexPlaceOrder(params: {
  order_type: "limit" | "market";
  side: "buy" | "sell";
  asset_id: string;
  amount: number;
  price?: number;
  address: string;
}): Promise<{ success?: boolean; error?: string; txid?: string }> {
  return apiFetch("/api/dex/order", {
    method: "POST",
    body: JSON.stringify(params),
  });
}

export interface DexOrder {
  order_id: string;
  asset_id: string;
  symbol?: string;
  side: "buy" | "sell";
  price_grd: number;
  quantity: number;
  remaining: number;
  status: string;
  timestamp?: number;
}

export async function getMyDexOrders(address: string): Promise<DexOrder[]> {
  const data = await apiFetch<DexOrder[] | { orders: DexOrder[] }>(
    `/api/dex/my-orders/${address}?status=open`
  );
  return Array.isArray(data) ? data : ((data as { orders: DexOrder[] }).orders ?? []);
}

export async function cancelDexOrder(
  orderId: string,
  address: string
): Promise<{ status?: string; error?: string }> {
  return apiFetch("/api/dex/order/cancel", {
    method: "POST",
    body: JSON.stringify({ order_id: orderId, address }),
  });
}

export interface DexWalletInfo {
  connected: boolean;
  address: string;
  balance_grd: number;
  assets: { asset_id: string; symbol: string; balance: number }[];
}

export async function getDexWalletInfo(address: string): Promise<DexWalletInfo> {
  try {
    return await apiFetch<DexWalletInfo>(`/api/dex/wallet/connect?address=${address}`);
  } catch {
    return { connected: false, address, balance_grd: 0, assets: [] };
  }
}

export async function getAssetPrice(assetId: string): Promise<number> {
  try {
    const ob = await apiFetch<{ asks?: { price: number }[]; bids?: { price: number }[] }>(
      `/api/blockchain/orderbook/${assetId}`
    );
    const toGrd = (p: number) => (p > 1000 ? p / 1e8 : p);
    const bestAsk = toGrd(ob?.asks?.[0]?.price ?? 0);
    const bestBid = toGrd(ob?.bids?.[0]?.price ?? 0);
    return bestAsk > 0 && bestBid > 0 ? (bestAsk + bestBid) / 2 : bestAsk || bestBid;
  } catch {
    return 0;
  }
}

// ── Trade History ──────────────────────────────────────────────────────

export interface TradeItem {
  price_grd: number;
  amount: number;
  timestamp: number;
  buyer?: string;
  seller?: string;
  side?: string;
}

export async function getTradeHistory(assetId: string): Promise<TradeItem[]> {
  try {
    const data = await apiFetch<any>(`/api/dex/trades/${assetId}`);
    return Array.isArray(data) ? data : [];
  } catch {
    return [];
  }
}

// ── Price History (OHLCV) ──────────────────────────────────────────────

export interface PriceCandle {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export async function getPriceHistory(assetId: string, timeframe = "1h", limit = 50): Promise<PriceCandle[]> {
  try {
    const data = await apiFetch<any>(`/api/dex/price-history/${assetId}?timeframe=${timeframe}&limit=${limit}`);
    return Array.isArray(data) ? data : [];
  } catch {
    return [];
  }
}

// ── Oracle Rates ───────────────────────────────────────────────────────

export interface OracleRate {
  symbol: string;
  grd_per_unit: number;
  units_per_grd: number;
  source: string;
  timestamp: number;
}

export async function getOracleRates(symbol?: string): Promise<OracleRate[]> {
  try {
    const url = symbol ? `/api/oracle/rates?symbol=${symbol}` : "/api/oracle/rates";
    return await apiFetch<OracleRate[]>(url);
  } catch {
    return [];
  }
}

// ── Presale (Public) ───────────────────────────────────────────────────

export interface PresaleInfo {
  asset_id: string;
  symbol: string;
  name: string;
  soft_cap: number;
  hard_cap: number;
  raised: number;
  price_grd: number;
  status: string;
  start_height: number;
  end_height: number;
  buyers?: number;
}

export async function getPresales(): Promise<PresaleInfo[]> {
  try {
    const data = await apiFetch<any>("/api/blockchain/presales");
    return Array.isArray(data) ? data : [];
  } catch {
    return [];
  }
}

export async function getPresaleDetail(assetId: string): Promise<PresaleInfo | null> {
  try {
    return await apiFetch<PresaleInfo>(`/api/blockchain/presale/${assetId}`);
  } catch {
    return null;
  }
}

export async function buyPresale(params: {
  asset_id: string;
  amount_grd: number;
  buyer_address: string;
}): Promise<{ status?: string; txid?: string; error?: string }> {
  return apiFetch("/api/dex/presale/buy", {
    method: "POST",
    body: JSON.stringify(params),
  });
}

// ── Dividends (Public) ─────────────────────────────────────────────────

export interface DividendInfo {
  asset_id: string;
  symbol: string;
  total_dividend: number;
  per_share: number;
  height: number;
  timestamp: number;
  status: string;
}

export async function getDividendHistory(assetId: string): Promise<DividendInfo[]> {
  try {
    const data = await apiFetch<any>(`/api/dividend/history/${assetId}`);
    return Array.isArray(data) ? data : [];
  } catch {
    return [];
  }
}
