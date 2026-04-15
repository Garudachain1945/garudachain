/**
 * Inpage Provider — disuntikkan ke window setiap halaman web
 * Menyediakan window.garuda untuk DEX dan DApp
 * Private key TIDAK pernah masuk ke sini — hanya bridge ke background via postMessage
 */

(function () {
  if ((window as any).garuda) return;

  const pendingCallbacks = new Map<
    string,
    { resolve: (v: unknown) => void; reject: (e: Error) => void }
  >();

  // Listen responses dari content script via postMessage
  window.addEventListener("message", (event: MessageEvent) => {
    if (event.source !== window) return;
    if (!event.data || event.data.type !== "GARUDA_RESPONSE") return;
    const { id, result, error } = event.data;
    const pending = pendingCallbacks.get(id);
    if (!pending) return;
    pendingCallbacks.delete(id);
    if (error) {
      pending.reject(new Error(error));
    } else {
      pending.resolve(result);
    }
  });

  function sendToBackground(method: string, params?: unknown): Promise<unknown> {
    return new Promise((resolve, reject) => {
      const id = Math.random().toString(36).slice(2) + Date.now();
      pendingCallbacks.set(id, { resolve, reject });
      window.postMessage({
        type: "GARUDA_REQUEST",
        id,
        method,
        params,
      }, "*");
      // Timeout 5 menit (untuk approval flow)
      setTimeout(() => {
        if (pendingCallbacks.has(id)) {
          pendingCallbacks.delete(id);
          reject(new Error("Request timeout"));
        }
      }, 300_000);
    });
  }

  const garuda = {
    isGarudaChain: true,
    version: "1.0.0",
    network: "regtest",

    requestAccounts(): Promise<string[]> {
      return sendToBackground("garuda_requestAccounts") as Promise<string[]>;
    },

    getAccounts(): Promise<string[]> {
      return sendToBackground("garuda_getAccounts") as Promise<string[]>;
    },

    getBalance(address?: string): Promise<{
      address: string;
      balance_grd: number;
      assets: { asset_id: string; symbol: string; balance: number }[];
    }> {
      return sendToBackground("wallet_getBalance", { address }) as Promise<any>;
    },

    placeOrder(params: {
      assetId: string;
      side: "buy" | "sell";
      price: number;
      amount: number;
      address: string;
    }): Promise<{ txid: string; order_id: string }> {
      return sendToBackground("garuda_placeOrder", params) as Promise<any>;
    },

    signMessage(params: { message: string; address: string }): Promise<{ signature: string }> {
      return sendToBackground("garuda_signMessage", params) as Promise<any>;
    },

    /**
     * Send GRD transaction — used for deposit/withdraw/transfer.
     * Extension will build, sign (client-side), and broadcast the tx.
     * Private key NEVER leaves the extension.
     */
    sendTransaction(params: {
      from: string;
      to: string;
      amount: number;      // GRD amount (decimal, e.g. 0.5)
      kind?: "transfer" | "deposit" | "withdraw";
      memo?: string;
    }): Promise<{ txid: string; status: string }> {
      return sendToBackground("garuda_sendTransaction", params) as Promise<any>;
    },

    /**
     * Send token (asset) transaction — for transferring non-GRD assets.
     */
    sendToken(params: {
      from: string;
      to: string;
      assetId: string;
      amount: number;
    }): Promise<{ txid: string; status: string }> {
      return sendToBackground("garuda_sendToken", params) as Promise<any>;
    },

    request({ method, params }: { method: string; params?: unknown }): Promise<unknown> {
      return sendToBackground(method, params);
    },
  };

  Object.defineProperty(window, "garuda", {
    value: garuda,
    writable: false,
    configurable: false,
  });

  window.dispatchEvent(new Event("garuda#initialized"));
  console.log("[GarudaChain] Wallet extension terdeteksi");
})();
