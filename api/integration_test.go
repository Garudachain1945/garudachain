//go:build integration
// +build integration

// integration_test.go — live end-to-end test against a running garudaapi.
//
// This test was written to lock in the manual verification done on
// 2026-04-13 when we closed the Pass #2 per-mint nonce fix verification
// loop. Unlike security_test.go (pure unit tests), this one requires:
//
//   - garudad running (regtest, multi-wallet, cbdc-authority loaded)
//   - garudaapi running and reachable at GARUDA_API_URL (default
//     http://127.0.0.1:5000)
//   - cbdc-authority wallet with at least one mature, chain-confirmed UTXO
//     addressed to a spendable key (not a ghost UTXO from a prior run)
//   - admin key matching GARUDA_ADMIN_KEY (default "garuda-admin-2026")
//
// Run with:  go test -tags=integration ./api/... -run TestLive -v
//
// The test is gated by a build tag so `go test ./api/...` keeps running
// only the fast unit tests in CI.

package main

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"strings"
	"testing"
	"time"
)

type liveCfg struct {
	baseURL  string
	adminKey string
	funder   string // address used as `address` field for issue
}

func getLiveCfg() liveCfg {
	c := liveCfg{
		baseURL:  os.Getenv("GARUDA_API_URL"),
		adminKey: os.Getenv("GARUDA_ADMIN_KEY"),
		funder:   os.Getenv("GARUDA_TEST_ADDR"),
	}
	if c.baseURL == "" {
		c.baseURL = "http://127.0.0.1:5000"
	}
	if c.adminKey == "" {
		c.adminKey = "garuda-admin-2026"
	}
	if c.funder == "" {
		c.funder = "grd1qhaclxgx8xhzxjmwg8meuwp7k2ut53t0equ002s"
	}
	return c
}

func postJSON(t *testing.T, url string, body interface{}) (int, map[string]interface{}) {
	t.Helper()
	buf, err := json.Marshal(body)
	if err != nil {
		t.Fatalf("marshal: %v", err)
	}
	req, err := http.NewRequest("POST", url, bytes.NewReader(buf))
	if err != nil {
		t.Fatalf("new request: %v", err)
	}
	req.Header.Set("Content-Type", "application/json")
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		t.Fatalf("do: %v", err)
	}
	defer resp.Body.Close()
	raw, _ := io.ReadAll(resp.Body)
	out := map[string]interface{}{}
	_ = json.Unmarshal(raw, &out)
	return resp.StatusCode, out
}

func getText(t *testing.T, url string) string {
	t.Helper()
	resp, err := http.Get(url)
	if err != nil {
		t.Fatalf("get: %v", err)
	}
	defer resp.Body.Close()
	raw, _ := io.ReadAll(resp.Body)
	return string(raw)
}

// TestLiveHealth is the canary — fails fast if the API isn't up so the
// rest of the suite doesn't emit noise.
func TestLiveHealth(t *testing.T) {
	cfg := getLiveCfg()
	resp, err := http.Get(cfg.baseURL + "/api/healthz")
	if err != nil {
		t.Fatalf("cannot reach API at %s: %v", cfg.baseURL, err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != 200 {
		t.Fatalf("healthz status %d, want 200", resp.StatusCode)
	}
}

// TestLiveAdminGate verifies that the mint endpoint rejects anonymous
// and wrong-key requests before doing any work. This is the single most
// important defensive invariant in the system: no mint without a valid
// admin key, ever.
func TestLiveAdminGate(t *testing.T) {
	cfg := getLiveCfg()
	url := cfg.baseURL + "/api/cbdc/mint"

	// Missing admin_key → 401/403.
	status, _ := postJSON(t, url, map[string]interface{}{
		"asset_id": strings.Repeat("a", 64),
		"amount":   1,
	})
	if status != 401 && status != 403 {
		t.Errorf("no admin key: status %d, want 401/403", status)
	}

	// Wrong admin_key → 401/403.
	status, _ = postJSON(t, url, map[string]interface{}{
		"asset_id":  strings.Repeat("a", 64),
		"amount":    1,
		"admin_key": "obviously-wrong",
	})
	if status != 401 && status != 403 {
		t.Errorf("wrong admin key: status %d, want 401/403", status)
	}
}

// TestLiveIssueThenMintMonotonic is the definitive test for the Pass #2
// per-mint random nonce fix in COutPoint.n: issue a fresh asset, then
// fire several back-to-back mints and verify each one produces a unique
// funding txid AND that the on-chain total_supply advances by exactly
// the minted amount each time. Prior to Pass #2, the second mint would
// fail with a wallet conflict because two identical OP_RETURN bodies
// produced identical funding txs.
func TestLiveIssueThenMintMonotonic(t *testing.T) {
	cfg := getLiveCfg()

	symbol := fmt.Sprintf("IT%d", time.Now().Unix()%10000)
	issueStatus, issueResp := postJSON(t, cfg.baseURL+"/api/cbdc/issue", map[string]interface{}{
		"symbol":       symbol,
		"name":         "Integration Test Token",
		"type":         "stablecoin",
		"total_supply": 1000000,
		"address":      cfg.funder,
		"peg_rate":     1.0,
		"peg_currency": "IDR",
		"admin_key":    cfg.adminKey,
	})
	if issueStatus != 200 {
		t.Fatalf("issue status %d, resp %v", issueStatus, issueResp)
	}
	assetID, _ := issueResp["asset_id"].(string)
	if len(assetID) != 64 {
		t.Fatalf("bad asset_id: %q", assetID)
	}
	t.Logf("issued asset %s (%s)", symbol, assetID)

	// Query starting supply straight from the chain.
	supplyURL := cfg.baseURL + "/api/cbdc/supply/" + assetID
	startSupply := readSupply(t, supplyURL)
	if startSupply != 1000000 {
		t.Fatalf("start supply = %d, want 1000000", startSupply)
	}

	const n = 3 // mint rate limit is 5/min; leave headroom
	mintAmt := int64(100)
	seenTxids := map[string]bool{}
	expected := startSupply
	for i := 0; i < n; i++ {
		status, resp := postJSON(t, cfg.baseURL+"/api/cbdc/mint", map[string]interface{}{
			"asset_id":  assetID,
			"amount":    mintAmt,
			"admin_key": cfg.adminKey,
		})
		if status != 200 {
			t.Fatalf("mint #%d status %d resp %v", i+1, status, resp)
		}
		txid, _ := resp["txid"].(string)
		if len(txid) != 64 {
			t.Fatalf("mint #%d bad txid: %q", i+1, txid)
		}
		if seenTxids[txid] {
			t.Fatalf("mint #%d returned duplicate txid %s — Pass #2 nonce fix regressed", i+1, txid)
		}
		seenTxids[txid] = true

		expected += mintAmt
		got := readSupply(t, supplyURL)
		if got != expected {
			t.Fatalf("mint #%d supply = %d, want %d", i+1, got, expected)
		}
		t.Logf("mint #%d ok: txid=%s supply=%d", i+1, txid, got)
	}
}

// TestLiveRateLimit confirms the mint endpoint actually rejects the
// N+1-th burst hit with 429, not just 200-silently.
func TestLiveRateLimit(t *testing.T) {
	cfg := getLiveCfg()

	// Issue a throwaway asset so we have something to mint.
	symbol := fmt.Sprintf("RL%d", time.Now().Unix()%10000)
	issueStatus, issueResp := postJSON(t, cfg.baseURL+"/api/cbdc/issue", map[string]interface{}{
		"symbol":       symbol,
		"name":         "Rate Limit Token",
		"type":         "stablecoin",
		"total_supply": 1000,
		"address":      cfg.funder,
		"peg_rate":     1.0,
		"peg_currency": "IDR",
		"admin_key":    cfg.adminKey,
	})
	if issueStatus != 200 {
		t.Fatalf("issue status %d resp %v", issueStatus, issueResp)
	}
	assetID, _ := issueResp["asset_id"].(string)

	// Hit mint until we see a 429. The rate limiter is 5/min so we
	// cap at 8 attempts to bound the test.
	saw429 := false
	for i := 0; i < 8; i++ {
		status, _ := postJSON(t, cfg.baseURL+"/api/cbdc/mint", map[string]interface{}{
			"asset_id":  assetID,
			"amount":    1,
			"admin_key": cfg.adminKey,
		})
		if status == 429 {
			saw429 = true
			break
		}
	}
	if !saw429 {
		t.Error("expected mint rate limiter to trip within 8 burst hits")
	}
}

// TestLiveMetricsEndpoint sanity-checks that /api/metrics exposes the
// Prometheus counters we rely on for observability.
func TestLiveMetricsEndpoint(t *testing.T) {
	cfg := getLiveCfg()
	body := getText(t, cfg.baseURL+"/api/metrics")
	for _, want := range []string{
		"garuda_uptime_seconds",
		"garuda_requests_total",
		"garuda_cbdc_mint_total",
		"garuda_cbdc_issue_total",
		"garuda_rate_limited_total",
		"garuda_audit_events_total",
	} {
		if !strings.Contains(body, want) {
			t.Errorf("metrics body missing %q", want)
		}
	}
}

func readSupply(t *testing.T, url string) int64 {
	t.Helper()
	resp, err := http.Get(url)
	if err != nil {
		t.Fatalf("supply get: %v", err)
	}
	defer resp.Body.Close()
	var out struct {
		TotalSupply int64 `json:"total_supply"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&out); err != nil {
		t.Fatalf("supply decode: %v", err)
	}
	return out.TotalSupply
}
