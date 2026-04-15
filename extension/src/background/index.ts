/**
 * Background Service Worker — handles all extension logic
 * Private key operations happen here, never in content/inpage
 *
 * Approval flow:
 * 1. Content script sends request (e.g. garuda_requestAccounts)
 * 2. If approval needed: store pending, set badge + popup URL, return { waiting: true }
 * 3. User clicks extension icon → popup shows approval UI
 * 4. User approves/rejects → background sends result via chrome.tabs.sendMessage
 * 5. Content script forwards result to inpage via postMessage
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
  tabId: number;
  requestId: string; // the original request ID from content script
}

const pendingRequests = new Map<string, PendingRequest>();

// ── Message handler ──────────────────────────────────────────────────────

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  // Handle get_pending_approval separately (from popup)
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

  // Handle get_any_pending (popup opens without specific ID)
  if (message.method === "get_any_pending") {
    const first = pendingRequests.values().next().value;
    if (first) {
      sendResponse({ result: { method: first.method, params: first.params, origin: first.origin, id: first.id } });
    } else {
      sendResponse({ result: null });
    }
    return true;
  }

  // Handle get_wallet_info (from approval page)
  if (message.method === "get_wallet_info") {
    const session = getSession();
    if (session && session.vault.accounts.length > 0) {
      sendResponse({ result: {
        accounts: session.vault.accounts.map(a => ({ name: a.name, address: a.address })),
      }});
    } else {
      sendResponse({ result: null });
    }
    return true;
  }

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
  const tabId = sender.tab?.id || -1;

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

    case "wallet_getAddressInfo": {
      const session = getSession();
      if (!session) throw new Error("Wallet terkunci");
      const addr = (message.params as { address?: string })?.address
        || session.vault.accounts[0]?.address;
      const res = await fetch(`${API_BASE}/api/address/${addr}`).then(r => r.json());
      return { result: res };
    }

    case "wallet_getAssetList": {
      const results: Array<{ assetId: string; symbol: string; name: string; tipe: string }> = [];
      try {
        const sc = await fetch(`${API_BASE}/api/stablecoins`).then(r => r.json()).catch(() => []);
        for (const s of (sc || [])) results.push({ assetId: s.asset_id || s.assetId, symbol: s.symbol, name: s.name, tipe: "STABLECOIN" });
        const pegged = await fetch(`${API_BASE}/api/pegged-stablecoins`).then(r => r.json()).catch(() => []);
        for (const s of (pegged || [])) results.push({ assetId: s.asset_id || s.assetId, symbol: s.symbol, name: s.name, tipe: "STABLECOIN_PEGGED" });
        const stocks = await fetch(`${API_BASE}/api/stocks`).then(r => r.json()).catch(() => []);
        for (const s of (stocks || [])) results.push({ assetId: s.asset_id || s.assetId, symbol: s.symbol, name: s.name, tipe: "SAHAM" });
      } catch {}
      return { result: results };
    }

    case "wallet_sendNative": {
      const session = getSession();
      if (!session) throw new Error("Wallet terkunci");
      const { to, amount: amtSat } = message.params as { to: string; amount: number };
      const account = session.vault.accounts[0];
      const key = await deriveKey(session.vault.mnemonic, 0, account.index);
      const FEE = 1000;
      // Get UTXOs
      const utxoRes = await fetch(`${API_BASE}/api/utxos/${account.address}`).then(r => r.json());
      const utxos: UTXO[] = utxoRes.utxos || utxoRes || [];
      if (!utxos.length) throw new Error("Tidak ada UTXO tersedia");
      let collected = 0;
      const selected: UTXO[] = [];
      for (const u of utxos) { selected.push(u); collected += u.value; if (collected >= amtSat + FEE) break; }
      if (collected < amtSat + FEE) throw new Error("Saldo tidak cukup");
      const outputs: { address: string; value: number }[] = [{ address: to, value: amtSat }];
      const change = collected - amtSat - FEE;
      if (change > 546) outputs.push({ address: account.address, value: change });
      const rawHex = await buildAndSignTx(selected, outputs, key.privateKey, key.publicKey);
      const broadcastRes = await fetch(`${API_BASE}/api/broadcast`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ hex: rawHex }),
      }).then(r => r.json());
      return { result: broadcastRes };
    }

    case "wallet_sendToken": {
      const session = getSession();
      if (!session) throw new Error("Wallet terkunci");
      const { to, amount: amt, assetId } = message.params as { to: string; amount: number; assetId: string };
      const account = session.vault.accounts[0];
      const key = await deriveKey(session.vault.mnemonic, 0, account.index);
      const FEE = 1000;
      // Prepare token transfer
      const prep = await fetch(`${API_BASE}/api/token/transfer/prepare`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ asset_id: assetId, amount: amt, from: account.address, to }),
      }).then(r => r.json());
      if (prep.error || !prep.opreturn_data) throw new Error(prep.error || "Gagal prepare transfer");
      // Get UTXOs for fee
      const utxoRes = await fetch(`${API_BASE}/api/utxos/${account.address}`).then(r => r.json());
      const utxos: UTXO[] = utxoRes.utxos || utxoRes || [];
      if (!utxos.length) throw new Error("Tidak ada UTXO (butuh GRD untuk fee)");
      let collected = 0;
      const selected: UTXO[] = [];
      for (const u of utxos) { selected.push(u); collected += u.value; if (collected >= FEE + 546) break; }
      if (collected < FEE) throw new Error("Saldo GRD tidak cukup untuk fee");
      const outputs: { opreturn?: string; address?: string; value: number }[] = [{ opreturn: prep.opreturn_data, value: 0 }];
      const change = collected - FEE;
      if (change > 546) outputs.push({ address: account.address, value: change });
      const rawHex = await buildAndSignTx(selected, outputs, key.privateKey, key.publicKey);
      const broadcastRes = await fetch(`${API_BASE}/api/broadcast`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ hex: rawHex }),
      }).then(r => r.json());
      return { result: broadcastRes };
    }

    // ── DEX: Connect (request accounts) ──
    case "garuda_requestAccounts": {
      const session = getSession();
      // Jika wallet sudah unlock dan site sudah connected → langsung return
      if (session && isConnectedSite(origin)) {
        return { result: session.vault.accounts.map(a => a.address) };
      }
      // Buka popup window (seperti MetaMask) — walau wallet belum dibuat/terkunci
      // Popup akan menampilkan create/unlock/approval sesuai kebutuhan
      const approvalId = crypto.randomUUID();
      pendingRequests.set(approvalId, {
        id: approvalId,
        method: "garuda_requestAccounts",
        params: { origin },
        origin,
        tabId,
        requestId: message.id || "",
      });
      showApprovalPopup(approvalId, "garuda_requestAccounts");
      return { waiting: true };
    }

    case "garuda_getAccounts": {
      const session = getSession();
      if (!session || !isConnectedSite(origin)) return { result: [] };
      return { result: session.vault.accounts.map(a => a.address) };
    }

    // ── DEX: Place Order ──
    case "garuda_placeOrder": {
      const session = getSession();
      if (!session) throw new Error("Wallet terkunci");
      if (!isConnectedSite(origin)) throw new Error("Site tidak terhubung");
      const params = message.params as {
        assetId: string; side: string; price: number;
        amount: number; address: string;
      };
      // Need approval
      const approvalId = crypto.randomUUID();
      pendingRequests.set(approvalId, {
        id: approvalId,
        method: "garuda_placeOrder",
        params,
        origin,
        tabId,
        requestId: message.id || "",
      });
      showApprovalPopup(approvalId, "garuda_placeOrder");
      return { waiting: true };
    }

    // ── DEX: Sign Message ──
    case "garuda_signMessage": {
      const session = getSession();
      if (!session) throw new Error("Wallet terkunci");
      const { message: msg, address } = message.params as { message: string; address: string };
      const approvalId = crypto.randomUUID();
      pendingRequests.set(approvalId, {
        id: approvalId,
        method: "garuda_signMessage",
        params: { message: msg, address },
        origin,
        tabId,
        requestId: message.id || "",
      });
      showApprovalPopup(approvalId, "garuda_signMessage");
      return { waiting: true };
    }

    // ── DEX: Send GRD Transaction (deposit/withdraw/transfer) ──
    case "garuda_sendTransaction": {
      const session = getSession();
      if (!session) throw new Error("Wallet terkunci");
      if (!isConnectedSite(origin)) throw new Error("Site tidak terhubung");
      const params = message.params as {
        from: string; to: string; amount: number;
        kind?: "transfer" | "deposit" | "withdraw"; memo?: string;
      };
      if (!params.from || !params.to || !params.amount || params.amount <= 0) {
        throw new Error("Parameter tidak valid");
      }
      const approvalId = crypto.randomUUID();
      pendingRequests.set(approvalId, {
        id: approvalId,
        method: "garuda_sendTransaction",
        params,
        origin,
        tabId,
        requestId: message.id || "",
      });
      showApprovalPopup(approvalId, "garuda_sendTransaction");
      return { waiting: true };
    }

    // ── DEX: Send Token (asset) Transaction ──
    case "garuda_sendToken": {
      const session = getSession();
      if (!session) throw new Error("Wallet terkunci");
      if (!isConnectedSite(origin)) throw new Error("Site tidak terhubung");
      const params = message.params as {
        from: string; to: string; assetId: string; amount: number;
      };
      if (!params.from || !params.to || !params.assetId || !params.amount) {
        throw new Error("Parameter tidak valid");
      }
      const approvalId = crypto.randomUUID();
      pendingRequests.set(approvalId, {
        id: approvalId,
        method: "garuda_sendToken",
        params,
        origin,
        tabId,
        requestId: message.id || "",
      });
      showApprovalPopup(approvalId, "garuda_sendToken");
      return { waiting: true };
    }

    // ── Approval responses from popup ──
    case "approval_response": {
      const { id, approved } = message.params as {
        id: string; approved: boolean; data?: unknown;
      };
      const pending = pendingRequests.get(id);
      if (!pending) return { result: null };
      pendingRequests.delete(id);

      // Reset badge and popup URL
      chrome.action.setBadgeText({ text: "" });
      chrome.action.setPopup({ popup: "popup.html" });

      if (approved) {
        await handleApproved(pending);
      } else {
        // Send rejection to content script
        sendResultToTab(pending.tabId, pending.requestId, undefined, "Ditolak pengguna");
      }
      return { result: "ok" };
    }

    default:
      throw new Error(`Unknown method: ${message.method}`);
  }
}

// ── Handle approved request ──────────────────────────────────────────────

async function handleApproved(pending: PendingRequest): Promise<void> {
  const session = getSession();

  try {
    if (pending.method === "garuda_requestAccounts") {
      if (!session) throw new Error("Wallet terkunci");
      addConnectedSite(pending.origin);
      await persistSession(session.vault);
      const accounts = session.vault.accounts.map(a => a.address);
      sendResultToTab(pending.tabId, pending.requestId, accounts);
      return;
    }

    if (pending.method === "garuda_placeOrder") {
      if (!session) throw new Error("Wallet terkunci");
      const params = pending.params as {
        assetId: string; side: string; price: number;
        amount: number; address: string;
      };

      // 1. Get opreturn_data from API
      const orderRes = await fetch(`${API_BASE}/api/dex/order/prepare`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          asset_id: params.assetId, side: params.side,
          price: params.price, amount: params.amount, address: params.address,
        }),
      }).then(r => r.json());
      if (orderRes.error) throw new Error(orderRes.error);

      // 2. Sign & broadcast
      const account = session.vault.accounts.find(a => a.address === params.address)
        || session.vault.accounts[0];
      const key = await deriveKey(session.vault.mnemonic, 0, account.index);
      const utxos: UTXO[] = orderRes.utxos;
      if (!utxos || utxos.length === 0) throw new Error("Tidak ada UTXO");
      const totalIn = utxos.reduce((s, u) => s + u.value, 0);
      const fee = 1000;
      const change = totalIn - fee;
      const signedHex = await buildAndSignTx(
        utxos,
        [
          { opreturn: orderRes.opreturn_data, value: 0 },
          ...(change > 546 ? [{ address: params.address, value: change }] : []),
        ],
        key.privateKey, key.publicKey
      );

      // 3. Broadcast
      const broadcastRes = await fetch(`${API_BASE}/api/broadcast`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ hex: signedHex }),
      }).then(r => r.json());

      sendResultToTab(pending.tabId, pending.requestId, broadcastRes);
      return;
    }

    if (pending.method === "garuda_sendTransaction") {
      if (!session) throw new Error("Wallet terkunci");
      const params = pending.params as {
        from: string; to: string; amount: number;
        kind?: "transfer" | "deposit" | "withdraw"; memo?: string;
      };
      const account = session.vault.accounts.find(a => a.address === params.from)
        || session.vault.accounts[0];
      const key = await deriveKey(session.vault.mnemonic, 0, account.index);
      const FEE = 1000;
      const amtSat = Math.round(params.amount * 100_000_000);
      // Get UTXOs
      const utxoRes = await fetch(`${API_BASE}/api/utxos/${account.address}`).then(r => r.json());
      const utxos: UTXO[] = utxoRes.utxos || utxoRes || [];
      if (!utxos.length) throw new Error("Tidak ada UTXO tersedia");
      let collected = 0;
      const selected: UTXO[] = [];
      for (const u of utxos) { selected.push(u); collected += u.value; if (collected >= amtSat + FEE) break; }
      if (collected < amtSat + FEE) throw new Error("Saldo GRD tidak cukup");
      const outputs: { opreturn?: string; address?: string; value: number }[] = [
        { address: params.to, value: amtSat },
      ];
      const change = collected - amtSat - FEE;
      if (change > 546) outputs.push({ address: account.address, value: change });
      // Optional memo via OP_RETURN
      if (params.memo) {
        const memoHex = Array.from(new TextEncoder().encode(params.memo))
          .map(b => b.toString(16).padStart(2, "0")).join("");
        outputs.push({ opreturn: memoHex, value: 0 });
      }
      const rawHex = await buildAndSignTx(selected, outputs, key.privateKey, key.publicKey);
      const broadcastRes = await fetch(`${API_BASE}/api/broadcast`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ hex: rawHex }),
      }).then(r => r.json());
      if (broadcastRes.error) throw new Error(broadcastRes.error);
      sendResultToTab(pending.tabId, pending.requestId, {
        txid: broadcastRes.txid || broadcastRes.hash || "",
        status: "ok",
      });
      return;
    }

    if (pending.method === "garuda_sendToken") {
      if (!session) throw new Error("Wallet terkunci");
      const params = pending.params as {
        from: string; to: string; assetId: string; amount: number;
      };
      const account = session.vault.accounts.find(a => a.address === params.from)
        || session.vault.accounts[0];
      const key = await deriveKey(session.vault.mnemonic, 0, account.index);
      const FEE = 1000;
      // Prepare token transfer (server builds OP_RETURN)
      const prep = await fetch(`${API_BASE}/api/token/transfer/prepare`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          asset_id: params.assetId, amount: params.amount,
          from: account.address, to: params.to,
        }),
      }).then(r => r.json());
      if (prep.error || !prep.opreturn_data) throw new Error(prep.error || "Gagal prepare transfer");
      const utxoRes = await fetch(`${API_BASE}/api/utxos/${account.address}`).then(r => r.json());
      const utxos: UTXO[] = utxoRes.utxos || utxoRes || [];
      if (!utxos.length) throw new Error("Tidak ada UTXO (butuh GRD untuk fee)");
      let collected = 0;
      const selected: UTXO[] = [];
      for (const u of utxos) { selected.push(u); collected += u.value; if (collected >= FEE + 546) break; }
      if (collected < FEE) throw new Error("Saldo GRD tidak cukup untuk fee");
      const outputs: { opreturn?: string; address?: string; value: number }[] = [
        { opreturn: prep.opreturn_data, value: 0 },
      ];
      const change = collected - FEE;
      if (change > 546) outputs.push({ address: account.address, value: change });
      const rawHex = await buildAndSignTx(selected, outputs, key.privateKey, key.publicKey);
      const broadcastRes = await fetch(`${API_BASE}/api/broadcast`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ hex: rawHex }),
      }).then(r => r.json());
      if (broadcastRes.error) throw new Error(broadcastRes.error);
      sendResultToTab(pending.tabId, pending.requestId, {
        txid: broadcastRes.txid || broadcastRes.hash || "",
        status: "ok",
      });
      return;
    }

    if (pending.method === "garuda_signMessage") {
      if (!session) throw new Error("Wallet terkunci");
      const { message: msg, address } = pending.params as { message: string; address: string };
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
      sendResultToTab(pending.tabId, pending.requestId, { signature: (sig as any).toDERHex(), address });
      return;
    }
  } catch (err: any) {
    sendResultToTab(pending.tabId, pending.requestId, undefined, err.message || "Error");
  }
}

// ── Send result back to content script via chrome.tabs.sendMessage ───────

function sendResultToTab(tabId: number, requestId: string, result?: unknown, error?: string): void {
  if (tabId < 0) return;
  chrome.tabs.sendMessage(tabId, {
    type: "GARUDA_APPROVAL_RESULT",
    id: requestId,
    result,
    error,
  }).catch(() => {
    // Tab may have been closed
  });
}

// ── Show approval popup window (like MetaMask) ─────────────────────────

function showApprovalPopup(approvalId: string, _method: string): void {
  // Set badge to notify user — approval shows inside the main popup
  chrome.action.setBadgeText({ text: "1" });
  chrome.action.setBadgeBackgroundColor({ color: "#C8922A" });

  // Set popup URL with approval param so it opens directly to approval
  chrome.action.setPopup({
    popup: `popup.html?approval=${approvalId}`,
  });

  // Open the popup programmatically (Chrome 127+)
  chrome.action.openPopup?.().catch(() => {
    // Older Chrome: user must click the icon manually
  });

  // Timeout after 5 minutes
  setTimeout(() => {
    if (pendingRequests.has(approvalId)) {
      const pending = pendingRequests.get(approvalId)!;
      pendingRequests.delete(approvalId);
      chrome.action.setBadgeText({ text: "" });
      chrome.action.setPopup({ popup: "popup.html" });
      sendResultToTab(pending.tabId, pending.requestId, undefined, "Request timeout");
    }
  }, 300_000);
}

console.log("[GarudaChain] Background service worker started");
