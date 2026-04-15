/**
 * Background Service Worker — handles all extension logic
 * Private key operations happen here, never in content/inpage
 */

import {
  deriveKey, buildAndSignTx, UTXO,
} from "@/crypto/wallet";
import {
  hasVault, loadVault, saveVault, setSession, getSession,
  clearSession, isUnlocked, isConnectedSite, addConnectedSite,
  persistSession, VaultData,
} from "@/store/vault";

const API_BASE = "http://localhost:5000";

// ── Pending approval requests ────────────────────────────────────────────

interface PendingRequest {
  id: string;
  method: string;
  params: unknown;
  origin: string;
  resolve: (value: unknown) => void;
  reject: (reason: unknown) => void;
}

const pendingRequests = new Map<string, PendingRequest>();

// ── Message handler ──────────────────────────────────────────────────────

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  handleMessage(message, sender).then(sendResponse).catch(err => {
    sendResponse({ error: err.message || "Unknown error" });
  });
  return true; // async response
});

async function handleMessage(
  message: { method: string; params?: unknown; id?: string; origin?: string },
  sender: chrome.runtime.MessageSender
): Promise<unknown> {
  const origin = message.origin || sender.origin || sender.tab?.url?.split("/").slice(0, 3).join("/") || "";

  switch (message.method) {
    // ── Wallet setup ──
    case "wallet_hasVault":
      return { result: await hasVault() };

    case "wallet_create": {
      const { mnemonic, password, accountName } = message.params as {
        mnemonic: string; password: string; accountName?: string;
      };
      const key = await deriveKey(mnemonic, 0, 0);
      const vault: VaultData = {
        mnemonic,
        accounts: [{ name: accountName || "Akun 1", address: key.address, derivationPath: key.derivationPath, index: 0 }],
        connectedSites: [],
        settings: { network: "regtest", autoLock: 30 },
      };
      await saveVault(vault, password);
      setSession(password, vault);
      return { result: { address: key.address } };
    }

    case "wallet_unlock": {
      const { password } = message.params as { password: string };
      const vault = await loadVault(password);
      if (!vault) throw new Error("Password salah");
      setSession(password, vault);
      return { result: { address: vault.accounts[0]?.address } };
    }

    case "wallet_lock":
      clearSession();
      return { result: true };

    case "wallet_isUnlocked":
      return { result: isUnlocked() };

    case "wallet_getAccounts": {
      const session = getSession();
      if (!session) throw new Error("Wallet terkunci");
      return { result: session.vault.accounts };
    }

    case "wallet_addAccount": {
      const session = getSession();
      if (!session) throw new Error("Wallet terkunci");
      const nextIndex = session.vault.accounts.length;
      const key = await deriveKey(session.vault.mnemonic, 0, nextIndex);
      const newAccount = {
        name: `Akun ${nextIndex + 1}`,
        address: key.address,
        derivationPath: key.derivationPath,
        index: nextIndex,
      };
      session.vault.accounts.push(newAccount);
      await persistSession(session.vault);
      return { result: newAccount };
    }

    case "wallet_exportMnemonic": {
      const session = getSession();
      if (!session) throw new Error("Wallet terkunci");
      const { password } = message.params as { password: string };
      const verified = await loadVault(password);
      if (!verified) throw new Error("Password salah");
      return { result: session.vault.mnemonic };
    }

    // ── Balance / Assets from API ──
    case "wallet_getBalance": {
      const session = getSession();
      if (!session) throw new Error("Wallet terkunci");
      const addr = (message.params as { address?: string })?.address
        || session.vault.accounts[0]?.address;
      const res = await fetch(`${API_BASE}/api/dex/wallet/connect`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ address: addr }),
      }).then(r => r.json());
      return { result: res };
    }

    // ── DEX: Connect (request accounts) ──
    case "garuda_requestAccounts": {
      const session = getSession();
      if (!session) throw new Error("Wallet terkunci. Buka extension dan login.");
      if (isConnectedSite(origin)) {
        return { result: session.vault.accounts.map(a => a.address) };
      }
      // Need user approval
      return await requestApproval("garuda_requestAccounts", { origin }, origin);
    }

    case "garuda_getAccounts": {
      const session = getSession();
      if (!session || !isConnectedSite(origin)) return { result: [] };
      return { result: session.vault.accounts.map(a => a.address) };
    }

    // ── DEX: Place Order (unsigned TX flow) ──
    case "garuda_placeOrder": {
      const session = getSession();
      if (!session) throw new Error("Wallet terkunci");
      if (!isConnectedSite(origin)) throw new Error("Site tidak terhubung");
      const params = message.params as {
        assetId: string; side: string; price: number;
        amount: number; address: string;
      };
      // Show approval popup
      const approved = await requestApproval("garuda_placeOrder", params, origin);
      if (!(approved as { approved: boolean }).approved) throw new Error("Ditolak pengguna");

      // 1. Get opreturn_data from API
      const orderRes = await fetch(`${API_BASE}/api/dex/order/prepare`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          asset_id: params.assetId,
          side: params.side,
          price: params.price,
          amount: params.amount,
          address: params.address,
        }),
      }).then(r => r.json());
      if (orderRes.error) throw new Error(orderRes.error);

      // 2. Sign & broadcast
      const account = session.vault.accounts.find(a => a.address === params.address)
        || session.vault.accounts[0];
      const key = await deriveKey(session.vault.mnemonic, 0, account.index);

      const utxos: UTXO[] = orderRes.utxos;
      if (!utxos || utxos.length === 0) throw new Error("Tidak ada UTXO. Dana wallet terlebih dahulu.");

      const totalIn = utxos.reduce((s, u) => s + u.value, 0);
      const fee = 1000; // 1000 satoshi fixed fee
      const change = totalIn - fee;

      const signedHex = await buildAndSignTx(
        utxos,
        [
          { opreturn: orderRes.opreturn_data, value: 0 },
          ...(change > 546 ? [{ address: params.address, value: change }] : []),
        ],
        key.privateKey,
        key.publicKey
      );

      // 3. Broadcast
      const broadcastRes = await fetch(`${API_BASE}/api/broadcast`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ hex: signedHex }),
      }).then(r => r.json());

      return { result: broadcastRes };
    }

    // ── DEX: Sign Message ──
    case "garuda_signMessage": {
      const session = getSession();
      if (!session) throw new Error("Wallet terkunci");
      const { message: msg, address } = message.params as { message: string; address: string };
      const approved = await requestApproval("garuda_signMessage", { message: msg, address }, origin);
      if (!(approved as { approved: boolean }).approved) throw new Error("Ditolak pengguna");

      const account = session.vault.accounts.find(a => a.address === address)
        || session.vault.accounts[0];
      const key = await deriveKey(session.vault.mnemonic, 0, account.index);

      const enc = new TextEncoder();
      const prefix = "\x18GarudaChain Signed Message:\n";
      const msgBytes = enc.encode(msg);
      const lenByte = new Uint8Array([msgBytes.length]);
      const payload = new Uint8Array([...enc.encode(prefix), ...lenByte, ...msgBytes]);

      const { sha256: sha256fn } = await import("@noble/hashes/sha256");
      const hash = new Uint8Array(sha256fn(new Uint8Array(sha256fn(payload))));
      const { signAsync: secp256k1Sign } = await import("@noble/secp256k1");
      const sig = await secp256k1Sign(hash, key.privateKey, { lowS: true });
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return { result: { signature: (sig as any).toDERHex(), address } };
    }

    // ── Approval responses from popup ──
    case "approval_response": {
      const { id, approved, data } = message.params as {
        id: string; approved: boolean; data?: unknown;
      };
      const pending = pendingRequests.get(id);
      if (!pending) return { result: null };
      pendingRequests.delete(id);
      if (approved) {
        // For requestAccounts, save connected site
        if (pending.method === "garuda_requestAccounts") {
          const session = getSession();
          if (session) {
            addConnectedSite(pending.origin);
            await persistSession(session.vault);
          }
        }
        pending.resolve(data || { approved: true });
      } else {
        pending.reject(new Error("User rejected"));
      }
      return { result: "ok" };
    }

    default:
      throw new Error(`Unknown method: ${message.method}`);
  }
}

// ── Approval popup ────────────────────────────────────────────────────────

async function requestApproval(method: string, params: unknown, origin: string): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const id = crypto.randomUUID();
    pendingRequests.set(id, { id, method, params, origin, resolve, reject });

    // Open approval popup
    chrome.windows.create({
      url: chrome.runtime.getURL(`popup.html?approval=${id}&method=${method}`),
      type: "popup",
      width: 400,
      height: 620,
      focused: true,
    });

    // Timeout after 5 minutes
    setTimeout(() => {
      if (pendingRequests.has(id)) {
        pendingRequests.delete(id);
        reject(new Error("Request timeout"));
      }
    }, 300_000);
  });
}

// Expose pending request data to popup
chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.method === "get_pending_approval") {
    const { id } = message.params as { id: string };
    const pending = pendingRequests.get(id);
    if (pending) {
      sendResponse({ result: { method: pending.method, params: pending.params, origin: pending.origin, id } });
    } else {
      sendResponse({ result: null });
    }
    return true;
  }
});

// Mark as initialized
console.log("[GarudaChain] Background service worker started");

