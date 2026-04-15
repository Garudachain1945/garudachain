/**
 * Inpage Provider — disuntikkan ke window setiap halaman web
 * Menyediakan window.garuda untuk DEX dan DApp
 * Private key TIDAK pernah masuk ke sini — hanya bridge ke background via postMessage
 */

(function () {
  if (window.garuda) return;

  const pendingCallbacks = new Map();

  // Listen responses dari content script via postMessage
  window.addEventListener("message", function (event) {
    if (event.source !== window) return;
    if (!event.data || event.data.type !== "GARUDA_RESPONSE") return;
    var id = event.data.id;
    var result = event.data.result;
    var error = event.data.error;
    var pending = pendingCallbacks.get(id);
    if (!pending) return;
    pendingCallbacks.delete(id);
    if (error) {
      pending.reject(new Error(error));
    } else {
      pending.resolve(result);
    }
  });

  function sendToBackground(method, params) {
    return new Promise(function (resolve, reject) {
      var id = Math.random().toString(36).slice(2) + Date.now();
      pendingCallbacks.set(id, { resolve: resolve, reject: reject });
      window.postMessage({
        type: "GARUDA_REQUEST",
        id: id,
        method: method,
        params: params,
      }, "*");
      // Timeout 5 menit (untuk approval flow)
      setTimeout(function () {
        if (pendingCallbacks.has(id)) {
          pendingCallbacks.delete(id);
          reject(new Error("Request timeout"));
        }
      }, 300000);
    });
  }

  var garuda = {
    isGarudaChain: true,
    version: "1.0.0",
    network: "regtest",

    requestAccounts: function () {
      return sendToBackground("garuda_requestAccounts");
    },

    getAccounts: function () {
      return sendToBackground("garuda_getAccounts");
    },

    getBalance: function (address) {
      return sendToBackground("wallet_getBalance", { address: address });
    },

    placeOrder: function (params) {
      return sendToBackground("garuda_placeOrder", params);
    },

    signMessage: function (params) {
      return sendToBackground("garuda_signMessage", params);
    },

    request: function (opts) {
      return sendToBackground(opts.method, opts.params);
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
