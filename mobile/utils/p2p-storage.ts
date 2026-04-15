/**
 * P2P Storage — AsyncStorage
 * Sistem escrow P2P dua arah:
 * - Pembeli bayar IDR → penjual harus lepas aset dalam 24 jam
 * - Penjual kunci aset → pembeli (admin) bayar IDR → penjual harus lepas dalam 24 jam
 * Jika tidak melepas: sistem auto-release dan penalti 72 jam
 */

import AsyncStorage from "@react-native-async-storage/async-storage";

const ORDERS_KEY  = "garuda_p2p_orders";
const LISTINGS_KEY = "garuda_p2p_my_listings";

// ── 24 jam dalam milidetik ────────────────────────────────────────────────
export const AUTO_RELEASE_MS = 24 * 60 * 60 * 1000;

export type OrderStatus =
  | "menunggu"    // order dibuat, belum ada pembayaran
  | "dibayar"     // pembayaran IDR sudah dikonfirmasi, tunggu penjual lepas aset
  | "selesai"     // selesai normal
  | "auto_lepas"  // selesai karena auto-release (penjual kena penalti)
  | "dibatalkan"  // dibatalkan sebelum bayar
  | "sengketa";   // dalam sengketa

export type MessageFrom = "buyer" | "seller" | "system";

export interface P2PMessage {
  id: string;
  from: MessageFrom;
  text: string;
  time: string;
  timestamp: string;      // ISO — untuk sorting yang akurat
  isEscrow?: boolean;
  isWarning?: boolean;
}

export interface P2POrder {
  id: string;
  listingId: string;
  myRole: "buyer" | "seller"; // peran user yang menyimpan order ini
  traderName: string;
  asset: string;
  assetAmount: number;
  idrAmount: number;
  priceNum: number;
  paymentMethod: string;
  paymentNoRek: string;    // nomor rekening / dompet penerima
  paymentNama: string;     // nama pemilik rekening
  status: OrderStatus;
  // Timestamps (ISO string)
  createdAt: string;
  paidAt: string | null;       // kapan pembayaran IDR dikonfirmasi
  releasedAt: string | null;   // kapan aset dilepas
  autoReleaseAt: string | null; // paidAt + 24 jam → batas auto-release
  // Riwayat pesan
  messages: P2PMessage[];
}

export interface P2PMyListing {
  id: string;
  type: "jual" | "beli";
  asset: string;
  price: string;
  priceNum: number;
  limitMin: number;
  limitMax: number;
  payment: string;       // comma-separated label untuk tampilan
  payments: Array<{ method: string; noRek: string; nama: string }>;
  status: "aktif" | "nonaktif";
  orders: number;
  createdAt: string;
  requirements?: string;
  timeLimit?: number;
}

// ── Helpers waktu ─────────────────────────────────────────────────────────

export function nowTime(): string {
  const d = new Date();
  return `${d.getHours().toString().padStart(2, "0")}:${d.getMinutes().toString().padStart(2, "0")}`;
}

export function formatCountdown(ms: number): string {
  if (ms <= 0) return "00:00:00";
  const totalSec = Math.floor(ms / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  return [h, m, s].map((v) => v.toString().padStart(2, "0")).join(":");
}

export function autoReleaseLabel(autoReleaseAt: string | null): string {
  if (!autoReleaseAt) return "";
  const diff = new Date(autoReleaseAt).getTime() - Date.now();
  return diff > 0 ? formatCountdown(diff) : "00:00:00";
}

// ── Order CRUD ────────────────────────────────────────────────────────────

export async function getAllOrders(): Promise<P2POrder[]> {
  try {
    const raw = await AsyncStorage.getItem(ORDERS_KEY);
    return raw ? (JSON.parse(raw) as P2POrder[]) : [];
  } catch {
    return [];
  }
}

export async function saveAllOrders(orders: P2POrder[]): Promise<void> {
  await AsyncStorage.setItem(ORDERS_KEY, JSON.stringify(orders));
}

export async function getOrderById(id: string): Promise<P2POrder | null> {
  const orders = await getAllOrders();
  return orders.find((o) => o.id === id) ?? null;
}

export async function createOrder(order: P2POrder): Promise<void> {
  const orders = await getAllOrders();
  orders.unshift(order);
  await saveAllOrders(orders);
}

export async function updateOrder(updated: P2POrder): Promise<void> {
  const orders = await getAllOrders();
  const idx = orders.findIndex((o) => o.id === updated.id);
  if (idx >= 0) {
    orders[idx] = updated;
  } else {
    orders.unshift(updated);
  }
  await saveAllOrders(orders);
}

// ── Auto-release check ────────────────────────────────────────────────────
/**
 * Dipanggil saat app dibuka / masuk halaman chat.
 * Cek semua order yang statusnya "dibayar" dan waktunya sudah lewat 24 jam.
 * Jika lewat → ubah status ke "auto_lepas" + tambah pesan sistem.
 * Return: daftar orderId yang baru saja di-auto-release.
 */
export async function processAutoReleases(): Promise<string[]> {
  const orders = await getAllOrders();
  const now = Date.now();
  const released: string[] = [];
  let changed = false;

  for (const order of orders) {
    if (
      order.status === "dibayar" &&
      order.autoReleaseAt &&
      new Date(order.autoReleaseAt).getTime() <= now
    ) {
      const t = nowTime();
      const penalized = "Penjual"; // selalu penjual (pemegang aset) yang kena penalti

      order.status    = "auto_lepas";
      order.releasedAt = new Date().toISOString();

      order.messages.push(
        {
          id: `ar-warn-${Date.now()}`,
          from: "system",
          text: `⚠️ PENANGGUHAN: ${penalized} tidak melepas aset dalam 24 jam. Akun ${penalized.toLowerCase()} ditangguhkan 72 jam.`,
          time: t,
          timestamp: new Date().toISOString(),
          isWarning: true,
        },
        {
          id: `ar-done-${Date.now() + 1}`,
          from: "system",
          text: `✅ SISTEM: ${order.assetAmount} ${order.asset} otomatis dilepaskan ke ${order.myRole === "buyer" ? "dompet kamu" : "pembeli"}. Transaksi selesai secara otomatis.`,
          time: t,
          timestamp: new Date().toISOString(),
          isEscrow: true,
        }
      );

      released.push(order.id);
      changed = true;
    }
  }

  if (changed) await saveAllOrders(orders);
  return released;
}

// ── My Listings CRUD ─────────────────────────────────────────────────────

export async function getMyListings(): Promise<P2PMyListing[]> {
  try {
    const raw = await AsyncStorage.getItem(LISTINGS_KEY);
    return raw ? (JSON.parse(raw) as P2PMyListing[]) : [];
  } catch {
    return [];
  }
}

export async function saveMyListings(listings: P2PMyListing[]): Promise<void> {
  await AsyncStorage.setItem(LISTINGS_KEY, JSON.stringify(listings));
}

export async function addMyListing(listing: P2PMyListing): Promise<void> {
  const list = await getMyListings();
  list.unshift(listing);
  await saveMyListings(list);
}
