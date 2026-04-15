// pass11_test.go — unit tests for Pass #11:
//
//   - Global per-IP rate limiting middleware
//   - AES-256-GCM envelope encryption / decryption
//   - Idempotency key cache (get/set/replay/expiry/scoping/eviction)

package main

import (
	"bytes"
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"testing"
	"time"
)

// ── helpers ───────────────────────────────────────────────────────────────────

func newTestAESKey(t *testing.T) []byte {
	t.Helper()
	key := make([]byte, masterKeyLen)
	if _, err := rand.Read(key); err != nil {
		t.Fatalf("generate test key: %v", err)
	}
	return key
}

// ── global rate limiter ───────────────────────────────────────────────────────

func TestGlobalRateLimitAllows(t *testing.T) {
	ResetGlobalRateLimitForTest()
	defer ResetGlobalRateLimitForTest()

	called := 0
	inner := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		called++
		w.WriteHeader(http.StatusOK)
	})
	h := globalRateLimitMiddleware(inner)

	req := httptest.NewRequest("GET", "/api/healthz", nil)
	req.RemoteAddr = "10.0.0.1:9999"
	w := httptest.NewRecorder()
	h.ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Errorf("expected 200, got %d", w.Code)
	}
	if called != 1 {
		t.Errorf("handler called %d times, want 1", called)
	}
}

func TestGlobalRateLimitExceeded(t *testing.T) {
	// Use a private tight limiter (3 req/min) to avoid touching the
	// package-level globalIPRateLimit.
	tightLimiter := newRateLimiter(3, 1*time.Minute)
	hits := 0
	inner := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		hits++
		w.WriteHeader(http.StatusOK)
	})
	h := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method == http.MethodOptions || r.Method == http.MethodHead {
			inner.ServeHTTP(w, r)
			return
		}
		if !tightLimiter.Allow(clientIP(r)) {
			IncMetric("rate_limited")
			w.Header().Set("Retry-After", "60")
			writeJSONErrStatus(w, http.StatusTooManyRequests, "global rate limit exceeded", nil)
			return
		}
		inner.ServeHTTP(w, r)
	})

	ip := "192.0.2.99:1234"
	for i := 0; i < 3; i++ {
		req := httptest.NewRequest("GET", "/api/healthz", nil)
		req.RemoteAddr = ip
		w := httptest.NewRecorder()
		h.ServeHTTP(w, req)
		if w.Code != http.StatusOK {
			t.Fatalf("request %d: expected 200, got %d", i+1, w.Code)
		}
	}

	req := httptest.NewRequest("GET", "/api/healthz", nil)
	req.RemoteAddr = ip
	w := httptest.NewRecorder()
	h.ServeHTTP(w, req)
	if w.Code != http.StatusTooManyRequests {
		t.Errorf("expected 429 after limit, got %d", w.Code)
	}
	if w.Header().Get("Retry-After") != "60" {
		t.Errorf("Retry-After: want \"60\", got %q", w.Header().Get("Retry-After"))
	}
	if hits != 3 {
		t.Errorf("inner handler called %d times, want 3", hits)
	}
}

func TestGlobalRateLimitOptionsPassthrough(t *testing.T) {
	// OPTIONS must never consume rate budget (CORS preflight passthrough).
	tightLimiter := newRateLimiter(1, 1*time.Minute)
	passed := 0
	inner := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		passed++
		w.WriteHeader(http.StatusNoContent)
	})
	h := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method == http.MethodOptions || r.Method == http.MethodHead {
			inner.ServeHTTP(w, r)
			return
		}
		if !tightLimiter.Allow(clientIP(r)) {
			w.WriteHeader(http.StatusTooManyRequests)
			return
		}
		inner.ServeHTTP(w, r)
	})

	ip := "192.0.2.77:5555"
	for i := 0; i < 5; i++ {
		req := httptest.NewRequest("OPTIONS", "/api/healthz", nil)
		req.RemoteAddr = ip
		w := httptest.NewRecorder()
		h.ServeHTTP(w, req)
		if w.Code != http.StatusNoContent {
			t.Errorf("OPTIONS %d: expected 204, got %d", i+1, w.Code)
		}
	}
	// Budget must be intact — a GET should still pass (limit=1, 0 GETs so far).
	req := httptest.NewRequest("GET", "/api/healthz", nil)
	req.RemoteAddr = ip
	w := httptest.NewRecorder()
	h.ServeHTTP(w, req)
	if w.Code != http.StatusNoContent {
		t.Errorf("GET after OPTIONS: expected 204 (budget intact), got %d", w.Code)
	}
}

// ── AES-GCM envelope encryption ──────────────────────────────────────────────

func TestEncryptDecryptRoundtrip(t *testing.T) {
	key := newTestAESKey(t)
	plaintext := []byte("garuda-super-secret-admin-key-2026!!")

	path := t.TempDir() + "/admin.key.enc"
	if err := EncryptKeyToFile(path, plaintext, key); err != nil {
		t.Fatalf("EncryptKeyToFile: %v", err)
	}
	got, err := DecryptKeyFromFile(path, key)
	if err != nil {
		t.Fatalf("DecryptKeyFromFile: %v", err)
	}
	if !bytes.Equal(got, plaintext) {
		t.Errorf("roundtrip: want %q, got %q", plaintext, got)
	}
}

func TestDecryptWrongKey(t *testing.T) {
	key := newTestAESKey(t)
	wrongKey := newTestAESKey(t)
	path := t.TempDir() + "/admin.key.enc"
	if err := EncryptKeyToFile(path, []byte("secret"), key); err != nil {
		t.Fatalf("EncryptKeyToFile: %v", err)
	}
	if _, err := DecryptKeyFromFile(path, wrongKey); err == nil {
		t.Error("DecryptKeyFromFile should fail with wrong key")
	}
}

func TestDecryptTamperedFile(t *testing.T) {
	key := newTestAESKey(t)
	path := t.TempDir() + "/admin.key.enc"
	if err := EncryptKeyToFile(path, []byte("secret"), key); err != nil {
		t.Fatalf("EncryptKeyToFile: %v", err)
	}
	// Flip last byte to simulate ciphertext tampering.
	// chmod 0600 first — EncryptKeyToFile writes 0400 (read-only).
	if err := os.Chmod(path, 0600); err != nil {
		t.Fatalf("Chmod: %v", err)
	}
	data, err := os.ReadFile(path)
	if err != nil {
		t.Fatalf("ReadFile: %v", err)
	}
	data[len(data)-1] ^= 0xFF
	if err := os.WriteFile(path, data, 0600); err != nil {
		t.Fatalf("WriteFile: %v", err)
	}
	if _, err := DecryptKeyFromFile(path, key); err == nil {
		t.Error("DecryptKeyFromFile should detect GCM auth failure on tampered file")
	}
}

func TestEncryptShortKeyRejected(t *testing.T) {
	path := t.TempDir() + "/admin.key.enc"
	err := EncryptKeyToFile(path, []byte("test"), []byte("tooshort"))
	if err == nil {
		t.Error("EncryptKeyToFile should reject key shorter than 32 bytes")
	}
}

func TestDecryptShortKeyRejected(t *testing.T) {
	path := t.TempDir() + "/admin.key.enc"
	// Write dummy data so ReadFile succeeds.
	_ = os.WriteFile(path, []byte("dummy"), 0600)
	if _, err := DecryptKeyFromFile(path, []byte("short")); err == nil {
		t.Error("DecryptKeyFromFile should reject key shorter than 32 bytes")
	}
}

func TestParseMasterKeyValid(t *testing.T) {
	key := newTestAESKey(t)
	t.Setenv("GARUDA_MASTER_KEY", hex.EncodeToString(key))
	got, err := EnvKeyProvider{}.GetMasterKey()
	if err != nil {
		t.Fatalf("EnvKeyProvider.GetMasterKey: %v", err)
	}
	if !bytes.Equal(got, key) {
		t.Error("EnvKeyProvider returned wrong key bytes")
	}
}

func TestParseMasterKeyMissing(t *testing.T) {
	t.Setenv("GARUDA_MASTER_KEY", "")
	p := EnvKeyProvider{}
	if _, err := p.GetMasterKey(); err == nil {
		t.Error("EnvKeyProvider should error when env var is empty")
	}
}

func TestParseMasterKeyMalformed(t *testing.T) {
	t.Setenv("GARUDA_MASTER_KEY", "not-valid-hex!!")
	p := EnvKeyProvider{}
	if _, err := p.GetMasterKey(); err == nil {
		t.Error("EnvKeyProvider should error on malformed hex")
	}
}

func TestMaybeLoadEncryptedAdminKey(t *testing.T) {
	key := newTestAESKey(t)
	wantKey := "garuda-encrypted-admin-key-for-test-2026!!"
	path := t.TempDir() + "/admin.enc"
	if err := EncryptKeyToFile(path, []byte(wantKey), key); err != nil {
		t.Fatalf("EncryptKeyToFile: %v", err)
	}

	t.Setenv("GARUDA_MASTER_KEY", hex.EncodeToString(key))
	t.Setenv("GARUDA_ADMIN_KEY_ENC_FILE", path)

	cfg := &securityConfigT{usingDefaults: make(map[string]bool)}
	cfg.AdminKey = "old-key"
	maybeLoadEncryptedAdminKey(cfg)

	if cfg.AdminKey != wantKey {
		t.Errorf("admin key: want %q, got %q", wantKey, cfg.AdminKey)
	}
}

func TestMaybeLoadEncryptedAdminKeyNoMasterKey(t *testing.T) {
	// Without GARUDA_MASTER_KEY the function must fall back silently.
	t.Setenv("GARUDA_MASTER_KEY", "")
	t.Setenv("GARUDA_ADMIN_KEY_ENC_FILE", "/tmp/nonexistent.enc")

	cfg := &securityConfigT{usingDefaults: make(map[string]bool)}
	cfg.AdminKey = "original"
	maybeLoadEncryptedAdminKey(cfg)

	if cfg.AdminKey != "original" {
		t.Errorf("admin key should be unchanged without master key, got %q", cfg.AdminKey)
	}
}

// ── idempotency cache ─────────────────────────────────────────────────────────

func TestIdemCacheSetGet(t *testing.T) {
	c := newIdemCache()
	c.Set("mint", "key-1", 200, []byte(`{"status":"ok"}`), "application/json")

	e := c.Get("mint", "key-1")
	if e == nil {
		t.Fatal("expected cache hit, got nil")
	}
	if e.status != 200 {
		t.Errorf("status: want 200, got %d", e.status)
	}
	if string(e.body) != `{"status":"ok"}` {
		t.Errorf("body: want %q, got %q", `{"status":"ok"}`, e.body)
	}
}

func TestIdemCacheMiss(t *testing.T) {
	c := newIdemCache()
	if e := c.Get("mint", "nonexistent"); e != nil {
		t.Error("expected cache miss, got non-nil entry")
	}
}

func TestIdemCacheScopedByOp(t *testing.T) {
	c := newIdemCache()
	c.Set("mint", "key-scope", 200, []byte(`{"action":"mint"}`), "application/json")
	// Same key, different op — must NOT hit.
	if e := c.Get("burn", "key-scope"); e != nil {
		t.Error("idempotency key must be scoped per operation: burn should not see mint entry")
	}
}

func TestIdemCacheExpiry(t *testing.T) {
	c := newIdemCache()
	c.Set("mint", "key-ttl", 200, []byte(`{}`), "application/json")
	// Back-date to simulate TTL expiry.
	c.mu.Lock()
	c.entries["mint:key-ttl"].created = time.Now().Add(-(idemTTL + time.Second))
	c.mu.Unlock()

	if e := c.Get("mint", "key-ttl"); e != nil {
		t.Error("expected cache miss after TTL expiry")
	}
}

func TestIdemReplayResponse(t *testing.T) {
	c := newIdemCache()
	c.Set("burn", "key-replay", 200, []byte(`{"status":"ok"}`), "application/json")
	e := c.Get("burn", "key-replay")

	w := httptest.NewRecorder()
	if !replayIdem(w, e) {
		t.Fatal("replayIdem returned false for valid entry")
	}
	if w.Header().Get("X-Idempotency-Replayed") != "true" {
		t.Error("missing X-Idempotency-Replayed: true header on replay")
	}
	if w.Code != 200 {
		t.Errorf("replay status: want 200, got %d", w.Code)
	}
	if w.Body.String() != `{"status":"ok"}` {
		t.Errorf("replay body: want %q, got %q", `{"status":"ok"}`, w.Body.String())
	}
}

func TestIdemReplayNilEntry(t *testing.T) {
	w := httptest.NewRecorder()
	if replayIdem(w, nil) {
		t.Error("replayIdem(nil) should return false")
	}
}

func TestIdemCacheCapacityEviction(t *testing.T) {
	c := newIdemCache()
	for i := 0; i < maxIdemEntries+10; i++ {
		key := hex.EncodeToString([]byte{byte(i >> 8), byte(i & 0xFF)})
		c.Set("mint", key, 200, []byte("{}"), "application/json")
	}
	c.mu.Lock()
	n := len(c.entries)
	c.mu.Unlock()
	if n > maxIdemEntries {
		t.Errorf("cache size after eviction = %d, want <= %d", n, maxIdemEntries)
	}
}

// ── security-status reflects current config ───────────────────────────────────

func TestSecurityStatusAdminKeyLenCorrect(t *testing.T) {
	ResetAuditBreaker()
	ResetAuditChainForTest()
	defer ResetAuditBreaker()
	defer ResetAuditChainForTest()
	ResetAdminReplayCacheForTest()

	securityConfig.Lock()
	origStrict := securityConfig.StrictMode
	origKey := securityConfig.AdminKey
	securityConfig.StrictMode = false
	securityConfig.AdminKey = "garuda-test-admin-key-2026"
	curKey := securityConfig.AdminKey
	securityConfig.Unlock()
	defer func() {
		securityConfig.Lock()
		securityConfig.StrictMode = origStrict
		securityConfig.AdminKey = origKey
		securityConfig.Unlock()
	}()

	req := httptest.NewRequest("GET", "/api/admin/security-status?admin_key="+curKey, nil)
	w := httptest.NewRecorder()
	handleSecurityStatus(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", w.Code, w.Body.String())
	}
	var s SecurityStatus
	if err := json.Unmarshal(w.Body.Bytes(), &s); err != nil {
		t.Fatalf("unmarshal: %v", err)
	}
	if s.AdminKeyLen != len(curKey) {
		t.Errorf("admin_key_len: want %d, got %d", len(curKey), s.AdminKeyLen)
	}
}
