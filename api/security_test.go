// security_test.go — unit tests for the defensive helpers in security.go.
//
// These tests are deliberately self-contained: they do not touch the RPC
// layer or start a real HTTP server. Run with `go test ./api/...` — they
// should complete in a few milliseconds.

package main

import (
	"bytes"
	"encoding/json"
	"io"
	"math"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"
)

// ── checkAdminKey ───────────────────────────────────────────────────────────

func TestCheckAdminKey(t *testing.T) {
	securityConfig.Lock()
	securityConfig.AdminKey = "correct-horse-battery-staple"
	securityConfig.Unlock()

	cases := []struct {
		name     string
		provided string
		want     bool
	}{
		{"exact match", "correct-horse-battery-staple", true},
		{"empty input", "", false},
		{"one char off", "Correct-horse-battery-staple", false},
		{"shorter", "correct", false},
		{"longer", "correct-horse-battery-staple-x", false},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			if got := checkAdminKey(tc.provided); got != tc.want {
				t.Errorf("checkAdminKey(%q) = %v, want %v", tc.provided, got, tc.want)
			}
		})
	}
}

// ── ValidAssetID ────────────────────────────────────────────────────────────

func TestValidAssetID(t *testing.T) {
	valid := strings.Repeat("a", 64)
	if err := ValidAssetID(valid); err != nil {
		t.Errorf("expected %q to be valid: %v", valid, err)
	}

	invalid := []string{
		"",
		strings.Repeat("a", 63),
		strings.Repeat("a", 65),
		strings.Repeat("g", 64), // not hex
		"../../etc/passwd",
	}
	for _, s := range invalid {
		if err := ValidAssetID(s); err == nil {
			t.Errorf("expected %q to be invalid", s)
		}
	}
}

// ── ValidAddress ────────────────────────────────────────────────────────────

func TestValidAddress(t *testing.T) {
	ok := []string{
		"grd1qhaclxgx8xhzxjmwg8meuwp7k2ut53t0equ002s",
		"grd1qufk0s4hh95gn7srrj06t0pmpzfym37ndjvjjgv",
	}
	for _, a := range ok {
		if err := ValidAddress(a); err != nil {
			t.Errorf("expected %q to be valid: %v", a, err)
		}
	}

	bad := []string{
		"",
		"bc1qar0srrr7xfkvy5l643lydnw9re59gtzzwf5mdq",        // wrong HRP
		"grd1",                                              // too short
		"grd1" + strings.Repeat("Z", 40),                    // uppercase not in charset
		"'; DROP TABLE wallets; --",                         // sql-ish junk
	}
	for _, a := range bad {
		if err := ValidAddress(a); err == nil {
			t.Errorf("expected %q to be invalid", a)
		}
	}
}

// ── ValidAmount ─────────────────────────────────────────────────────────────

func TestValidAmount(t *testing.T) {
	securityConfig.Lock()
	securityConfig.MaxAmountGRD = 1e9
	securityConfig.Unlock()

	ok := []float64{1, 100, 1e8, 9.99e8}
	for _, f := range ok {
		if err := ValidAmount(f, 0); err != nil {
			t.Errorf("expected %g to be valid: %v", f, err)
		}
	}

	bad := []float64{0, -1, math.NaN(), math.Inf(1), math.Inf(-1), 2e9, 1e-11}
	for _, f := range bad {
		if err := ValidAmount(f, 0); err == nil {
			t.Errorf("expected %g to be invalid", f)
		}
	}
}

// ── SafePathSegment ─────────────────────────────────────────────────────────

func TestSafePathSegment(t *testing.T) {
	cases := []struct {
		path string
		ok   bool
	}{
		{"/api/asset/holders/" + strings.Repeat("a", 64), true},
		{"/api/asset/holders/", false},      // trailing slash = empty seg
		{"/api/asset/holders/../etc/passwd", false},
		{"/api/asset/holders/foo:bar", false},
		{"/api/asset/holders/" + strings.Repeat("a", 200), false},
	}
	for _, tc := range cases {
		_, err := SafePathSegment(tc.path)
		if (err == nil) != tc.ok {
			t.Errorf("SafePathSegment(%q): ok=%v err=%v", tc.path, tc.ok, err)
		}
	}
}

// ── SafeMapInt64 ────────────────────────────────────────────────────────────

func TestSafeMapInt64(t *testing.T) {
	m := map[string]interface{}{
		"i":    int(42),
		"i64":  int64(43),
		"f":    float64(44),
		"nan":  math.NaN(),
		"inf":  math.Inf(1),
		"huge": 1e300, // out of int64 range
		"str":  "not a number",
		"num":  json.Number("45"),
	}
	want := map[string]int64{
		"i":       42,
		"i64":     43,
		"f":       44,
		"nan":     0,
		"inf":     0,
		"huge":    0,
		"str":     0,
		"missing": 0,
		"num":     45,
	}
	for k, w := range want {
		if g := SafeMapInt64(m, k); g != w {
			t.Errorf("SafeMapInt64[%s] = %d, want %d", k, g, w)
		}
	}
}

// ── rateLimiter ─────────────────────────────────────────────────────────────

func TestRateLimiter(t *testing.T) {
	rl := newRateLimiter(3, 200*time.Millisecond)
	ip := "1.2.3.4"

	for i := 0; i < 3; i++ {
		if !rl.Allow(ip) {
			t.Fatalf("hit %d should be allowed", i+1)
		}
	}
	if rl.Allow(ip) {
		t.Fatal("4th hit should be blocked")
	}

	// Different IP has a fresh bucket
	if !rl.Allow("5.6.7.8") {
		t.Fatal("different IP must be allowed")
	}

	// Wait for window to roll over
	time.Sleep(220 * time.Millisecond)
	if !rl.Allow(ip) {
		t.Fatal("after window, should be allowed again")
	}
}

// ── limitBodyMiddleware ─────────────────────────────────────────────────────

func TestLimitBodyMiddleware(t *testing.T) {
	readAll := func(r *http.Request) (int, error) {
		b, err := io.ReadAll(r.Body)
		return len(b), err
	}

	var gotErr error
	var gotLen int
	inner := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		gotLen, gotErr = readAll(r)
		w.WriteHeader(200)
	})
	h := limitBodyMiddleware(inner)

	// Under the cap — should pass through.
	body := bytes.NewReader(bytes.Repeat([]byte("a"), 1024))
	req := httptest.NewRequest("POST", "/api/test", body)
	rr := httptest.NewRecorder()
	h.ServeHTTP(rr, req)
	if gotErr != nil || gotLen != 1024 {
		t.Errorf("1 KiB body: err=%v len=%d", gotErr, gotLen)
	}

	// Over the cap — MaxBytesReader returns an error on read.
	big := bytes.NewReader(bytes.Repeat([]byte("a"), int(MaxBodyBytes)+100))
	req2 := httptest.NewRequest("POST", "/api/test", big)
	rr2 := httptest.NewRecorder()
	h.ServeHTTP(rr2, req2)
	if gotErr == nil {
		t.Error("oversized body should produce a read error")
	}
}

// ── metrics middleware + counters ───────────────────────────────────────────

func TestMetricsIncrement(t *testing.T) {
	before := metrics.SwapTotal
	IncMetric("swap")
	if metrics.SwapTotal != before+1 {
		t.Errorf("SwapTotal did not increment: before=%d after=%d", before, metrics.SwapTotal)
	}

	// Unknown metric is a no-op (must not panic).
	IncMetric("made_up_metric_name")
}

func TestMetricsEndpoint(t *testing.T) {
	req := httptest.NewRequest("GET", "/api/metrics", nil)
	rr := httptest.NewRecorder()
	handleMetrics(rr, req)

	body := rr.Body.String()
	for _, want := range []string{
		"garuda_uptime_seconds",
		"garuda_requests_total",
		"garuda_cbdc_mint_total",
		"garuda_dex_swap_total",
		"garuda_audit_events_total",
	} {
		if !strings.Contains(body, want) {
			t.Errorf("metrics body missing %q", want)
		}
	}
}

// ── routeLabel ──────────────────────────────────────────────────────────────

func TestRouteLabel(t *testing.T) {
	cases := map[string]string{
		"/api/blockchain/transactions/abc123": "/api/blockchain/transactions",
		"/api/asset/holders/long-id-here":     "/api/asset/holders",
		"/api/healthz":                        "/api/healthz",
		"/api/metrics":                        "/api/metrics",
	}
	for in, want := range cases {
		if got := routeLabel(in); got != want {
			t.Errorf("routeLabel(%q) = %q, want %q", in, got, want)
		}
	}
}

// ── CORS allowlist ──────────────────────────────────────────────────────────

func TestAllowedOriginFor(t *testing.T) {
	securityConfig.Lock()
	securityConfig.AllowedOrigins = []string{"https://app.garudachain.org", "https://admin.garudachain.org"}
	securityConfig.Unlock()
	defer func() {
		securityConfig.Lock()
		securityConfig.AllowedOrigins = nil
		securityConfig.Unlock()
	}()

	if got := allowedOriginFor("https://app.garudachain.org"); got != "https://app.garudachain.org" {
		t.Errorf("allowed origin rejected: %q", got)
	}
	if got := allowedOriginFor("https://evil.example.com"); got != "" {
		t.Errorf("disallowed origin echoed back: %q", got)
	}
}
