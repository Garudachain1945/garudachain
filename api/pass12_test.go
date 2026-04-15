// pass12_test.go — unit tests for Pass #12:
//
//   - /api/admin/health deep health endpoint (shape, subsystem fields,
//     HTTP 503 on unhealthy, admin gate)
//   - Prometheus metrics additions: garuda_audit_chain_length,
//     garuda_audit_chain_breaker_tripped, garuda_witness_last_seq,
//     garuda_witness_commits_total, garuda_witness_failures_total

package main

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

// adminKeyForTest sets securityConfig.AdminKey to a known test value,
// disables StrictMode so no HMAC headers are required, and returns both
// the key and a restore func. Call defer restore() immediately.
func adminKeyForTest(t *testing.T) (key string, restore func()) {
	t.Helper()
	securityConfig.Lock()
	origKey := securityConfig.AdminKey
	origStrict := securityConfig.StrictMode
	securityConfig.AdminKey = "garuda-test-admin-key-2026"
	securityConfig.StrictMode = false
	curKey := securityConfig.AdminKey
	securityConfig.Unlock()
	return curKey, func() {
		securityConfig.Lock()
		securityConfig.AdminKey = origKey
		securityConfig.StrictMode = origStrict
		securityConfig.Unlock()
	}
}

// ── /api/admin/health shape ───────────────────────────────────────────────────

func TestAdminHealthShape(t *testing.T) {
	ResetAuditBreaker()
	ResetAuditChainForTest()
	ResetAdminReplayCacheForTest()
	defer ResetAuditBreaker()
	defer ResetAuditChainForTest()

	key, restore := adminKeyForTest(t)
	defer restore()

	req := httptest.NewRequest("GET", "/api/admin/health?admin_key="+key, nil)
	w := httptest.NewRecorder()
	handleAdminHealth(w, req)

	// When all RPC nodes are nil (test environment) the response is 503
	// but the JSON shape must still be valid.
	if w.Code != http.StatusOK && w.Code != http.StatusServiceUnavailable {
		t.Fatalf("expected 200 or 503, got %d: %s", w.Code, w.Body.String())
	}

	var report HealthReport
	if err := json.Unmarshal(w.Body.Bytes(), &report); err != nil {
		t.Fatalf("unmarshal HealthReport: %v", err)
	}
	if report.CheckedAt == "" {
		t.Error("HealthReport.CheckedAt must not be empty")
	}
	required := []string{
		"rpc_public", "rpc_cbdc", "rpc_creator",
		"audit_chain", "witness", "tls", "strict_mode",
	}
	for _, sub := range required {
		if _, ok := report.Subsystems[sub]; !ok {
			t.Errorf("subsystem %q missing from HealthReport", sub)
		}
	}
}

func TestAdminHealthRequiresAdminKey(t *testing.T) {
	ResetAuditBreaker()
	defer ResetAuditBreaker()

	key, restore := adminKeyForTest(t)
	defer restore()
	_ = key // we deliberately send the wrong key

	req := httptest.NewRequest("GET", "/api/admin/health?admin_key=wrongkey", nil)
	w := httptest.NewRecorder()
	handleAdminHealth(w, req)

	if w.Code != http.StatusUnauthorized {
		t.Errorf("expected 401 with wrong admin key, got %d", w.Code)
	}
}

func TestAdminHealthMethodNotAllowed(t *testing.T) {
	key, restore := adminKeyForTest(t)
	defer restore()

	req := httptest.NewRequest("POST", "/api/admin/health?admin_key="+key, nil)
	w := httptest.NewRecorder()
	handleAdminHealth(w, req)

	if w.Code != http.StatusMethodNotAllowed {
		t.Errorf("expected 405 for POST, got %d", w.Code)
	}
}

func TestAdminHealthNilNodes503(t *testing.T) {
	ResetAuditBreaker()
	ResetAuditChainForTest()
	ResetAdminReplayCacheForTest()
	defer ResetAuditBreaker()
	defer ResetAuditChainForTest()

	key, restore := adminKeyForTest(t)
	defer restore()

	// publicNode / cbdcNode / creatorNode are all nil in test mode.
	// The healthy flag must be false → 503.
	req := httptest.NewRequest("GET", "/api/admin/health?admin_key="+key, nil)
	w := httptest.NewRecorder()
	handleAdminHealth(w, req)

	if w.Code != http.StatusServiceUnavailable {
		t.Errorf("expected 503 when RPC nodes are nil, got %d", w.Code)
	}
	var report HealthReport
	if err := json.Unmarshal(w.Body.Bytes(), &report); err != nil {
		t.Fatalf("unmarshal: %v", err)
	}
	if report.Healthy {
		t.Error("HealthReport.Healthy must be false when nodes are nil")
	}
	for _, name := range []string{"rpc_public", "rpc_cbdc", "rpc_creator"} {
		sub := report.Subsystems[name]
		if sub.OK {
			t.Errorf("subsystem %s: expected ok=false with nil node", name)
		}
		if sub.Detail == "" {
			t.Errorf("subsystem %s: expected non-empty detail on failure", name)
		}
	}
}

func TestAdminHealthAuditBreakerReflected(t *testing.T) {
	ResetAuditChainForTest()
	ResetAdminReplayCacheForTest()
	defer ResetAuditChainForTest()
	defer ResetAuditBreaker()

	// Trip the breaker manually.
	auditChain.mu.Lock()
	auditChain.breakerTripped = true
	auditChain.mu.Unlock()

	key, restore := adminKeyForTest(t)
	defer restore()

	req := httptest.NewRequest("GET", "/api/admin/health?admin_key="+key, nil)
	w := httptest.NewRecorder()
	handleAdminHealth(w, req)

	var report HealthReport
	if err := json.Unmarshal(w.Body.Bytes(), &report); err != nil {
		t.Fatalf("unmarshal: %v", err)
	}
	sub := report.Subsystems["audit_chain"]
	if sub.OK {
		t.Error("audit_chain subsystem: ok should be false when breaker is tripped")
	}
	if !strings.Contains(sub.Detail, "circuit breaker") {
		t.Errorf("audit_chain detail should mention circuit breaker, got %q", sub.Detail)
	}
	if report.Healthy {
		t.Error("overall healthy must be false when audit breaker is tripped")
	}
}

func TestAdminHealthStrictModeReflected(t *testing.T) {
	ResetAuditBreaker()
	ResetAuditChainForTest()
	ResetAdminReplayCacheForTest()
	defer ResetAuditBreaker()
	defer ResetAuditChainForTest()

	key, restore := adminKeyForTest(t)
	defer restore()

	req := httptest.NewRequest("GET", "/api/admin/health?admin_key="+key, nil)
	w := httptest.NewRecorder()
	handleAdminHealth(w, req)

	var report HealthReport
	if err := json.Unmarshal(w.Body.Bytes(), &report); err != nil {
		t.Fatalf("unmarshal: %v", err)
	}
	// StrictMode is false in test setup → subsystem ok=false.
	sub := report.Subsystems["strict_mode"]
	if sub.OK {
		t.Error("strict_mode: ok should be false when StrictMode=false")
	}
}

// ── probeRPC helper ───────────────────────────────────────────────────────────

func TestProbeRPCNilNode(t *testing.T) {
	ok, detail := probeRPC(nil, "testnode")
	if ok {
		t.Error("probeRPC(nil) should return ok=false")
	}
	if !strings.Contains(detail, "not configured") {
		t.Errorf("probeRPC(nil) detail: want 'not configured', got %q", detail)
	}
}

// ── Prometheus audit chain metrics ───────────────────────────────────────────

func TestMetricsAuditChainLength(t *testing.T) {
	ResetAuditChainForTest()
	defer ResetAuditChainForTest()

	// Manually advance the seq so the metric is non-zero.
	auditChain.mu.Lock()
	auditChain.seq = 42
	auditChain.mu.Unlock()

	req := httptest.NewRequest("GET", "/api/metrics", nil)
	w := httptest.NewRecorder()
	handleMetrics(w, req)

	body := w.Body.String()
	if !strings.Contains(body, "garuda_audit_chain_length 42") {
		t.Errorf("metrics missing garuda_audit_chain_length 42, got:\n%s", body)
	}
}

func TestMetricsAuditBreakerTripped(t *testing.T) {
	ResetAuditChainForTest()
	defer ResetAuditChainForTest()
	defer ResetAuditBreaker()

	auditChain.mu.Lock()
	auditChain.breakerTripped = true
	auditChain.mu.Unlock()

	req := httptest.NewRequest("GET", "/api/metrics", nil)
	w := httptest.NewRecorder()
	handleMetrics(w, req)

	body := w.Body.String()
	if !strings.Contains(body, "garuda_audit_chain_breaker_tripped 1") {
		t.Errorf("metrics: expected garuda_audit_chain_breaker_tripped 1, got:\n%s", body)
	}
}

func TestMetricsAuditBreakerNotTripped(t *testing.T) {
	ResetAuditBreaker()
	ResetAuditChainForTest()
	defer ResetAuditBreaker()
	defer ResetAuditChainForTest()

	req := httptest.NewRequest("GET", "/api/metrics", nil)
	w := httptest.NewRecorder()
	handleMetrics(w, req)

	body := w.Body.String()
	if !strings.Contains(body, "garuda_audit_chain_breaker_tripped 0") {
		t.Errorf("metrics: expected garuda_audit_chain_breaker_tripped 0, got:\n%s", body)
	}
}

func TestMetricsWitnessLastSeq(t *testing.T) {
	// Witness is disabled in test, so last_seq should be 0.
	req := httptest.NewRequest("GET", "/api/metrics", nil)
	w := httptest.NewRecorder()
	handleMetrics(w, req)

	body := w.Body.String()
	if !strings.Contains(body, "garuda_witness_last_seq") {
		t.Error("metrics: missing garuda_witness_last_seq")
	}
	if !strings.Contains(body, "garuda_witness_commits_total") {
		t.Error("metrics: missing garuda_witness_commits_total")
	}
	if !strings.Contains(body, "garuda_witness_failures_total") {
		t.Error("metrics: missing garuda_witness_failures_total")
	}
}

func TestMetricsContentType(t *testing.T) {
	req := httptest.NewRequest("GET", "/api/metrics", nil)
	w := httptest.NewRecorder()
	handleMetrics(w, req)

	ct := w.Header().Get("Content-Type")
	if !strings.HasPrefix(ct, "text/plain") {
		t.Errorf("metrics Content-Type: want text/plain..., got %q", ct)
	}
}
