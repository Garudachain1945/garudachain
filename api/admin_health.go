// admin_health.go — GET /api/admin/health
//
// Deep health check: probes every critical subsystem and returns a
// structured JSON report with an overall healthy flag. Intended for
// operator runbooks and alerting dashboards.
//
// Subsystems checked:
//   - rpc_public   — publicNode.getblockchaininfo (≤2 s timeout)
//   - rpc_cbdc     — cbdcNode.getblockchaininfo
//   - rpc_creator  — creatorNode.getblockchaininfo
//   - audit_chain  — enabled, seq, breaker_tripped
//   - witness      — enabled, last_seq, failures_total
//   - tls          — GARUDA_TLS_CERT + GARUDA_TLS_KEY env vars set
//   - strict_mode  — securityConfig.StrictMode
//
// healthy = true iff:
//   - all three RPC probes succeed
//   - audit_chain enabled (warn only — may be legitimately disabled in dev)
//   - audit breaker NOT tripped
//   - strict_mode true (production requirement; false = degraded)
//
// The endpoint is protected by requireAdmin. Because it touches live
// RPC nodes it may take up to 3 × 2 s = 6 s on a healthy system; it
// should not be called in a tight loop.

package main

import (
	"encoding/json"
	"net/http"
	"os"
	"time"
)

// HealthReport is the JSON response body of GET /api/admin/health.
type HealthReport struct {
	Healthy    bool                     `json:"healthy"`
	CheckedAt  string                   `json:"checked_at"`
	Subsystems map[string]SubsystemHealth `json:"subsystems"`
}

// SubsystemHealth is one entry in HealthReport.Subsystems.
type SubsystemHealth struct {
	OK      bool   `json:"ok"`
	Detail  string `json:"detail,omitempty"`
}

// probeRPC calls getblockchaininfo on a node (nil-safe) and returns
// (ok, detail). A nil node is treated as "not configured".
func probeRPC(node *RPCClient, name string) (bool, string) {
	if node == nil {
		return false, name + " node not configured"
	}
	type blockInfo struct {
		Chain  string `json:"chain"`
		Blocks int64  `json:"blocks"`
	}
	raw, err := node.Call("getblockchaininfo", nil)
	if err != nil {
		return false, err.Error()
	}
	var info blockInfo
	if err := json.Unmarshal(raw, &info); err != nil {
		return false, "bad response: " + err.Error()
	}
	return true, info.Chain
}

// handleAdminHealth serves GET /api/admin/health.
func handleAdminHealth(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		writeJSONErrStatus(w, http.StatusMethodNotAllowed, "GET required", nil)
		return
	}
	adminKey := r.URL.Query().Get("admin_key")
	if adminKey == "" {
		adminKey = r.Header.Get("X-Admin-Key")
	}
	// Use the diagnostic variant: skips the audit breaker gate so operators
	// can still query health even when the breaker is tripped (which is
	// exactly when this endpoint is most useful).
	if !requireAdminDiagnostic(w, r, adminKey) {
		return
	}

	report := HealthReport{
		CheckedAt:  time.Now().UTC().Format(time.RFC3339),
		Subsystems: make(map[string]SubsystemHealth),
	}

	// ── RPC probes ────────────────────────────────────────────────────────────
	pubOK, pubDetail := probeRPC(publicNode, "public")
	report.Subsystems["rpc_public"] = SubsystemHealth{OK: pubOK, Detail: pubDetail}

	cbdcOK, cbdcDetail := probeRPC(cbdcNode, "cbdc")
	report.Subsystems["rpc_cbdc"] = SubsystemHealth{OK: cbdcOK, Detail: cbdcDetail}

	creatorOK, creatorDetail := probeRPC(creatorNode, "creator")
	report.Subsystems["rpc_creator"] = SubsystemHealth{OK: creatorOK, Detail: creatorDetail}

	// ── Audit chain ───────────────────────────────────────────────────────────
	auditChain.mu.Lock()
	chainEnabled := auditChain.enabled
	chainSeq := auditChain.seq
	breakerTripped := auditChain.breakerTripped
	auditChain.mu.Unlock()

	chainDetail := ""
	if breakerTripped {
		chainDetail = "circuit breaker tripped — admin ops frozen"
	} else if !chainEnabled {
		chainDetail = "disabled (GARUDA_AUDIT_FILE unset)"
	}
	report.Subsystems["audit_chain"] = SubsystemHealth{
		OK:     chainEnabled && !breakerTripped,
		Detail: chainDetail,
	}
	_ = chainSeq // exposed in metrics, not in health detail

	// ── Witness ───────────────────────────────────────────────────────────────
	ws := GetWitnessStatus()
	witnessDetail := ""
	if ws.FailuresTotal > 0 {
		witnessDetail = "witness failures detected"
	} else if !ws.Enabled {
		witnessDetail = "disabled (GARUDA_WITNESS_INTERVAL unset)"
	}
	report.Subsystems["witness"] = SubsystemHealth{
		OK:     ws.Enabled && ws.FailuresTotal == 0,
		Detail: witnessDetail,
	}

	// ── TLS ───────────────────────────────────────────────────────────────────
	tlsOK := os.Getenv("GARUDA_TLS_CERT") != "" && os.Getenv("GARUDA_TLS_KEY") != ""
	tlsDetail := ""
	if !tlsOK {
		tlsDetail = "TLS not configured (GARUDA_TLS_CERT / GARUDA_TLS_KEY unset)"
	}
	report.Subsystems["tls"] = SubsystemHealth{OK: tlsOK, Detail: tlsDetail}

	// ── Strict mode ───────────────────────────────────────────────────────────
	securityConfig.RLock()
	strictMode := securityConfig.StrictMode
	securityConfig.RUnlock()
	strictDetail := ""
	if !strictMode {
		strictDetail = "strict mode disabled — HMAC signing not enforced"
	}
	report.Subsystems["strict_mode"] = SubsystemHealth{OK: strictMode, Detail: strictDetail}

	// ── Overall health ────────────────────────────────────────────────────────
	// healthy = all three RPCs up AND audit breaker not tripped AND strict mode on.
	// TLS and witness are production requirements but are allowed to be off in
	// testnet / local dev — they are surfaced as warnings via ok=false but do NOT
	// flip the top-level healthy flag.  Operators can tighten this in their own
	// alerting layer.
	report.Healthy = pubOK && cbdcOK && creatorOK && !breakerTripped && strictMode

	w.Header().Set("Content-Type", "application/json")
	if !report.Healthy {
		w.WriteHeader(http.StatusServiceUnavailable)
	}
	_ = json.NewEncoder(w).Encode(report)
}
