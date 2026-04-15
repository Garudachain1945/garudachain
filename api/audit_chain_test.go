// audit_chain_test.go — unit tests for the tamper-evident audit log.
//
// These tests are hermetic — they write to a tempdir, never touch
// the real audit file, and reset the chain state via
// ResetAuditChainForTest so they can run in any order.

package main

import (
	"io/ioutil"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

// helper: open a fresh chain in a tempdir, run f, then clean up.
func withFreshChain(t *testing.T, f func(path string)) {
	t.Helper()
	ResetAuditChainForTest()
	defer ResetAuditChainForTest()

	dir := t.TempDir()
	path := filepath.Join(dir, "audit.log")
	if err := OpenAuditChain(path); err != nil {
		t.Fatalf("OpenAuditChain: %v", err)
	}
	f(path)
}

// TestAuditChainAppendAndVerify — happy path: write three entries
// through Audit(), verify the file has three valid linked rows.
func TestAuditChainAppendAndVerify(t *testing.T) {
	withFreshChain(t, func(path string) {
		Audit(AuditEvent{Event: "test", Result: "ok", IP: "1.2.3.4"})
		Audit(AuditEvent{Event: "test", Result: "ok", IP: "1.2.3.4", Meta: map[string]interface{}{"k": "v"}})
		Audit(AuditEvent{Event: "test", Result: "fail", IP: "1.2.3.4"})
		CloseAuditChain()

		n, err := VerifyAuditChain(path)
		if err != nil {
			t.Fatalf("verify failed: %v", err)
		}
		if n != 3 {
			t.Errorf("verified %d entries, want 3", n)
		}
	})
}

// TestAuditChainTamperRow — flip one byte in the middle row's
// payload and confirm Verify flags the row.
func TestAuditChainTamperRow(t *testing.T) {
	withFreshChain(t, func(path string) {
		Audit(AuditEvent{Event: "test", Result: "ok", IP: "1.1.1.1"})
		Audit(AuditEvent{Event: "test", Result: "ok", IP: "2.2.2.2"})
		Audit(AuditEvent{Event: "test", Result: "ok", IP: "3.3.3.3"})
		CloseAuditChain()

		raw, err := ioutil.ReadFile(path)
		if err != nil {
			t.Fatalf("read file: %v", err)
		}
		tampered := strings.Replace(string(raw), "2.2.2.2", "9.9.9.9", 1)
		if tampered == string(raw) {
			t.Fatal("tamper replacement did nothing — test setup bug")
		}
		if err := ioutil.WriteFile(path, []byte(tampered), 0600); err != nil {
			t.Fatalf("write tampered: %v", err)
		}

		n, err := VerifyAuditChain(path)
		if err == nil {
			t.Fatalf("expected verify to fail, got ok after %d entries", n)
		}
		if n != 1 {
			t.Errorf("expected verify to stop after 1 valid entry, stopped after %d", n)
		}
		if !strings.Contains(err.Error(), "hash mismatch") {
			t.Errorf("expected 'hash mismatch' error, got: %v", err)
		}
	})
}

// TestAuditChainTamperDelete — delete a row entirely. The next row's
// prev_hash should no longer match, breaking the chain.
func TestAuditChainTamperDelete(t *testing.T) {
	withFreshChain(t, func(path string) {
		Audit(AuditEvent{Event: "test", Result: "ok", IP: "1.1.1.1"})
		Audit(AuditEvent{Event: "test", Result: "ok", IP: "2.2.2.2"})
		Audit(AuditEvent{Event: "test", Result: "ok", IP: "3.3.3.3"})
		CloseAuditChain()

		raw, err := ioutil.ReadFile(path)
		if err != nil {
			t.Fatalf("read file: %v", err)
		}
		lines := strings.Split(strings.TrimRight(string(raw), "\n"), "\n")
		if len(lines) != 3 {
			t.Fatalf("expected 3 lines, got %d", len(lines))
		}
		// Drop the middle line.
		out := lines[0] + "\n" + lines[2] + "\n"
		if err := ioutil.WriteFile(path, []byte(out), 0600); err != nil {
			t.Fatalf("write truncated: %v", err)
		}

		n, err := VerifyAuditChain(path)
		if err == nil {
			t.Fatalf("expected verify to fail, got ok after %d entries", n)
		}
		if !strings.Contains(err.Error(), "prev_hash mismatch") {
			t.Errorf("expected 'prev_hash mismatch' error, got: %v", err)
		}
	})
}

// TestAuditChainRestartRecovery — close the chain, reopen the same
// file, and append more entries. Verification should cover the
// combined sequence with no breaks.
func TestAuditChainRestartRecovery(t *testing.T) {
	ResetAuditChainForTest()
	defer ResetAuditChainForTest()

	dir := t.TempDir()
	path := filepath.Join(dir, "audit.log")

	if err := OpenAuditChain(path); err != nil {
		t.Fatalf("open1: %v", err)
	}
	Audit(AuditEvent{Event: "phase1", Result: "ok"})
	Audit(AuditEvent{Event: "phase1", Result: "ok"})
	CloseAuditChain()

	if err := OpenAuditChain(path); err != nil {
		t.Fatalf("open2: %v", err)
	}
	Audit(AuditEvent{Event: "phase2", Result: "ok"})
	CloseAuditChain()

	n, err := VerifyAuditChain(path)
	if err != nil {
		t.Fatalf("verify after restart: %v", err)
	}
	if n != 3 {
		t.Errorf("verified %d entries, want 3", n)
	}
}

// TestAuditChainRejectCorruptOnOpen — a file with a broken chain
// must not be silently extended. OpenAuditChain must return an
// error and leave the chain disabled so no new rows can be appended
// on top of tampered history.
func TestAuditChainRejectCorruptOnOpen(t *testing.T) {
	ResetAuditChainForTest()
	defer ResetAuditChainForTest()

	dir := t.TempDir()
	path := filepath.Join(dir, "audit.log")

	if err := OpenAuditChain(path); err != nil {
		t.Fatalf("open1: %v", err)
	}
	Audit(AuditEvent{Event: "t", Result: "ok", IP: "7.7.7.7"})
	Audit(AuditEvent{Event: "t", Result: "ok", IP: "8.8.8.8"})
	CloseAuditChain()

	raw, _ := ioutil.ReadFile(path)
	tampered := strings.Replace(string(raw), "7.7.7.7", "0.0.0.0", 1)
	if err := os.WriteFile(path, []byte(tampered), 0600); err != nil {
		t.Fatalf("write tampered: %v", err)
	}

	err := OpenAuditChain(path)
	if err == nil {
		t.Fatal("OpenAuditChain must refuse a corrupt file")
	}
	if !strings.Contains(err.Error(), "hash mismatch") {
		t.Errorf("expected 'hash mismatch' error, got: %v", err)
	}
	// And critically, the chain must stay disabled.
	auditChain.mu.Lock()
	enabled := auditChain.enabled
	auditChain.mu.Unlock()
	if enabled {
		t.Error("chain is still enabled after refused Open — tampered file would be silently extended")
	}
}

// TestAuditChainDisabledIsNoop — with no path configured, Audit()
// must still work (legacy stdout behavior) and appendAuditChain
// must be a harmless no-op.
func TestAuditChainDisabledIsNoop(t *testing.T) {
	ResetAuditChainForTest()
	defer ResetAuditChainForTest()

	// Explicitly open with empty path → stays disabled.
	if err := OpenAuditChain(""); err != nil {
		t.Fatalf("OpenAuditChain(\"\"): %v", err)
	}
	// Must not panic, must not write anywhere.
	Audit(AuditEvent{Event: "noop", Result: "ok"})
}
