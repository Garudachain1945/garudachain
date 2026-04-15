import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";

const root = document.getElementById("root")!;

try {
  createRoot(root).render(<App />);
} catch (err) {
  root.innerHTML = `
    <div style="min-height:100vh;display:flex;align-items:center;justify-content:center;font-family:Inter,sans-serif;padding:2rem">
      <div style="text-align:center;max-width:400px">
        <div style="font-size:3rem;margin-bottom:1rem">🦅</div>
        <h1 style="font-size:1.5rem;font-weight:bold;margin-bottom:0.5rem">GarudaChain Explorer</h1>
        <p style="color:#666;margin-bottom:1rem">Aplikasi gagal dimuat. Pastikan backend API berjalan.</p>
        <pre style="color:#999;font-size:0.75rem;word-break:break-all">${err instanceof Error ? err.message : String(err)}</pre>
        <button onclick="location.reload()" style="margin-top:1rem;padding:0.5rem 1.5rem;background:#8B0000;color:white;border:none;border-radius:0.5rem;cursor:pointer">Reload</button>
      </div>
    </div>
  `;
}
