/**
 * Encrypted vault menggunakan AES-256-GCM + PBKDF2
 * Private key tidak pernah disimpan plaintext
 */

export interface VaultData {
  mnemonic: string;
  accounts: AccountMeta[];
  connectedSites: string[];  // origin yang sudah diberi izin
  settings: { network: string; autoLock: number };
}

export interface AccountMeta {
  name: string;
  address: string;
  derivationPath: string;
  index: number;
}

const VAULT_KEY = "garuda_vault";
const SALT_KEY = "garuda_salt";

async function deriveKey(password: string, salt: Uint8Array): Promise<CryptoKey> {
  const enc = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    "raw", enc.encode(password), "PBKDF2", false, ["deriveKey"]
  );
  return crypto.subtle.deriveKey(
    { name: "PBKDF2", salt, iterations: 250000, hash: "SHA-256" },
    keyMaterial,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"]
  );
}

async function encrypt(data: string, password: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(32));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveKey(password, salt);
  const enc = new TextEncoder();
  const ciphertext = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    key,
    enc.encode(data)
  );
  const combined = new Uint8Array(salt.length + iv.length + ciphertext.byteLength);
  combined.set(salt, 0);
  combined.set(iv, 32);
  combined.set(new Uint8Array(ciphertext), 44);
  return btoa(String.fromCharCode(...combined));
}

async function decrypt(encrypted: string, password: string): Promise<string> {
  const combined = Uint8Array.from(atob(encrypted), c => c.charCodeAt(0));
  const salt = combined.slice(0, 32);
  const iv = combined.slice(32, 44);
  const ciphertext = combined.slice(44);
  const key = await deriveKey(password, salt);
  const decrypted = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, ciphertext);
  return new TextDecoder().decode(decrypted);
}

export async function saveVault(data: VaultData, password: string): Promise<void> {
  const encrypted = await encrypt(JSON.stringify(data), password);
  await chrome.storage.local.set({ [VAULT_KEY]: encrypted });
}

export async function loadVault(password: string): Promise<VaultData | null> {
  const result = await chrome.storage.local.get(VAULT_KEY);
  const encrypted = result[VAULT_KEY];
  if (!encrypted) return null;
  try {
    const decrypted = await decrypt(encrypted, password);
    return JSON.parse(decrypted) as VaultData;
  } catch {
    return null; // Wrong password
  }
}

export async function hasVault(): Promise<boolean> {
  const result = await chrome.storage.local.get(VAULT_KEY);
  return !!result[VAULT_KEY];
}

export async function clearVault(): Promise<void> {
  await chrome.storage.local.remove([VAULT_KEY, SALT_KEY]);
}

// Session state (RAM only, clears on browser restart)
let sessionPassword: string | null = null;
let sessionVault: VaultData | null = null;
let lockTimer: ReturnType<typeof setTimeout> | null = null;

export function setSession(password: string, vault: VaultData, autoLockMinutes = 30): void {
  sessionPassword = password;
  sessionVault = vault;
  resetLockTimer(autoLockMinutes);
}

export function getSession(): { password: string; vault: VaultData } | null {
  if (!sessionPassword || !sessionVault) return null;
  return { password: sessionPassword, vault: sessionVault };
}

export function clearSession(): void {
  sessionPassword = null;
  sessionVault = null;
  if (lockTimer) clearTimeout(lockTimer);
}

function resetLockTimer(minutes: number): void {
  if (lockTimer) clearTimeout(lockTimer);
  lockTimer = setTimeout(() => clearSession(), minutes * 60 * 1000);
}

export function isUnlocked(): boolean {
  return sessionPassword !== null && sessionVault !== null;
}

export async function persistSession(vault: VaultData): Promise<void> {
  if (!sessionPassword) return;
  sessionVault = vault;
  await saveVault(vault, sessionPassword);
}

export function addConnectedSite(origin: string): void {
  if (!sessionVault) return;
  if (!sessionVault.connectedSites.includes(origin)) {
    sessionVault.connectedSites.push(origin);
  }
}

export function isConnectedSite(origin: string): boolean {
  return sessionVault?.connectedSites.includes(origin) ?? false;
}
