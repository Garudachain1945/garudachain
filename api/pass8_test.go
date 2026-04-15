// pass8_test.go — unit tests for Pass #8 hardening:
//
//   - File-based admin key loading (admin_key.go)
//   - HMAC-SHA256 request signing (admin_sig.go)
//   - In-memory key rotation (RotateAdminKey)
//
// Hermetic, no external dependencies. Safe to run with
// `go test ./api/...`.

package main

import (
	"bytes"
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"fmt"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

// ── Admin key file loader ─────────────────────────────────────────────────────

func TestLoadAdminKeyFromFile_HappyPath(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "admin.key")
	key := strings.Repeat("x", 40)
	if err := os.WriteFile(path, []byte(key+"\n"), 0400); err != nil {
		t.Fatalf("write: %v", err)
	}
	got, err := loadAdminKeyFromFile(path)
	if err != nil {
		t.Fatalf("unexpected err: %v", err)
	}
	if got != key {
		t.Errorf("key mismatch: got %q", got)
	}
}

func TestLoadAdminKeyFromFile_EmptyFile(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "empty.key")
	if err := os.WriteFile(path, []byte(""), 0400); err != nil {
		t.Fatalf("write: %v", err)
	}
	if _, err := loadAdminKeyFromFile(path); err == nil {
		t.Error("expected error for empty key file")
	}
}

func TestLoadAdminKeyFromFile_Missing(t *testing.T) {
	if _, err := loadAdminKeyFromFile("/tmp/garuda-no-such-key-file-12345"); err == nil {
		t.Error("expected error for non-existent file")
	}
}

func TestLoadAdminKeyFromFile_WorldReadableWarn(t *testing.T) {
	// The function should succeed (just warn) on a wide-permission file.
	dir := t.TempDir()
	path := filepath.Join(dir, "wide.key")
	key := strings.Repeat("y", 40)
	if err := os.WriteFile(path, []byte(key), 0644); err != nil {
		t.Fatalf("write: %v", err)
	}
	got, err := loadAdminKeyFromFile(path)
	if err != nil {
		t.Fatalf("unexpected err: %v", err)
	}
	if got != key {
		t.Errorf("key mismatch")
	}
}

// ── Key rotation ──────────────────────────────────────────────────────────────

func TestRotateAdminKey_TooShort(t *testing.T) {
	if err := RotateAdminKey("short"); err == nil {
		t.Error("expected error for short key")
	}
}

func TestRotateAdminKey_MinLength(t *testing.T) {
	// Save and restore original key.
	securityConfig.RLock()
	orig := securityConfig.AdminKey
	securityConfig.RUnlock()
	defer func() {
		securityConfig.Lock()
		securityConfig.AdminKey = orig
		securityConfig.Unlock()
	}()

	newKey := strings.Repeat("k", minAdminKeyLen)
	if err := RotateAdminKey(newKey); err != nil {
		t.Fatalf("unexpected err: %v", err)
	}
	securityConfig.RLock()
	got := securityConfig.AdminKey
	securityConfig.RUnlock()
	if got != newKey {
		t.Errorf("key not rotated: got %q", got)
	}
}

func TestRotateAdminKey_CheckAdminKeyUsesNew(t *testing.T) {
	securityConfig.RLock()
	orig := securityConfig.AdminKey
	securityConfig.RUnlock()
	defer func() {
		securityConfig.Lock()
		securityConfig.AdminKey = orig
		securityConfig.Unlock()
	}()

	newKey := strings.Repeat("z", 40)
	if err := RotateAdminKey(newKey); err != nil {
		t.Fatalf("rotate: %v", err)
	}
	if !checkAdminKey(newKey) {
		t.Error("new key not accepted by checkAdminKey")
	}
	if checkAdminKey(orig) {
		t.Error("old key still accepted after rotation")
	}
}

// ── HMAC request signing ───────────────────────────────────────────────────

func TestComputeAdminSig_Deterministic(t *testing.T) {
	key := "test-key-for-hmac-signing-unit-01"
	body := []byte(`{"amount":100}`)
	sig1 := ComputeAdminSig("POST", "/api/cbdc/mint", "nonce1", "1713000000", key, body)
	sig2 := ComputeAdminSig("POST", "/api/cbdc/mint", "nonce1", "1713000000", key, body)
	if sig1 != sig2 {
		t.Errorf("sig not deterministic: %s vs %s", sig1, sig2)
	}
	if !strings.HasPrefix(sig1, adminSigPrefix) {
		t.Errorf("sig missing prefix: %q", sig1)
	}
}

func TestComputeAdminSig_DifferentNonceDifferentSig(t *testing.T) {
	key := "test-key-for-hmac-signing-unit-02"
	body := []byte(`{}`)
	s1 := ComputeAdminSig("POST", "/p", "n1", "t1", key, body)
	s2 := ComputeAdminSig("POST", "/p", "n2", "t1", key, body)
	if s1 == s2 {
		t.Error("different nonce produced same sig")
	}
}

func TestComputeAdminSig_DifferentBodyDifferentSig(t *testing.T) {
	key := "test-key-for-hmac-signing-unit-03"
	s1 := ComputeAdminSig("POST", "/p", "n", "t", key, []byte(`{"a":1}`))
	s2 := ComputeAdminSig("POST", "/p", "n", "t", key, []byte(`{"a":2}`))
	if s1 == s2 {
		t.Error("different body produced same sig")
	}
}

func TestComputeAdminSig_KnownVector(t *testing.T) {
	// Manually compute and pin a known good HMAC to protect against
	// accidental canonical-string changes breaking compatibility.
	key := "garuda-test-hmac-key-pass8-known"
	body := []byte(`{"amount":42}`)
	method, path, nonce, ts := "POST", "/api/cbdc/mint", "abc12345", "1713000000"

	bodyHash := sha256.Sum256(body)
	canonical := strings.Join([]string{method, path, nonce, ts, hex.EncodeToString(bodyHash[:]), ""}, "\n")
	mac := hmac.New(sha256.New, []byte(key))
	mac.Write([]byte(canonical))
	want := adminSigPrefix + hex.EncodeToString(mac.Sum(nil))

	got := ComputeAdminSig(method, path, nonce, ts, key, body)
	if got != want {
		t.Errorf("known-vector mismatch:\n  got  %s\n  want %s", got, want)
	}
}

func TestVerifyAdminSig_ValidSig(t *testing.T) {
	// Set up a known admin key in securityConfig.
	securityConfig.Lock()
	orig := securityConfig.AdminKey
	testKey := strings.Repeat("t", minAdminKeyLen)
	securityConfig.AdminKey = testKey
	securityConfig.Unlock()
	defer func() {
		securityConfig.Lock()
		securityConfig.AdminKey = orig
		securityConfig.Unlock()
	}()

	body := []byte(`{"x":1}`)
	nonce := "nonce-verify-01"
	ts := "1713000000"
	sig := ComputeAdminSig("POST", "/api/test", nonce, ts, testKey, body)

	req := httptest.NewRequest("POST", "/api/test", bytes.NewReader(body))
	req.Header.Set("X-Admin-Nonce", nonce)
	req.Header.Set("X-Admin-Timestamp", ts)
	req.Header.Set(adminSigHeader, sig)

	if err := VerifyAdminSig(req, true); err != nil {
		t.Errorf("valid sig rejected: %v", err)
	}
}

func TestVerifyAdminSig_WrongKey(t *testing.T) {
	securityConfig.Lock()
	orig := securityConfig.AdminKey
	securityConfig.AdminKey = strings.Repeat("a", minAdminKeyLen)
	securityConfig.Unlock()
	defer func() {
		securityConfig.Lock()
		securityConfig.AdminKey = orig
		securityConfig.Unlock()
	}()

	body := []byte(`{}`)
	sig := ComputeAdminSig("POST", "/api/test", "n", "t", strings.Repeat("b", minAdminKeyLen), body)

	req := httptest.NewRequest("POST", "/api/test", bytes.NewReader(body))
	req.Header.Set("X-Admin-Nonce", "n")
	req.Header.Set("X-Admin-Timestamp", "t")
	req.Header.Set(adminSigHeader, sig)

	if err := VerifyAdminSig(req, false); err == nil {
		t.Error("wrong-key sig accepted")
	}
}

func TestVerifyAdminSig_TamperedBody(t *testing.T) {
	securityConfig.Lock()
	orig := securityConfig.AdminKey
	testKey := strings.Repeat("c", minAdminKeyLen)
	securityConfig.AdminKey = testKey
	securityConfig.Unlock()
	defer func() {
		securityConfig.Lock()
		securityConfig.AdminKey = orig
		securityConfig.Unlock()
	}()

	origBody := []byte(`{"amount":100}`)
	tamperedBody := []byte(`{"amount":999}`)
	sig := ComputeAdminSig("POST", "/api/cbdc/mint", "n1", "t1", testKey, origBody)

	// Send tampered body but original signature.
	req := httptest.NewRequest("POST", "/api/cbdc/mint", bytes.NewReader(tamperedBody))
	req.Header.Set("X-Admin-Nonce", "n1")
	req.Header.Set("X-Admin-Timestamp", "t1")
	req.Header.Set(adminSigHeader, sig)

	if err := VerifyAdminSig(req, false); err == nil {
		t.Error("tampered body accepted with original sig")
	}
}

func TestVerifyAdminSig_AbsentNotRequired(t *testing.T) {
	req := httptest.NewRequest("POST", "/api/test", bytes.NewReader([]byte(`{}`)))
	if err := VerifyAdminSig(req, false); err != nil {
		t.Errorf("absent sig (not required) should pass, got: %v", err)
	}
}

func TestVerifyAdminSig_AbsentRequired(t *testing.T) {
	req := httptest.NewRequest("POST", "/api/test", bytes.NewReader([]byte(`{}`)))
	if err := VerifyAdminSig(req, true); err == nil {
		t.Error("absent sig (required) should fail")
	}
}

func TestVerifyAdminSig_BadHex(t *testing.T) {
	req := httptest.NewRequest("POST", "/api/test", bytes.NewReader(nil))
	req.Header.Set(adminSigHeader, adminSigPrefix+"NOTVALIDHEX!!!")
	if err := VerifyAdminSig(req, false); err == nil {
		t.Error("bad hex accepted")
	}
}

func TestVerifyAdminSig_BadPrefix(t *testing.T) {
	req := httptest.NewRequest("POST", "/api/test", bytes.NewReader(nil))
	req.Header.Set(adminSigHeader, "sha256:deadbeef")
	if err := VerifyAdminSig(req, false); err == nil {
		t.Error("wrong prefix accepted")
	}
}

// ── key rotation endpoint ─────────────────────────────────────────────────

func TestHandleAdminRotateKey_Unauthenticated(t *testing.T) {
	ResetAuditBreaker()
	ResetAuditChainForTest()
	defer ResetAuditBreaker()
	defer ResetAuditChainForTest()

	w := httptest.NewRecorder()
	body := fmt.Sprintf(`{"new_key":"%s"}`, strings.Repeat("n", 40))
	req := httptest.NewRequest("POST", "/api/admin/rotate-key?admin_key=WRONG", bytes.NewBufferString(body))
	handleAdminRotateKey(w, req)
	if w.Code == http.StatusOK {
		t.Error("rotation accepted with wrong key")
	}
}

func TestHandleAdminRotateKey_TooShortNewKey(t *testing.T) {
	ResetAuditBreaker()
	ResetAuditChainForTest()
	defer ResetAuditBreaker()
	defer ResetAuditChainForTest()
	ResetAdminReplayCacheForTest()

	securityConfig.RLock()
	curKey := securityConfig.AdminKey
	securityConfig.RUnlock()

	w := httptest.NewRecorder()
	req := httptest.NewRequest("POST", "/api/admin/rotate-key?admin_key="+curKey,
		bytes.NewBufferString(`{"new_key":"short"}`))
	handleAdminRotateKey(w, req)
	if w.Code == http.StatusOK {
		t.Error("rotation accepted with too-short new key")
	}
}

// ensure fmt is used (suppresses "imported and not used" if tests change)
var _ = fmt.Sprintf
