// security.go — defensive helpers for the GarudaAPI HTTP layer.
//
// This file provides:
//   - centralized configuration loaded from env (with safe-but-warned defaults)
//   - constant-time admin key check
//   - input validators for asset IDs, addresses, amounts, path segments
//   - safe map type accessors that never panic
//   - generic error responses that do not leak RPC internals
//   - per-IP rate limiters for sensitive endpoints
//   - CORS origin allowlist
//
// All helpers are additive: legacy code paths continue to work even if env
// is not configured. When env is missing, operators see a [SECURITY] WARN
// at startup so the insecure default cannot pass silently into production.

package main

import (
	"crypto/subtle"
	"encoding/json"
	"errors"
	"fmt"
	"log"
	"math"
	"net/http"
	"os"
	"regexp"
	"strconv"
	"strings"
	"sync"
	"time"
)

// ─── Configuration ───────────────────────────────────────────────────────────

type securityConfigT struct {
	sync.RWMutex
	AdminKey         string
	AllowedOrigins   []string
	RPCUserCBDC      string
	RPCPassCBDC      string
	RPCUserPublic    string
	RPCPassPublic    string
	RPCUserCreator   string
	RPCPassCreator   string
	TreasuryAddress  string
	MaxAmountGRD     float64
	StrictMode       bool
	TrustProxy       bool
	BindAddr         string
	usingDefaults    map[string]bool
}

var securityConfig = &securityConfigT{
	MaxAmountGRD:  1e9, // 1B GRD per single tx is the absolute cap
	usingDefaults: make(map[string]bool),
}

// loadSecurityConfig reads env-vars and populates the security config.
// Should be called once at startup, before any handler is registered.
func loadSecurityConfig() {
	securityConfig.Lock()
	defer securityConfig.Unlock()

	get := func(key, def string) string {
		if v := os.Getenv(key); v != "" {
			return v
		}
		securityConfig.usingDefaults[key] = true
		return def
	}

	// Admin key — priority: encrypted file > plaintext file > env var > default.
	// maybeLoadAdminKeyFile and maybeLoadEncryptedAdminKey are both called so
	// each can override the prior level. Encrypted takes final precedence.
	securityConfig.AdminKey = get("GARUDA_ADMIN_KEY", "garuda-admin-2026")
	maybeLoadAdminKeyFile(securityConfig)
	maybeLoadEncryptedAdminKey(securityConfig)

	// RPC credentials per node — these correspond to the rpcuser/rpcpassword
	// in each node's bitcoin.conf. Defaults match the existing dev setup.
	// Each password also accepts a _FILE variant (same pattern as admin key)
	// that reads the credential from a 0400 file instead of the env var.
	securityConfig.RPCUserCBDC = get("GARUDA_RPC_USER_CBDC", "garudacbdc")
	securityConfig.RPCPassCBDC = get("GARUDA_RPC_PASS_CBDC", "garudacbdc123")
	if p := loadRPCPassFile("GARUDA_RPC_PASS_CBDC_FILE"); p != "" {
		securityConfig.RPCPassCBDC = p
		delete(securityConfig.usingDefaults, "GARUDA_RPC_PASS_CBDC")
	}
	if p := maybeLoadEncryptedRPCPass("GARUDA_RPC_PASS_CBDC_ENC_FILE"); p != "" {
		securityConfig.RPCPassCBDC = p
		delete(securityConfig.usingDefaults, "GARUDA_RPC_PASS_CBDC")
	}
	securityConfig.RPCUserPublic = get("GARUDA_RPC_USER_PUBLIC", "garudapublic")
	securityConfig.RPCPassPublic = get("GARUDA_RPC_PASS_PUBLIC", "garudapublic123")
	if p := loadRPCPassFile("GARUDA_RPC_PASS_PUBLIC_FILE"); p != "" {
		securityConfig.RPCPassPublic = p
		delete(securityConfig.usingDefaults, "GARUDA_RPC_PASS_PUBLIC")
	}
	if p := maybeLoadEncryptedRPCPass("GARUDA_RPC_PASS_PUBLIC_ENC_FILE"); p != "" {
		securityConfig.RPCPassPublic = p
		delete(securityConfig.usingDefaults, "GARUDA_RPC_PASS_PUBLIC")
	}
	securityConfig.RPCUserCreator = get("GARUDA_RPC_USER_CREATOR", "garudacreator")
	securityConfig.RPCPassCreator = get("GARUDA_RPC_PASS_CREATOR", "garudacreator123")
	if p := loadRPCPassFile("GARUDA_RPC_PASS_CREATOR_FILE"); p != "" {
		securityConfig.RPCPassCreator = p
		delete(securityConfig.usingDefaults, "GARUDA_RPC_PASS_CREATOR")
	}
	if p := maybeLoadEncryptedRPCPass("GARUDA_RPC_PASS_CREATOR_ENC_FILE"); p != "" {
		securityConfig.RPCPassCreator = p
		delete(securityConfig.usingDefaults, "GARUDA_RPC_PASS_CREATOR")
	}

	// Treasury / fee collection address. Production should override this
	// with an env var pointing at a multisig HSM-backed address.
	securityConfig.TreasuryAddress = get("GARUDA_TREASURY_ADDR",
		"grd1qhaclxgx8xhzxjmwg8meuwp7k2ut53t0equ002s")

	// CORS allowed origins, comma-separated. Empty (default) keeps the
	// legacy permissive "*" behavior — but logs a warning.
	if origins := os.Getenv("GARUDA_ALLOWED_ORIGINS"); origins != "" {
		securityConfig.AllowedOrigins = strings.Split(origins, ",")
		for i := range securityConfig.AllowedOrigins {
			securityConfig.AllowedOrigins[i] = strings.TrimSpace(securityConfig.AllowedOrigins[i])
		}
	} else {
		securityConfig.usingDefaults["GARUDA_ALLOWED_ORIGINS"] = true
	}

	// Strict mode hides internal error details from clients and enforces
	// stricter validation. Recommended for any non-dev deployment.
	if os.Getenv("GARUDA_STRICT") == "1" {
		securityConfig.StrictMode = true
	}

	// Trust X-Forwarded-For only behind a reverse proxy.
	if os.Getenv("GARUDA_TRUST_PROXY") == "1" {
		securityConfig.TrustProxy = true
	}

	// Default bind: localhost-only. Operators must explicitly opt into
	// listening on all interfaces by setting GARUDA_BIND.
	securityConfig.BindAddr = get("GARUDA_BIND", "127.0.0.1")

	// Tamper-evident audit chain. If GARUDA_AUDIT_FILE is set, every
	// Audit() call appends one hash-chained JSON line to that file.
	// Missing / empty env var keeps the legacy stdout-only audit.
	if path := os.Getenv("GARUDA_AUDIT_FILE"); path != "" {
		if err := OpenAuditChain(path); err != nil {
			log.Printf("[SECURITY WARN] audit chain DISABLED: %v", err)
		} else {
			log.Printf("[security] tamper-evident audit chain open at %s", sanitizeLog(path)) // #nosec G706 -- sanitized
		}
	}

	// Per-tx maximum amount in GRD (sanity cap).
	if v := os.Getenv("GARUDA_MAX_TX_GRD"); v != "" {
		if f, err := strconv.ParseFloat(v, 64); err == nil && f > 0 {
			securityConfig.MaxAmountGRD = f
		}
	}

	// Audit print — never expose actual secrets.
	log.Printf("[security] config loaded strict=%v bind=%s allowed_origins=%d max_tx_grd=%g",
		securityConfig.StrictMode, securityConfig.BindAddr,
		len(securityConfig.AllowedOrigins), securityConfig.MaxAmountGRD)

	// Loud warnings for any value still on the legacy default. These appear
	// in stdout/stderr at startup so an operator running ./garudaapi will
	// see them immediately.
	insecureKeys := []string{
		"GARUDA_ADMIN_KEY",
		"GARUDA_RPC_PASS_CBDC",
		"GARUDA_RPC_PASS_PUBLIC",
		"GARUDA_RPC_PASS_CREATOR",
	}
	for _, k := range insecureKeys {
		if securityConfig.usingDefaults[k] {
			log.Printf("[SECURITY WARN] %s is using a hardcoded default. Set this env var before deploying to production.", k)
		}
	}
	if securityConfig.usingDefaults["GARUDA_ALLOWED_ORIGINS"] {
		log.Printf("[SECURITY WARN] GARUDA_ALLOWED_ORIGINS is unset; CORS will reflect any origin. Set GARUDA_ALLOWED_ORIGINS=https://your.app to restrict.")
	}
	if !securityConfig.StrictMode {
		log.Printf("[SECURITY WARN] strict mode disabled; internal error details will leak to clients. Set GARUDA_STRICT=1 in production.")
	}
}

// ─── Log sanitization ────────────────────────────────────────────────────────

// sanitizeLog removes newlines, carriage returns, and ASCII control
// characters from s so that a user-controlled value cannot inject fake
// log lines (CWE-117 / gosec G706). Returns the sanitized string.
// Safe to call on any string before passing it to log.Printf.
func sanitizeLog(s string) string {
	out := make([]byte, 0, len(s))
	for i := 0; i < len(s); i++ {
		c := s[i]
		if c < 0x20 || c == 0x7f {
			out = append(out, '_')
		} else {
			out = append(out, c)
		}
	}
	return string(out)
}

// ─── Authentication ──────────────────────────────────────────────────────────

// checkAdminKey is a constant-time comparison to prevent timing attacks.
// Returns false on empty input or mismatch.
func checkAdminKey(provided string) bool {
	if len(provided) == 0 {
		return false
	}
	securityConfig.RLock()
	expected := securityConfig.AdminKey
	securityConfig.RUnlock()
	// subtle.ConstantTimeCompare requires equal-length inputs
	a := []byte(provided)
	b := []byte(expected)
	if len(a) != len(b) {
		// Still do a comparison so timing doesn't differ
		_ = subtle.ConstantTimeCompare(b, b)
		return false
	}
	return subtle.ConstantTimeCompare(a, b) == 1
}

// requireAdmin checks the admin key + IP rate limit + replay protection.
// Returns true if the request is authorized. On failure it writes the
// response and the caller should return immediately.
//
// Replay protection reads X-Admin-Nonce and X-Admin-Timestamp headers.
// Strict mode requires them; permissive mode treats them as optional
// but still enforces uniqueness if present.
func requireAdmin(w http.ResponseWriter, r *http.Request, key string) bool {
	// Circuit breaker: if the audit chain has been failing to write,
	// reject admin operations with 503 so we never silently perform
	// privileged actions without a durable audit trail. Operator must
	// fix the audit backend and call ResetAuditBreaker() (or restart)
	// to clear the tripped flag.
	if IsAuditBreakerTripped() {
		writeJSONErrStatus(w, http.StatusServiceUnavailable,
			"admin operations frozen: audit log unavailable", nil)
		return false
	}
	ip := clientIP(r)
	if !adminRateLimit.Allow(ip) {
		IncMetric("rate_limited")
		writeJSONErrStatus(w, http.StatusTooManyRequests, "rate limit exceeded", nil)
		return false
	}
	// Replay protection: reject duplicate nonces and stale timestamps.
	// Headers are used instead of JSON body fields so no request schema
	// has to change per endpoint.
	securityConfig.RLock()
	strict := securityConfig.StrictMode
	securityConfig.RUnlock()
	nonce := r.Header.Get("X-Admin-Nonce")
	tsStr := r.Header.Get("X-Admin-Timestamp")
	var tsUnix int64
	if tsStr != "" {
		if v, err := strconv.ParseInt(tsStr, 10, 64); err == nil {
			tsUnix = v
		}
	}
	if err := CheckAdminReplay(nonce, tsUnix, strict); err != nil {
		Audit(AuditEvent{
			Event:  "admin_replay",
			IP:     ip,
			Path:   r.URL.Path,
			Result: "fail",
			Meta:   map[string]interface{}{"reason": err.Error()},
		})
		writeJSONErrStatus(w, http.StatusBadRequest, "replay check failed", err)
		return false
	}
	// HMAC request signature — verifies the full request (method, path,
	// nonce, timestamp, body sha256) is signed with the admin key.
	// Mandatory in strict/HMAC mode, optional-but-enforced otherwise.
	if err := VerifyAdminSig(r, adminHMACRequired()); err != nil {
		Audit(AuditEvent{
			Event:  "admin_sig",
			IP:     ip,
			Path:   r.URL.Path,
			Result: "fail",
			Meta:   map[string]interface{}{"reason": err.Error()},
		})
		writeJSONErrStatus(w, http.StatusUnauthorized, "request signature invalid", err)
		return false
	}
	if !checkAdminKey(key) {
		log.Printf("[security] failed admin auth from %s key_len=%d", sanitizeLog(ip), len(key)) // #nosec G706 -- sanitized
		Audit(AuditEvent{
			Event:  "admin_auth",
			IP:     ip,
			Path:   r.URL.Path,
			Result: "fail",
			Meta:   map[string]interface{}{"key_len": len(key)},
		})
		writeJSONErrStatus(w, http.StatusUnauthorized, "unauthorized", nil)
		return false
	}
	Audit(AuditEvent{
		Event:  "admin_auth",
		IP:     ip,
		Path:   r.URL.Path,
		Result: "ok",
	})
	return true
}

// requireAdminDiagnostic is a lightweight auth check for read-only diagnostic
// endpoints (e.g. /api/admin/health). It validates the admin key and applies
// the IP rate limit but intentionally SKIPS the audit circuit-breaker gate and
// the HMAC/replay checks. This allows operators to query the health endpoint
// even when the breaker is tripped — which is exactly when they need it most.
func requireAdminDiagnostic(w http.ResponseWriter, r *http.Request, key string) bool {
	ip := clientIP(r)
	if !adminRateLimit.Allow(ip) {
		IncMetric("rate_limited")
		writeJSONErrStatus(w, http.StatusTooManyRequests, "rate limit exceeded", nil)
		return false
	}
	if !checkAdminKey(key) {
		log.Printf("[security] failed admin auth from %s key_len=%d", sanitizeLog(ip), len(key)) // #nosec G706 -- sanitized
		Audit(AuditEvent{
			Event:  "admin_auth",
			IP:     ip,
			Path:   r.URL.Path,
			Result: "fail",
			Meta:   map[string]interface{}{"key_len": len(key)},
		})
		writeJSONErrStatus(w, http.StatusUnauthorized, "unauthorized", nil)
		return false
	}
	Audit(AuditEvent{
		Event:  "admin_auth",
		IP:     ip,
		Path:   r.URL.Path,
		Result: "ok",
	})
	return true
}

// ─── Input validation ────────────────────────────────────────────────────────

// Bech32 character set used by Garudachain addresses.
const bech32CharsetRe = "[qpzry9x8gf2tvdw0s3jn54khce6mua7l]"

var (
	validHexIDRe  = regexp.MustCompile(`^[0-9a-fA-F]{64}$`)
	validAddrRe   = regexp.MustCompile(`^grd1` + bech32CharsetRe + `{20,90}$`)
	validSymbolRe = regexp.MustCompile(`^[A-Za-z][A-Za-z0-9]{0,11}$`)
)

// ValidAssetID returns nil if assetID is a 32-byte hex string (the canonical
// form for asset IDs and tx hashes).
func ValidAssetID(s string) error {
	if !validHexIDRe.MatchString(s) {
		return errors.New("asset_id must be 64 hex characters")
	}
	return nil
}

// ValidAddress returns nil if addr looks like a Garudachain bech32 address.
func ValidAddress(s string) error {
	if !validAddrRe.MatchString(s) {
		return errors.New("invalid address format")
	}
	return nil
}

// ValidSymbol returns nil if symbol is alphanumeric, 1-12 chars.
func ValidSymbol(s string) error {
	if !validSymbolRe.MatchString(s) {
		return errors.New("invalid symbol format")
	}
	return nil
}

// ValidAmount checks that amount is finite, positive, within bounds. The
// maxAllowed parameter overrides the global cap if non-zero.
func ValidAmount(amount float64, maxAllowed float64) error {
	if math.IsNaN(amount) || math.IsInf(amount, 0) {
		return errors.New("amount must be a finite number")
	}
	if amount <= 0 {
		return errors.New("amount must be positive")
	}
	limit := maxAllowed
	if limit == 0 {
		securityConfig.RLock()
		limit = securityConfig.MaxAmountGRD
		securityConfig.RUnlock()
	}
	if amount > limit {
		return fmt.Errorf("amount exceeds maximum allowed (%g)", limit)
	}
	// Reject sub-satoshi precision that would round to zero in int64
	// after multiplication by 1e8.
	if amount < 1e-10 {
		return errors.New("amount too small")
	}
	return nil
}

// SafePathSegment returns the last URL path segment, rejecting traversal,
// dots, and other suspicious characters. Use this in place of
// strings.Split(r.URL.Path, "/") + indexing.
func SafePathSegment(path string) (string, error) {
	parts := strings.Split(path, "/")
	if len(parts) == 0 {
		return "", errors.New("empty path")
	}
	// Reject traversal anywhere in the path. Even though we only return the
	// last segment, downstream code may re-join — catch attempts like
	// "/api/x/../etc/passwd" here.
	for _, p := range parts {
		if p == ".." || p == "." {
			return "", errors.New("path traversal detected")
		}
	}
	last := parts[len(parts)-1]
	if last == "" {
		return "", errors.New("empty path segment")
	}
	if strings.ContainsAny(last, "./\\:?#%") {
		return "", errors.New("invalid characters in path segment")
	}
	if len(last) > 128 {
		return "", errors.New("path segment too long")
	}
	return last, nil
}

// ─── Safe map accessors ─────────────────────────────────────────────────────

// SafeMapInt64 extracts an int64 from a map[string]interface{} with safe
// type fallback. Returns 0 on missing key, wrong type, NaN/Inf, or
// out-of-range values. Use this in sort comparators where a panic would
// crash the API process.
func SafeMapInt64(m map[string]interface{}, key string) int64 {
	v, ok := m[key]
	if !ok {
		return 0
	}
	switch x := v.(type) {
	case int64:
		return x
	case int:
		return int64(x)
	case float64:
		if math.IsNaN(x) || math.IsInf(x, 0) {
			return 0
		}
		if x > float64(math.MaxInt64) || x < float64(math.MinInt64) {
			return 0
		}
		return int64(x)
	case json.Number:
		i, err := x.Int64()
		if err == nil {
			return i
		}
	}
	return 0
}

// SafeMapFloat64 extracts a float64 with NaN/Inf protection.
func SafeMapFloat64(m map[string]interface{}, key string) float64 {
	v, ok := m[key]
	if !ok {
		return 0
	}
	if f, ok := v.(float64); ok {
		if math.IsNaN(f) || math.IsInf(f, 0) {
			return 0
		}
		return f
	}
	if n, ok := v.(json.Number); ok {
		f, err := n.Float64()
		if err == nil && !math.IsNaN(f) && !math.IsInf(f, 0) {
			return f
		}
	}
	return 0
}

// SafeMapString extracts a string with empty fallback.
func SafeMapString(m map[string]interface{}, key string) string {
	v, ok := m[key]
	if !ok {
		return ""
	}
	if s, ok := v.(string); ok {
		return s
	}
	return ""
}

// ─── Error responses ─────────────────────────────────────────────────────────

// writeJSONErrStatus writes an error with an explicit HTTP status code. In
// strict mode the internal error is not exposed. This is the primary helper;
// writeJSONErr is a convenience wrapper that defaults to 400 Bad Request.
func writeJSONErrStatus(w http.ResponseWriter, status int, message string, internal error) {
	w.Header().Set("Content-Type", "application/json")
	if internal != nil {
		log.Printf("[err] %s: %v", message, internal)
	}
	securityConfig.RLock()
	strict := securityConfig.StrictMode
	securityConfig.RUnlock()
	w.WriteHeader(status)
	resp := map[string]interface{}{"error": message}
	if !strict && internal != nil {
		resp["detail"] = internal.Error()
	}
	_ = json.NewEncoder(w).Encode(resp)
}

// writeJSONErr writes a 400 Bad Request with a JSON error body. Most input
// validation errors should use this. For auth/rate-limit paths, call
// writeJSONErrStatus explicitly with 401/403/429.
func writeJSONErr(w http.ResponseWriter, message string, internal error) {
	writeJSONErrStatus(w, http.StatusBadRequest, message, internal)
}

// ─── CORS allowlist ──────────────────────────────────────────────────────────

// allowedOriginFor returns the origin to set in Access-Control-Allow-Origin
// for a given request. Returns "*" if no allowlist is configured (legacy
// permissive mode), the matched origin if it's in the allowlist, or empty
// string if the origin is not allowed.
func allowedOriginFor(reqOrigin string) string {
	securityConfig.RLock()
	allowed := securityConfig.AllowedOrigins
	securityConfig.RUnlock()

	// No allowlist set → legacy permissive (warned at startup).
	if len(allowed) == 0 {
		return "*"
	}

	for _, o := range allowed {
		if o == "*" {
			return "*"
		}
		if o == reqOrigin {
			return o
		}
	}
	return ""
}

// secureCORSMiddleware applies the configured allowlist to incoming requests.
// Replaces the legacy corsMiddleware which always set "*".
// securityHeaders is the complete set of defensive response headers
// applied to every request. They are set in secureCORSMiddleware so
// they appear even on 4xx/5xx responses generated before the handler
// runs.
//
// Content-Security-Policy: restrictive default — only same-origin
// scripts and styles, no inline execution, no eval. The API serves
// no HTML that requires loosening, so this is safe to lock down.
//
// Strict-Transport-Security: sent unconditionally so browsers
// learn the HSTS policy the first time they see any response; the
// browser will upgrade to HTTPS once it has seen this header on the
// TLS endpoint. max-age=63072000 = 2 years.
//
// Permissions-Policy: disable all browser features the API does
// not use (geolocation, camera, microphone, payment, USB, etc).
//
// X-Permitted-Cross-Domain-Policies: none — prevents Flash and
// Acrobat readers from loading cross-domain content via the API.
func secureCORSMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		origin := r.Header.Get("Origin")
		if allowed := allowedOriginFor(origin); allowed != "" {
			w.Header().Set("Access-Control-Allow-Origin", allowed)
			w.Header().Set("Vary", "Origin")
		}
		w.Header().Set("Access-Control-Allow-Methods", "GET,POST,DELETE,OPTIONS")
		// Include all admin-related headers so browsers don't block
		// preflight for admin requests sent from a web front-end.
		w.Header().Set("Access-Control-Allow-Headers",
			"Content-Type, X-Admin-Key, X-Admin-Nonce, X-Admin-Timestamp, X-Admin-Sig")

		// ── Security headers ─────────────────────────────────────────────
		w.Header().Set("X-Content-Type-Options", "nosniff")
		w.Header().Set("X-Frame-Options", "DENY")
		w.Header().Set("X-Permitted-Cross-Domain-Policies", "none")
		w.Header().Set("Referrer-Policy", "no-referrer")
		w.Header().Set("Content-Security-Policy",
			"default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'")
		w.Header().Set("Permissions-Policy",
			"geolocation=(), camera=(), microphone=(), payment=(), usb=(), interest-cohort=()")
		// HSTS: tell browsers to upgrade all connections to HTTPS for
		// the next 2 years. Safe to send over HTTP too — browsers only
		// act on it when received over a verified TLS connection.
		w.Header().Set("Strict-Transport-Security",
			"max-age=63072000; includeSubDomains; preload")

		if r.Method == "OPTIONS" {
			w.WriteHeader(204)
			return
		}
		next.ServeHTTP(w, r)
	})
}

// ─── Rate limiting ───────────────────────────────────────────────────────────

// rateLimiter is a simple in-memory sliding-window limiter keyed by string
// (typically client IP or address). Not distributed — fine for a single API
// process. For multi-instance deployment, replace with Redis-backed limiter.
type rateLimiter struct {
	mu     sync.Mutex
	hits   map[string][]time.Time
	limit  int
	window time.Duration
}

func newRateLimiter(limit int, window time.Duration) *rateLimiter {
	return &rateLimiter{
		hits:   make(map[string][]time.Time),
		limit:  limit,
		window: window,
	}
}

// Allow returns true if the request should be allowed. The window slides:
// hits older than window are discarded each call.
func (rl *rateLimiter) Allow(key string) bool {
	rl.mu.Lock()
	defer rl.mu.Unlock()
	now := time.Now()
	cutoff := now.Add(-rl.window)
	hits := rl.hits[key]
	fresh := hits[:0]
	for _, t := range hits {
		if t.After(cutoff) {
			fresh = append(fresh, t)
		}
	}
	if len(fresh) >= rl.limit {
		rl.hits[key] = fresh
		return false
	}
	fresh = append(fresh, now)
	rl.hits[key] = fresh
	// Periodic GC: if the map grows too large, prune empty entries.
	if len(rl.hits) > 10000 {
		for k, v := range rl.hits {
			if len(v) == 0 {
				delete(rl.hits, k)
			}
		}
	}
	return true
}

// Default limiters used across the API.
var (
	adminRateLimit = newRateLimiter(20, 1*time.Minute) // 20 admin ops/min/IP
	swapRateLimit  = newRateLimiter(60, 1*time.Minute) // 60 swap/min/IP
	mintRateLimit  = newRateLimiter(5, 1*time.Minute)  // 5 mint/min/IP
)

// ─── Body size limiter ──────────────────────────────────────────────────────

// MaxBodyBytes is the hard cap for a single request body. POSTs larger than
// this are rejected before any handler sees them. 1 MiB is generous for the
// JSON payloads this API uses; raise via env if a specific endpoint needs
// more.
const MaxBodyBytes int64 = 1 << 20

// limitBodyMiddleware wraps r.Body with http.MaxBytesReader on POST/PUT/
// PATCH/DELETE requests. GETs and OPTIONS are unaffected. This is applied
// once at the mux level so every existing handler inherits the cap without
// per-handler edits.
func limitBodyMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch r.Method {
		case http.MethodPost, http.MethodPut, http.MethodPatch, http.MethodDelete:
			r.Body = http.MaxBytesReader(w, r.Body, MaxBodyBytes)
		}
		next.ServeHTTP(w, r)
	})
}

// ─── Structured audit log ───────────────────────────────────────────────────

// AuditEvent is one line in the audit trail. Serialized as JSON so it is
// grep-able and ingestable by log aggregators without a parser.
type AuditEvent struct {
	Time   string                 `json:"time"`
	Event  string                 `json:"event"`
	IP     string                 `json:"ip"`
	Path   string                 `json:"path"`
	Actor  string                 `json:"actor,omitempty"`
	Result string                 `json:"result"`
	Meta   map[string]interface{} `json:"meta,omitempty"`
}

var auditMu sync.Mutex

// Audit writes a structured JSON line to stderr via log.Printf. The line is
// prefixed with "[audit]" so operators can filter for it. Never blocks on
// I/O errors — audit must never take down the API.
func Audit(event AuditEvent) {
	if event.Time == "" {
		event.Time = time.Now().UTC().Format(time.RFC3339Nano)
	}
	auditMu.Lock()
	defer auditMu.Unlock()
	b, err := json.Marshal(event)
	if err != nil {
		log.Printf("[audit-err] marshal failed: %v", err)
		return
	}
	log.Printf("[audit] %s", string(b))
	appendAuditChain(event)
	IncMetric("audit")
	if event.Event == "admin_auth" {
		if event.Result == "ok" {
			IncMetric("admin_auth_ok")
		} else {
			IncMetric("admin_auth_fail")
		}
	}
}

// AuditRequest is a convenience wrapper for the common case.
func AuditRequest(r *http.Request, event, result string, meta map[string]interface{}) {
	Audit(AuditEvent{
		Event:  event,
		IP:     clientIP(r),
		Path:   r.URL.Path,
		Result: result,
		Meta:   meta,
	})
}

// ─── Metrics (Prometheus text format) ───────────────────────────────────────

// metricsT holds in-memory counters that handleMetrics exposes at /api/metrics
// in Prometheus text format. Counters only grow; gauges can be updated.
// Concurrency is handled with sync/atomic where possible, fallback mutex for
// map mutations.
type metricsT struct {
	mu                  sync.Mutex
	RequestsTotal       map[string]int64 // key = method+" "+path
	StatusTotal         map[int]int64
	RateLimitedTotal    int64
	AdminAuthFailTotal  int64
	AdminAuthOkTotal    int64
	MintTotal           int64
	BurnTotal           int64
	IssueTotal          int64
	SwapTotal           int64
	OrderTotal          int64
	AuditEventsTotal    int64
	StartedAt           time.Time
}

var metrics = &metricsT{
	RequestsTotal: make(map[string]int64),
	StatusTotal:   make(map[int]int64),
	StartedAt:     time.Now(),
}

// statusRecorder wraps http.ResponseWriter to capture the status code so
// metricsMiddleware can bucket by response code.
type statusRecorder struct {
	http.ResponseWriter
	status int
}

func (s *statusRecorder) WriteHeader(code int) {
	s.status = code
	s.ResponseWriter.WriteHeader(code)
}

// metricsMiddleware increments a counter per request. Keyed by a compact
// route label (method + first two path segments) to avoid cardinality blowup
// from id-bearing paths like /api/blockchain/transactions/<txid>.
func metricsMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		sr := &statusRecorder{ResponseWriter: w, status: 200}
		next.ServeHTTP(sr, r)
		metrics.mu.Lock()
		metrics.RequestsTotal[r.Method+" "+routeLabel(r.URL.Path)]++
		metrics.StatusTotal[sr.status]++
		metrics.mu.Unlock()
	})
}

// routeLabel collapses an incoming path to a stable low-cardinality label.
// `/api/blockchain/transactions/abc123` → `/api/blockchain/transactions`.
// Keeps Prometheus scrape size bounded.
func routeLabel(p string) string {
	parts := strings.SplitN(strings.TrimPrefix(p, "/"), "/", 4)
	if len(parts) >= 3 {
		return "/" + parts[0] + "/" + parts[1] + "/" + parts[2]
	}
	if len(parts) == 2 {
		return "/" + parts[0] + "/" + parts[1]
	}
	return p
}

// IncMetric bumps a named counter. Used by handlers and helpers to expose
// domain events (mint, burn, swap, audit). Unknown names are ignored rather
// than causing a panic so adding a new event name is safe.
func IncMetric(name string) {
	metrics.mu.Lock()
	defer metrics.mu.Unlock()
	switch name {
	case "mint":
		metrics.MintTotal++
	case "burn":
		metrics.BurnTotal++
	case "issue":
		metrics.IssueTotal++
	case "swap":
		metrics.SwapTotal++
	case "order":
		metrics.OrderTotal++
	case "rate_limited":
		metrics.RateLimitedTotal++
	case "admin_auth_fail":
		metrics.AdminAuthFailTotal++
	case "admin_auth_ok":
		metrics.AdminAuthOkTotal++
	case "audit":
		metrics.AuditEventsTotal++
	}
}

// handleMetrics serves Prometheus text format. No admin gate — metrics are
// intentionally low-sensitivity so a scraper can poll without a credential.
// If you need to hide them, put nginx basic-auth in front of /api/metrics.
func handleMetrics(w http.ResponseWriter, r *http.Request) {
	metrics.mu.Lock()
	defer metrics.mu.Unlock()

	w.Header().Set("Content-Type", "text/plain; version=0.0.4; charset=utf-8")

	fmt.Fprintf(w, "# HELP garuda_uptime_seconds Seconds since API start\n")
	fmt.Fprintf(w, "# TYPE garuda_uptime_seconds gauge\n")
	fmt.Fprintf(w, "garuda_uptime_seconds %d\n", int64(time.Since(metrics.StartedAt).Seconds()))

	fmt.Fprintf(w, "# HELP garuda_requests_total Total requests per route\n")
	fmt.Fprintf(w, "# TYPE garuda_requests_total counter\n")
	for k, v := range metrics.RequestsTotal {
		bits := strings.SplitN(k, " ", 2)
		if len(bits) == 2 {
			fmt.Fprintf(w, "garuda_requests_total{method=%q,route=%q} %d\n", bits[0], bits[1], v)
		}
	}

	fmt.Fprintf(w, "# HELP garuda_responses_total Total responses by status code\n")
	fmt.Fprintf(w, "# TYPE garuda_responses_total counter\n")
	for code, v := range metrics.StatusTotal {
		fmt.Fprintf(w, "garuda_responses_total{code=\"%d\"} %d\n", code, v)
	}

	fmt.Fprintf(w, "# HELP garuda_admin_auth_fail_total Admin key rejections\n")
	fmt.Fprintf(w, "# TYPE garuda_admin_auth_fail_total counter\n")
	fmt.Fprintf(w, "garuda_admin_auth_fail_total %d\n", metrics.AdminAuthFailTotal)

	fmt.Fprintf(w, "# HELP garuda_admin_auth_ok_total Successful admin auth\n")
	fmt.Fprintf(w, "# TYPE garuda_admin_auth_ok_total counter\n")
	fmt.Fprintf(w, "garuda_admin_auth_ok_total %d\n", metrics.AdminAuthOkTotal)

	fmt.Fprintf(w, "# HELP garuda_rate_limited_total Requests rejected by rate limit\n")
	fmt.Fprintf(w, "# TYPE garuda_rate_limited_total counter\n")
	fmt.Fprintf(w, "garuda_rate_limited_total %d\n", metrics.RateLimitedTotal)

	fmt.Fprintf(w, "# HELP garuda_cbdc_mint_total CBDC mint operations\n")
	fmt.Fprintf(w, "# TYPE garuda_cbdc_mint_total counter\n")
	fmt.Fprintf(w, "garuda_cbdc_mint_total %d\n", metrics.MintTotal)

	fmt.Fprintf(w, "# HELP garuda_cbdc_burn_total CBDC burn operations\n")
	fmt.Fprintf(w, "# TYPE garuda_cbdc_burn_total counter\n")
	fmt.Fprintf(w, "garuda_cbdc_burn_total %d\n", metrics.BurnTotal)

	fmt.Fprintf(w, "# HELP garuda_cbdc_issue_total CBDC token issuance\n")
	fmt.Fprintf(w, "# TYPE garuda_cbdc_issue_total counter\n")
	fmt.Fprintf(w, "garuda_cbdc_issue_total %d\n", metrics.IssueTotal)

	fmt.Fprintf(w, "# HELP garuda_dex_swap_total DEX swap executions\n")
	fmt.Fprintf(w, "# TYPE garuda_dex_swap_total counter\n")
	fmt.Fprintf(w, "garuda_dex_swap_total %d\n", metrics.SwapTotal)

	fmt.Fprintf(w, "# HELP garuda_dex_order_total DEX orders placed\n")
	fmt.Fprintf(w, "# TYPE garuda_dex_order_total counter\n")
	fmt.Fprintf(w, "garuda_dex_order_total %d\n", metrics.OrderTotal)

	fmt.Fprintf(w, "# HELP garuda_audit_events_total Audit log entries written\n")
	fmt.Fprintf(w, "# TYPE garuda_audit_events_total counter\n")
	fmt.Fprintf(w, "garuda_audit_events_total %d\n", metrics.AuditEventsTotal)

	// Audit chain state (read outside metrics.mu — separate lock)
	metrics.mu.Unlock()
	auditChain.mu.Lock()
	chainSeq := auditChain.seq
	breakerVal := int64(0)
	if auditChain.breakerTripped {
		breakerVal = 1
	}
	auditChain.mu.Unlock()
	ws := GetWitnessStatus()
	metrics.mu.Lock()

	fmt.Fprintf(w, "# HELP garuda_audit_chain_length Current audit chain sequence number\n")
	fmt.Fprintf(w, "# TYPE garuda_audit_chain_length gauge\n")
	fmt.Fprintf(w, "garuda_audit_chain_length %d\n", chainSeq)

	fmt.Fprintf(w, "# HELP garuda_audit_chain_breaker_tripped 1 if the audit circuit breaker is tripped\n")
	fmt.Fprintf(w, "# TYPE garuda_audit_chain_breaker_tripped gauge\n")
	fmt.Fprintf(w, "garuda_audit_chain_breaker_tripped %d\n", breakerVal)

	fmt.Fprintf(w, "# HELP garuda_witness_last_seq Last audit chain seq committed to GarudaChain\n")
	fmt.Fprintf(w, "# TYPE garuda_witness_last_seq gauge\n")
	fmt.Fprintf(w, "garuda_witness_last_seq %d\n", ws.LastSeq)

	fmt.Fprintf(w, "# HELP garuda_witness_commits_total Total successful audit witness commits\n")
	fmt.Fprintf(w, "# TYPE garuda_witness_commits_total counter\n")
	fmt.Fprintf(w, "garuda_witness_commits_total %d\n", ws.CommitsTotal)

	fmt.Fprintf(w, "# HELP garuda_witness_failures_total Total failed audit witness commits\n")
	fmt.Fprintf(w, "# TYPE garuda_witness_failures_total counter\n")
	fmt.Fprintf(w, "garuda_witness_failures_total %d\n", ws.FailuresTotal)
}

// clientIP returns the request's client IP, optionally honoring
// X-Forwarded-For if GARUDA_TRUST_PROXY=1.
func clientIP(r *http.Request) string {
	securityConfig.RLock()
	trustProxy := securityConfig.TrustProxy
	securityConfig.RUnlock()
	if trustProxy {
		if xff := r.Header.Get("X-Forwarded-For"); xff != "" {
			parts := strings.Split(xff, ",")
			return strings.TrimSpace(parts[0])
		}
	}
	addr := r.RemoteAddr
	if i := strings.LastIndex(addr, ":"); i > 0 {
		return addr[:i]
	}
	return addr
}
