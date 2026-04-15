// admin_status.go — GET /api/admin/security-status
//
// Returns a JSON snapshot of the current security configuration so
// operators can verify at a glance that the production settings are
// correct without SSH-ing into the box and reading env vars (which
// are sensitive). The response deliberately omits secret values —
// only booleans and counts are returned.
//
// This endpoint is protected by requireAdmin. In strict mode the
// HMAC sig and nonce headers are required just like any other admin
// call. The intent is to make it trivial to wire into a monitoring
// system:
//
//	curl -H "X-Admin-Key: $KEY" https://api.garuda/api/admin/security-status
//
// and alert if:
//   - strict_mode is false in production
//   - tls_configured is false
//   - hmac_required is false
//   - audit_chain_enabled is false
//   - audit_breaker_tripped is true
//   - using_default_admin_key is true

package main

import (
	"encoding/json"
	"net/http"
	"os"
)

// SecurityStatus is the response body of GET /api/admin/security-status.
// All fields are read-only snapshots — nothing is mutated by this call.
type SecurityStatus struct {
	StrictMode           bool   `json:"strict_mode"`
	TLSConfigured        bool   `json:"tls_configured"`
	HMACRequired         bool   `json:"hmac_required"`
	AuditChainEnabled    bool   `json:"audit_chain_enabled"`
	AuditBreakerTripped  bool   `json:"audit_breaker_tripped"`
	WitnessEnabled       bool   `json:"witness_enabled"`
	WitnessLastSeq       int64  `json:"witness_last_seq"`
	UsingDefaultAdminKey bool   `json:"using_default_admin_key"`
	UsingDefaultRPCPass  bool   `json:"using_default_rpc_pass"`
	BindAddr             string `json:"bind_addr"`
	AdminKeyLen          int    `json:"admin_key_len"`
}

func handleSecurityStatus(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		writeJSONErrStatus(w, http.StatusMethodNotAllowed, "GET required", nil)
		return
	}
	adminKey := r.URL.Query().Get("admin_key")
	if adminKey == "" {
		adminKey = r.Header.Get("X-Admin-Key")
	}
	if !requireAdmin(w, r, adminKey) {
		return
	}

	securityConfig.RLock()
	status := SecurityStatus{
		StrictMode:           securityConfig.StrictMode,
		TLSConfigured:        os.Getenv("GARUDA_TLS_CERT") != "" && os.Getenv("GARUDA_TLS_KEY") != "",
		HMACRequired:         adminHMACRequired(),
		UsingDefaultAdminKey: securityConfig.usingDefaults["GARUDA_ADMIN_KEY"],
		UsingDefaultRPCPass: securityConfig.usingDefaults["GARUDA_RPC_PASS_CBDC"] ||
			securityConfig.usingDefaults["GARUDA_RPC_PASS_PUBLIC"] ||
			securityConfig.usingDefaults["GARUDA_RPC_PASS_CREATOR"],
		BindAddr:    securityConfig.BindAddr,
		AdminKeyLen: len(securityConfig.AdminKey),
	}
	securityConfig.RUnlock()

	status.AuditChainEnabled = func() bool {
		auditChain.mu.Lock()
		defer auditChain.mu.Unlock()
		return auditChain.enabled
	}()
	status.AuditBreakerTripped = IsAuditBreakerTripped()

	ws := GetWitnessStatus()
	status.WitnessEnabled = ws.Enabled
	status.WitnessLastSeq = ws.LastSeq

	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(status)
}
