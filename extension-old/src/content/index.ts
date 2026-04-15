/**
 * Content Script — berjalan di setiap halaman web
 * Meng-inject inpage.js dan bridge pesan antara halaman ↔ background
 */

// Inject inpage script ke dalam halaman (MAIN world)
const script = document.createElement("script");
script.src = chrome.runtime.getURL("inpage.js");
script.setAttribute("data-garuda-extension-id", chrome.runtime.id);
(document.head || document.documentElement).appendChild(script);
script.onload = () => script.remove();

// Bridge: webpage → background
window.addEventListener("__GARUDA_REQUEST__", (event: Event) => {
  const { detail } = event as CustomEvent;
  chrome.runtime.sendMessage(
    {
      method: detail.method,
      params: detail.params,
      origin: window.location.origin,
      id: detail.id,
    },
    (response) => {
      window.dispatchEvent(
        new CustomEvent("__GARUDA_RESPONSE__", {
          detail: { id: detail.id, ...response },
        })
      );
    }
  );
});
