/**
 * Inpage Provider — disuntikkan ke window setiap halaman web
 * Menyediakan window.garuda untuk DEX dan DApp
 * Private key TIDAK pernah masuk ke sini — hanya bridge ke background
 */

(function () {
  if ((window as any).garuda) return; // Sudah ter-inject

  const pendingCallbacks = new Map<
    string,
    { resolve: (v: unknown) => void; reject: (e: Error) => void }
  >();

  // Listen responses dari content script
  window.addEventListener("__GARUDA_RESPONSE__", (event: Event) => {
    const { detail } = event as CustomEvent;
    const pending = pendingCallbacks.get(detail.id);
    if (!pending) return;
    pendingCallbacks.delete(detail.id);
    if (detail.error) {
      pending.reject(new Error(detail.error));
    } else {
      pending.resolve(detail.result);
    }
  });

  function sendToBackground(method: string, params?: unknown): Promise<unknown> {
    return new Promise((resolve, reject) => {
      const id = Math.random().toString(36).slice(2) + Date.now();
      pendingCallbacks.set(id, { resolve, reject });
      window.dispatchEvent(
        new CustomEvent("__GARUDA_REQUEST__", {
          detail: { method, params, id },
        })
      );
      // Timeout 60 detik
      setTimeout(() => {
        if (pendingCallbacks.has(id)) {
          pendingCallbacks.delete(id);
          reject(new Error("Request timeout"));
        }
      }, 60_000);
    });
  }

  // ── GarudaChain Provider API ───────────────────────────────────────────

  const garuda = {
    isGarudaChain: true,
    version: "1.0.0",
    network: "regtest",

    /**
     * Request accounts — connect wallet ke website
     * Returns: string[] — list of addresses
     */
    requestAccounts(): Promise<string[]> {
      return sendToBackground("garuda_requestAccounts") as Promise<string[]>;
    },

    /**
     * Get connected accounts (tanpa approval popup)
     */
    getAccounts(): Promise<string[]> {
      return sendToBackground("garuda_getAccounts") as Promise<string[]>;
    },

    /**
     * Get balance and assets for an address
     */
    getBalance(address?: string): Promise<{
      address: string;
      balance_grd: number;
      assets: { asset_id: string; symbol: string; balance: number }[];
    }> {
      return sendToBackground("wallet_getBalance", { address }) as Promise<any>;
    },

    /**
     * Place DEX limit order
     * Signs transaction in extension, broadcasts to node
     */
    placeOrder(params: {
      assetId: string;
      side: "buy" | "sell";
      price: number;
      amount: number;
      address: string;
    }): Promise<{ txid: string; order_id: string }> {
      return sendToBackground("garuda_placeOrder", params) as Promise<any>;
    },

    /**
     * Sign a message with the wallet private key
     */
    signMessage(params: { message: string; address: string }): Promise<{ signature: string }> {
      return sendToBackground("garuda_signMessage", params) as Promise<any>;
    },

    /**
     * Generic request interface (seperti MetaMask)
     */
    request({ method, params }: { method: string; params?: unknown }): Promise<unknown> {
      return sendToBackground(method, params);
    },
  };

  // Expose ke window
  Object.defineProperty(window, "garuda", {
    value: garuda,
    writable: false,
    configurable: false,
  });

  // Dispatch event agar DApp tahu extension sudah siap
  window.dispatchEvent(new Event("garuda#initialized"));

  console.log("[GarudaChain] Wallet extension terdeteksi ✓");
})();
