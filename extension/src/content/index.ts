/**
 * Content Script — berjalan di setiap halaman web (isolated world)
 * Bridge pesan antara halaman (MAIN world) ↔ background service worker
 * Inpage script di-inject langsung via manifest.json (world: "MAIN")
 */

// Store pending requests yang menunggu approval
const pendingRequests: Record<string, boolean> = {};

// Cek apakah extension context masih valid
function isContextValid(): boolean {
  try {
    return !!chrome.runtime?.id;
  } catch {
    return false;
  }
}

// Listen approval results dari background (via chrome.tabs.sendMessage)
try {
  chrome.runtime.onMessage.addListener((message) => {
    if (message.type === "GARUDA_APPROVAL_RESULT") {
      const id = message.id;
      if (pendingRequests[id]) {
        window.postMessage({
          type: "GARUDA_RESPONSE",
          id: id,
          result: message.result,
          error: message.error,
        }, "*");
        delete pendingRequests[id];
      }
    }
  });
} catch {
  // Extension context invalidated — ignore
}

// Bridge: inpage (postMessage) → background (chrome.runtime.sendMessage)
window.addEventListener("message", (e: MessageEvent) => {
  if (e.source !== window || !e.data || e.data.type !== "GARUDA_REQUEST") return;

  const { id, method, params } = e.data;

  // Cek context masih valid sebelum kirim
  if (!isContextValid()) {
    window.postMessage({
      type: "GARUDA_RESPONSE",
      id,
      error: "Extension perlu di-refresh. Tutup tab ini dan buka ulang.",
    }, "*");
    return;
  }

  try {
    chrome.runtime.sendMessage(
      { method, params, origin: window.location.origin, id },
      (resp) => {
        if (chrome.runtime.lastError) {
          window.postMessage({
            type: "GARUDA_RESPONSE",
            id,
            error: chrome.runtime.lastError.message,
          }, "*");
          return;
        }

        // Background said "wait for approval" — store pending, result comes via onMessage
        if (resp && resp.waiting) {
          pendingRequests[id] = true;
          return;
        }

        // Normal immediate response
        window.postMessage({
          type: "GARUDA_RESPONSE",
          id,
          result: resp ? resp.result : undefined,
          error: resp ? resp.error : undefined,
        }, "*");
      }
    );
  } catch (err: any) {
    window.postMessage({
      type: "GARUDA_RESPONSE",
      id,
      error: err.message || "Extension error",
    }, "*");
  }
});
