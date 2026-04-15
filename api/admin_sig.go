// admin_sig.go — HMAC-SHA256 request signing for admin endpoints.
//
// When GARUDA_ADMIN_HMAC=1, every admin request must carry:
//
//	X-Admin-Sig: hmac-sha256:<lowercase hex>
//
// The signature is HMAC-SHA256 of the following canonical string,
// keyed on the admin key:
//
//	METHOD + "\n" +
//	PATH   + "\n" +
//	NONCE  + "\n" +
//	TIMESTAMP_STR + "\n" +
//	hex(sha256(request_body)) + "\n"
//
// where METHOD, PATH, NONCE, and TIMESTAMP_STR are the exact values
// the server reads from the request (method, URL path, X-Admin-Nonce,
// X-Admin-Timestamp). Body is SHA256-hashed so large payloads can
// be signed efficiently; the canonical form uses the hex digest.
//
// This construction:
//   - Binds the signature to the nonce + timestamp already enforced
//     by the replay guard, defeating replays even across key rotations.
//   - Covers the full request body, so an active MITM who can modify
//     the body but not derive the HMAC key cannot forge a valid request.
//   - Does NOT sign headers other than the four named above — adding
//     more header coverage increases client complexity with no practical
//     security benefit under TLS.
//
// In permissive mode (GARUDA_ADMIN_HMAC unset, strict=false):
//   - If X-Admin-Sig is absent: skip the check (legacy compat).
//   - If X-Admin-Sig is present: verify it — clients that opt in are
//     fully checked.
//
// In strict mode (GARUDA_STRICT=1 or GARUDA_ADMIN_HMAC=1):
//   - X-Admin-Sig is mandatory; absent header is an error.
//
// The request body is buffered (limited by limitBodyMiddleware) so the
// handler can still read it after signature verification. The buffer is
// replaced as r.Body = io.NopCloser(bytes.NewReader(buf)).

package main

import (
	"bytes"
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"fmt"
	"io"
	"net/http"
	"os"
	"strings"
)

const adminSigHeader = "X-Admin-Sig"
const adminSigPrefix = "hmac-sha256:"

// VerifyAdminSig checks the X-Admin-Sig header against a freshly
// computed HMAC-SHA256 of the canonical request string. It also
// buffers the request body so the downstream handler can still read it.
//
// sigRequired: true means an absent header is an error (strict/HMAC
// mode). false means absent is OK; present must be valid.
//
// On success the function replaces r.Body with a fresh reader over
// the buffered bytes. Returns nil on success or skip (absent + not
// required); returns a non-nil error that is safe for a 400 response
// on any failure.
func VerifyAdminSig(r *http.Request, sigRequired bool) error {
	// Buffer the body regardless — we need it either for hashing or to
	// hand back to the handler. Body may be nil for GET requests.
	var bodyBuf []byte
	if r.Body != nil {
		var err error
		bodyBuf, err = io.ReadAll(r.Body)
		_ = r.Body.Close()
		if err != nil {
			return fmt.Errorf("reading request body for sig: %w", err)
		}
		r.Body = io.NopCloser(bytes.NewReader(bodyBuf))
	}

	raw := r.Header.Get(adminSigHeader)
	if raw == "" {
		if sigRequired {
			return fmt.Errorf("missing %s header (required in this mode)", adminSigHeader)
		}
		// Not required and not present: skip check entirely.
		return nil
	}

	if !strings.HasPrefix(raw, adminSigPrefix) {
		return fmt.Errorf("%s must start with %q", adminSigHeader, adminSigPrefix)
	}
	providedHex := strings.TrimPrefix(raw, adminSigPrefix)
	providedBytes, err := hex.DecodeString(providedHex)
	if err != nil {
		return fmt.Errorf("%s: not valid hex: %w", adminSigHeader, err)
	}

	canonical := buildAdminSigCanonical(r, bodyBuf)

	securityConfig.RLock()
	key := securityConfig.AdminKey
	securityConfig.RUnlock()

	mac := hmac.New(sha256.New, []byte(key))
	mac.Write([]byte(canonical))
	expected := mac.Sum(nil)

	if !hmac.Equal(providedBytes, expected) {
		return fmt.Errorf("admin request signature mismatch")
	}
	return nil
}

// buildAdminSigCanonical assembles the canonical string for signing.
// Exported so clients and tests can reproduce it without importing
// internal packages.
func buildAdminSigCanonical(r *http.Request, body []byte) string {
	bodyHash := sha256.Sum256(body)
	bodyHex := hex.EncodeToString(bodyHash[:])
	nonce := r.Header.Get("X-Admin-Nonce")
	ts := r.Header.Get("X-Admin-Timestamp")
	return strings.Join([]string{
		r.Method,
		r.URL.Path,
		nonce,
		ts,
		bodyHex,
		"", // trailing newline via Join separator
	}, "\n")
}

// ComputeAdminSig computes the X-Admin-Sig header value for a given
// body and admin key. Used by CLI clients, integration tests, and the
// key-rotation test helper.
func ComputeAdminSig(method, path, nonce, timestamp, adminKey string, body []byte) string {
	bodyHash := sha256.Sum256(body)
	bodyHex := hex.EncodeToString(bodyHash[:])
	canonical := strings.Join([]string{
		method,
		path,
		nonce,
		timestamp,
		bodyHex,
		"",
	}, "\n")
	mac := hmac.New(sha256.New, []byte(adminKey))
	mac.Write([]byte(canonical))
	return adminSigPrefix + hex.EncodeToString(mac.Sum(nil))
}

// adminHMACRequired returns true if admin request signing is enforced.
// True when GARUDA_ADMIN_HMAC=1 or GARUDA_STRICT=1.
func adminHMACRequired() bool {
	if strings.EqualFold(strings.TrimSpace(os.Getenv("GARUDA_ADMIN_HMAC")), "1") {
		return true
	}
	securityConfig.RLock()
	strict := securityConfig.StrictMode
	securityConfig.RUnlock()
	return strict
}
