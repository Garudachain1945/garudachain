/**
 * Wallet Storage — SecureStore
 * Menyimpan dan membaca data dompet secara aman menggunakan expo-secure-store.
 */

import * as SecureStore from "expo-secure-store";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Platform } from "react-native";

const KEYS = {
  MNEMONIC: "garuda_wallet_mnemonic",
  ADDRESS: "garuda_wallet_address",
  PUBLIC_KEY: "garuda_wallet_pubkey",
  ACCOUNT_NAME: "garuda_account_name",
  ACCOUNTS: "garuda_accounts_list",
  QUANTUM_ADDRESS: "garuda_quantum_address",
  WALLET_EXISTS: "garuda_wallet_exists",
  PASSWORD_HASH: "garuda_password_hash",
  PASSWORD_SALT: "garuda_password_salt",
} as const;

// Untuk web, SecureStore tidak tersedia — gunakan AsyncStorage sebagai fallback
async function secureSet(key: string, value: string): Promise<void> {
  if (Platform.OS === "web") {
    await AsyncStorage.setItem(key, value);
  } else {
    await SecureStore.setItemAsync(key, value);
  }
}

async function secureGet(key: string): Promise<string | null> {
  if (Platform.OS === "web") {
    return AsyncStorage.getItem(key);
  } else {
    return SecureStore.getItemAsync(key);
  }
}

async function secureDelete(key: string): Promise<void> {
  if (Platform.OS === "web") {
    await AsyncStorage.removeItem(key);
  } else {
    await SecureStore.deleteItemAsync(key);
  }
}

// ── Wallet Account ────────────────────────────────────────────────────────

export interface WalletAccount {
  id: string;           // unique id
  name: string;         // nama akun
  address: string;      // grd1q... (classical secp256k1)
  publicKey: string;    // hex
  accountIndex: number;
  quantumAddress?: string; // grd1z... (ML-DSA-65, quantum-resistant)
}

export interface StoredWallet {
  mnemonic: string;
  accounts: WalletAccount[];
  activeAccountId: string;
}

/** Simpan wallet baru ke secure storage */
export async function saveWallet(
  mnemonic: string,
  firstAccount: WalletAccount,
): Promise<void> {
  const wallet: StoredWallet = {
    mnemonic,
    accounts: [firstAccount],
    activeAccountId: firstAccount.id,
  };
  await secureSet(KEYS.MNEMONIC, mnemonic);
  await secureSet(KEYS.ACCOUNTS, JSON.stringify(wallet.accounts));
  await secureSet(KEYS.ADDRESS, firstAccount.address);
  await AsyncStorage.setItem("garuda_active_account_id", firstAccount.id);
  await secureSet(KEYS.WALLET_EXISTS, "true");
}

/** Muat semua data dompet */
export async function loadWallet(): Promise<StoredWallet | null> {
  try {
    const exists = await secureGet(KEYS.WALLET_EXISTS);
    if (!exists) return null;

    const mnemonic = await secureGet(KEYS.MNEMONIC);
    if (!mnemonic) return null;

    const accountsJson = await secureGet(KEYS.ACCOUNTS);
    const accounts: WalletAccount[] = accountsJson ? JSON.parse(accountsJson) : [];

    const activeAccountId = await AsyncStorage.getItem("garuda_active_account_id");

    return {
      mnemonic,
      accounts,
      activeAccountId: activeAccountId || accounts[0]?.id || "",
    };
  } catch {
    return null;
  }
}

/** Cek apakah wallet sudah ada */
export async function hasWallet(): Promise<boolean> {
  const exists = await secureGet(KEYS.WALLET_EXISTS);
  return exists === "true";
}

/** Ambil akun aktif saja */
export async function getActiveAccount(): Promise<WalletAccount | null> {
  try {
    const wallet = await loadWallet();
    if (!wallet) return null;
    return wallet.accounts.find(a => a.id === wallet.activeAccountId) || wallet.accounts[0] || null;
  } catch {
    return null;
  }
}

/** Ambil mnemonic (sensitive) */
export async function getMnemonic(): Promise<string | null> {
  return secureGet(KEYS.MNEMONIC);
}

/** Tambah akun baru ke dompet */
export async function addAccount(account: WalletAccount): Promise<void> {
  const accountsJson = await secureGet(KEYS.ACCOUNTS);
  const accounts: WalletAccount[] = accountsJson ? JSON.parse(accountsJson) : [];
  accounts.push(account);
  await secureSet(KEYS.ACCOUNTS, JSON.stringify(accounts));
}

/** Set akun aktif */
export async function setActiveAccount(accountId: string): Promise<void> {
  await AsyncStorage.setItem("garuda_active_account_id", accountId);
}

/** Update nama akun */
export async function updateAccountName(accountId: string, newName: string): Promise<void> {
  const accountsJson = await secureGet(KEYS.ACCOUNTS);
  const accounts: WalletAccount[] = accountsJson ? JSON.parse(accountsJson) : [];
  const idx = accounts.findIndex((a) => a.id === accountId);
  if (idx >= 0) {
    accounts[idx].name = newName;
    await secureSet(KEYS.ACCOUNTS, JSON.stringify(accounts));
  }
}

/** Hapus akun dari dompet (minimal 1 akun harus tersisa) */
export async function removeAccount(accountId: string): Promise<void> {
  const accountsJson = await secureGet(KEYS.ACCOUNTS);
  const accounts: WalletAccount[] = accountsJson ? JSON.parse(accountsJson) : [];
  if (accounts.length <= 1) return; // jangan hapus akun terakhir
  const remaining = accounts.filter((a) => a.id !== accountId);
  await secureSet(KEYS.ACCOUNTS, JSON.stringify(remaining));
  const activeId = await AsyncStorage.getItem("garuda_active_account_id");
  if (activeId === accountId) {
    await AsyncStorage.setItem("garuda_active_account_id", remaining[0].id);
  }
}

// ── Password ──────────────────────────────────────────────────────────────

// SHA-256 x100000 iterasi — identik dengan walletcontroller.cpp desktop
async function stretchPassword(password: string, saltHex: string): Promise<string> {
  const encoder = new TextEncoder();
  const pwBytes  = encoder.encode(password);
  const saltBytes = new Uint8Array(saltHex.match(/.{2}/g)!.map((h: string) => parseInt(h, 16)));
  const combined  = new Uint8Array(pwBytes.length + saltBytes.length);
  combined.set(pwBytes, 0);
  combined.set(saltBytes, pwBytes.length);
  let hash = new Uint8Array(await crypto.subtle.digest("SHA-256", combined));
  for (let i = 1; i < 100000; i++) {
    hash = new Uint8Array(await crypto.subtle.digest("SHA-256", hash));
  }
  return Array.prototype.map.call(hash, (b: number) => b.toString(16).padStart(2, "0")).join("") as string;
}

function randomHex32(): string {
  const buf = new Uint8Array(32);
  crypto.getRandomValues(buf);
  return Array.prototype.map.call(buf, (b: number) => b.toString(16).padStart(2, "0")).join("") as string;
}

/** Simpan hash password dengan random salt per-user (SHA-256 × 100.000 iterasi) */
export async function savePasswordHash(password: string): Promise<void> {
  const saltHex = randomHex32();
  const hashHex = await stretchPassword(password, saltHex);
  await secureSet(KEYS.PASSWORD_SALT, saltHex);
  await secureSet(KEYS.PASSWORD_HASH, hashHex);
}

/** Verifikasi password dengan salt yang tersimpan */
export async function verifyPassword(password: string): Promise<boolean> {
  const saltHex = await secureGet(KEYS.PASSWORD_SALT);
  const stored  = await secureGet(KEYS.PASSWORD_HASH);
  if (!saltHex || !stored) return false;
  const hashHex = await stretchPassword(password, saltHex);
  return hashHex === stored;
}

/** Cek apakah password sudah diatur */
export async function hasPassword(): Promise<boolean> {
  const h = await secureGet(KEYS.PASSWORD_HASH);
  return !!h;
}

/** Simpan quantum address (grd1z...) ke storage */
export async function saveQuantumAddress(address: string): Promise<void> {
  await secureSet(KEYS.QUANTUM_ADDRESS, address);
}

/** Ambil quantum address */
export async function getQuantumAddress(): Promise<string | null> {
  return secureGet(KEYS.QUANTUM_ADDRESS);
}

/** Simpan private key yang diimpor (disimpan terpisah per akun) */
export async function saveImportedKey(accountId: string, privateKeyHex: string): Promise<void> {
  await secureSet(`garuda_imported_key_${accountId}`, privateKeyHex);
}

/** Ambil private key yang diimpor */
export async function getImportedKey(accountId: string): Promise<string | null> {
  return secureGet(`garuda_imported_key_${accountId}`);
}

/** Hapus semua data wallet (reset) */
export async function clearWallet(): Promise<void> {
  await secureDelete(KEYS.MNEMONIC);
  await secureDelete(KEYS.ACCOUNTS);
  await secureDelete(KEYS.ADDRESS);
  await secureDelete(KEYS.QUANTUM_ADDRESS);
  await secureDelete(KEYS.PASSWORD_HASH);
  await secureDelete(KEYS.PASSWORD_SALT);
  await secureDelete(KEYS.WALLET_EXISTS);
  await AsyncStorage.removeItem("garuda_active_account_id");
}
