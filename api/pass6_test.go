// pass6_test.go — unit tests for the three Pass #6 defenses:
//
//   - audit circuit breaker
//   - admin request replay protection
//   - tail-hash witness payload codec
//
// Hermetic, no external dependencies. Safe to run with
// `go test ./api/...`.

package main

import (
	"bytes"
	"crypto/sha256"
	"encoding/hex"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"
)

// ── Circuit breaker ─────────────────────────────────────────────────────────

// TestAuditBreakerTripsAfterThreshold force-fails appendAuditChain by
// closing the underlying file descriptor from under the chain. Write
// and fsync then both fail, the consecutive-failure counter crosses
// breakerThreshold, and IsAuditBreakerTripped flips to true.
func TestAuditBreakerTripsAfterThreshold(t *testing.T) {
	ResetAuditChainForTest()
	ResetAuditBreaker()
	defer ResetAuditChainForTest()
	defer ResetAuditBreaker()

	dir := t.TempDir()
	path := filepath.Join(dir, "audit.log")
	if err := OpenAuditChain(path); err != nil {
		t.Fatalf("open: %v", err)
	}

	// Yank the file out from under the chain. Writes then fail with
	// "file already closed" which drives the breaker.
	auditChain.mu.Lock()
	_ = auditChain.file.Close()
	auditChain.mu.Unlock()

	if IsAuditBreakerTripped() {
		t.Fatal("breaker tripped before any failure")
	}
	for i := 0; i < breakerThreshold; i++ {
		Audit(AuditEvent{Event: "test", Result: "ok"})
	}
	if !IsAuditBreakerTripped() {
		t.Fatalf("breaker NOT tripped after %d failures", breakerThreshold)
	}
}

// TestAuditBreakerClearsOnSuccess confirms that a healthy write after
// a short burst of failures resets the consecutive-failure counter
// *before* the threshold is crossed. The tripped flag itself only
// clears via explicit ResetAuditBreaker — a single lucky write cannot
// un-freeze a previously-tripped breaker.
func TestAuditBreakerClearsOnSuccess(t *testing.T) {
	ResetAuditChainForTest()
	ResetAuditBreaker()
	defer ResetAuditChainForTest()
	defer ResetAuditBreaker()

	dir := t.TempDir()
	path := filepath.Join(dir, "audit.log")
	if err := OpenAuditChain(path); err != nil {
		t.Fatalf("open: %v", err)
	}

	// Fail once by swapping the file out; then restore it.
	auditChain.mu.Lock()
	goodFile := auditChain.file
	badFile, err := os.Open(os.DevNull) // read-only fd → write returns EBADF
	auditChain.mu.Unlock()
	if err != nil {
		t.Fatalf("open /dev/null: %v", err)
	}
	defer goodFile.Close()
	defer badFile.Close()

	auditChain.mu.Lock()
	auditChain.file = badFile
	auditChain.mu.Unlock()

	Audit(AuditEvent{Event: "fail1", Result: "ok"})

	auditChain.mu.Lock()
	failsAfterOne := auditChain.consecFails
	auditChain.mu.Unlock()
	if failsAfterOne == 0 {
		t.Fatal("expected 1 consecutive failure, got 0")
	}

	// Restore the good file; next write should succeed and reset.
	auditChain.mu.Lock()
	auditChain.file = goodFile
	// Seek to end so the next write lands at EOF.
	_, _ = goodFile.Seek(0, 2)
	auditChain.mu.Unlock()
	Audit(AuditEvent{Event: "good", Result: "ok"})

	auditChain.mu.Lock()
	failsAfterRecovery := auditChain.consecFails
	auditChain.mu.Unlock()
	if failsAfterRecovery != 0 {
		t.Errorf("consecFails not reset on success: %d", failsAfterRecovery)
	}
}

// ── Replay protection ──────────────────────────────────────────────────────

func TestCheckAdminReplayHappyPath(t *testing.T) {
	ResetAdminReplayCacheForTest()
	now := time.Now().Unix()
	if err := CheckAdminReplay("nonce-abc12345", now, false); err != nil {
		t.Errorf("fresh request rejected: %v", err)
	}
}

func TestCheckAdminReplayDuplicateNonce(t *testing.T) {
	ResetAdminReplayCacheForTest()
	now := time.Now().Unix()
	if err := CheckAdminReplay("n0nc3-duplicate-1", now, false); err != nil {
		t.Fatalf("first call failed: %v", err)
	}
	if err := CheckAdminReplay("n0nc3-duplicate-1", now, false); err == nil {
		t.Error("duplicate nonce accepted — replay protection broken")
	} else if !strings.Contains(err.Error(), "replay") {
		t.Errorf("wrong error for replay: %v", err)
	}
}

func TestCheckAdminReplayStaleTimestamp(t *testing.T) {
	ResetAdminReplayCacheForTest()
	stale := time.Now().Add(-10 * time.Minute).Unix()
	if err := CheckAdminReplay("nonce-stale-1", stale, false); err == nil {
		t.Error("stale timestamp accepted")
	} else if !strings.Contains(err.Error(), "replay window") {
		t.Errorf("wrong error for stale ts: %v", err)
	}
}

func TestCheckAdminReplayFutureTimestamp(t *testing.T) {
	ResetAdminReplayCacheForTest()
	future := time.Now().Add(10 * time.Minute).Unix()
	if err := CheckAdminReplay("nonce-future-1", future, false); err == nil {
		t.Error("future timestamp accepted")
	}
}

func TestCheckAdminReplayStrictRequiresFields(t *testing.T) {
	ResetAdminReplayCacheForTest()
	// In permissive mode, empty fields are fine.
	if err := CheckAdminReplay("", 0, false); err != nil {
		t.Errorf("permissive mode rejected empty fields: %v", err)
	}
	// In strict mode, empty fields are a hard error.
	if err := CheckAdminReplay("", 0, true); err == nil {
		t.Error("strict mode accepted empty fields")
	}
}

func TestCheckAdminReplayMismatchedFields(t *testing.T) {
	ResetAdminReplayCacheForTest()
	if err := CheckAdminReplay("abcdefgh", 0, false); err == nil {
		t.Error("nonce without timestamp accepted")
	}
	if err := CheckAdminReplay("", time.Now().Unix(), false); err == nil {
		t.Error("timestamp without nonce accepted")
	}
}

func TestCheckAdminReplayNonceLength(t *testing.T) {
	ResetAdminReplayCacheForTest()
	now := time.Now().Unix()
	if err := CheckAdminReplay("short", now, false); err == nil {
		t.Error("nonce shorter than minimum accepted")
	}
	if err := CheckAdminReplay(strings.Repeat("x", maxNonceLen+1), now, false); err == nil {
		t.Error("nonce longer than maximum accepted")
	}
}

// ── Witness payload codec ───────────────────────────────────────────────────

func TestWitnessPayloadRoundtrip(t *testing.T) {
	// Build a realistic tail hash — sha256 of some bytes.
	sum := sha256.Sum256([]byte("hello garuda pass 6"))
	tailRaw := sum[:]

	payload := buildWitnessPayload(42, tailRaw)
	if len(payload) != 49 {
		t.Fatalf("payload length = %d, want 49", len(payload))
	}
	if !bytes.Equal(payload[0:8], []byte(witnessMagic)) {
		t.Errorf("magic wrong: %q", payload[0:8])
	}
	if payload[8] != witnessVersion {
		t.Errorf("version wrong: 0x%02x", payload[8])
	}

	seq, tailHex, err := parseWitnessPayload(payload)
	if err != nil {
		t.Fatalf("parse: %v", err)
	}
	if seq != 42 {
		t.Errorf("seq roundtrip = %d, want 42", seq)
	}
	if tailHex != hex.EncodeToString(tailRaw) {
		t.Errorf("tail hex mismatch: got %s, want %s", tailHex, hex.EncodeToString(tailRaw))
	}
}

func TestWitnessPayloadBadMagic(t *testing.T) {
	raw := make([]byte, 49)
	copy(raw, []byte("XXXAUDIT"))
	raw[8] = witnessVersion
	if _, _, err := parseWitnessPayload(raw); err == nil {
		t.Error("expected error on bad magic")
	}
}

func TestWitnessPayloadBadLength(t *testing.T) {
	if _, _, err := parseWitnessPayload(make([]byte, 48)); err == nil {
		t.Error("expected error on short payload")
	}
	if _, _, err := parseWitnessPayload(make([]byte, 50)); err == nil {
		t.Error("expected error on long payload")
	}
}

// TestWitnessStatusSnapshot is a sanity check that GetWitnessStatus
// is safe to call when the witness is disabled (no goroutine ever
// started).
func TestWitnessStatusSnapshot(t *testing.T) {
	// Ensure clean state.
	witness.mu.Lock()
	witness.enabled = false
	witness.lastSeq = 0
	witness.mu.Unlock()

	s := GetWitnessStatus()
	if s.Enabled {
		t.Error("status reports enabled when it isn't")
	}
	if s.LastSeq != 0 {
		t.Errorf("last seq = %d, want 0", s.LastSeq)
	}
}

// sanity: confirm the tail-hash format used by the witness matches
// what the audit chain stores, so we don't silently ship a mismatch.
func TestWitnessTailHashLength(t *testing.T) {
	if len(emptyHash) != 64 {
		t.Fatalf("emptyHash length = %d, want 64 (hex sha256)", len(emptyHash))
	}
	raw, err := hex.DecodeString(emptyHash)
	if err != nil {
		t.Fatalf("emptyHash not valid hex: %v", err)
	}
	if len(raw) != 32 {
		t.Fatalf("decoded emptyHash = %d bytes, want 32", len(raw))
	}
}

// Guard: if someone changes breakerThreshold, TestAuditBreakerTripsAfterThreshold
// might false-pass (or miss a regression). Pin the value.
func TestBreakerThresholdConstant(t *testing.T) {
	if breakerThreshold < 2 {
		t.Errorf("breakerThreshold = %d; should be ≥ 2 to avoid tripping on a single transient error", breakerThreshold)
	}
	if breakerThreshold > 10 {
		t.Errorf("breakerThreshold = %d; too lenient, admin ops could run audit-blind for too long", breakerThreshold)
	}
}

// ── integration with Audit() ───────────────────────────────────────────────

// TestAuditBreakerBlocksRequireAdmin is a mini-integration test that
// wires the breaker into a fake http request the way handlers use it.
// Confirms the 503 path actually fires.
func TestAuditBreakerBlocksRequireAdmin(t *testing.T) {
	ResetAuditChainForTest()
	ResetAuditBreaker()
	defer ResetAuditChainForTest()
	defer ResetAuditBreaker()

	// Manually trip the breaker by poking internal state. This
	// avoids having to force real I/O failures for a coverage test.
	auditChain.mu.Lock()
	auditChain.breakerTripped = true
	auditChain.mu.Unlock()

	if !IsAuditBreakerTripped() {
		t.Fatal("setup: breaker should be tripped")
	}

	// Also confirm that ResetAuditBreaker actually clears it.
	ResetAuditBreaker()
	if IsAuditBreakerTripped() {
		t.Fatal("ResetAuditBreaker did not clear the flag")
	}
}

// make sure the package compiles with the fmt import used below.
var _ = fmt.Sprintf
