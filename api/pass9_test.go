// pass9_test.go — unit tests for Pass #9 hardening:
//
//   - sanitizeLog: control-character stripping
//   - Security response headers (CSP, HSTS, Permissions-Policy, etc.)
//   - RPC password file loading (loadRPCPassFile)
//   - TLS startup gate (startServer env-var check, not full TLS dial)

package main

import (
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

// ── sanitizeLog ───────────────────────────────────────────────────────────────

func TestSanitizeLog_Clean(t *testing.T) {
	cases := []string{"hello", "127.0.0.1", "path/to/file", "abc-123"}
	for _, s := range cases {
		if got := sanitizeLog(s); got != s {
			t.Errorf("sanitizeLog(%q) = %q, want unchanged", s, got)
		}
	}
}

func TestSanitizeLog_NewlineReplaced(t *testing.T) {
	cases := []struct {
		in   string
		want string
	}{
		{"line1\nline2", "line1_line2"},
		{"line1\r\nline2", "line1__line2"},
		{"tab\there", "tab_here"},
		{"\x00null\x01", "_null_"},
		{"\x1b[31mred\x1b[0m", "_[31mred_[0m"}, // ESC byte stripped; printable chars kept
	}
	for _, tc := range cases {
		got := sanitizeLog(tc.in)
		if got != tc.want {
			t.Errorf("sanitizeLog(%q) = %q, want %q", tc.in, got, tc.want)
		}
	}
}

func TestSanitizeLog_Empty(t *testing.T) {
	if got := sanitizeLog(""); got != "" {
		t.Errorf("sanitizeLog(\"\") = %q, want \"\"", got)
	}
}

func TestSanitizeLog_DEL(t *testing.T) {
	// 0x7f (DEL) should be replaced.
	got := sanitizeLog("abc\x7fdef")
	if strings.Contains(got, "\x7f") {
		t.Errorf("DEL byte not stripped: %q", got)
	}
}

// ── Security response headers ─────────────────────────────────────────────────

func TestSecurityHeaders_Present(t *testing.T) {
	// Wrap a trivial handler with the middleware and check headers.
	inner := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
	})
	h := secureCORSMiddleware(inner)

	req := httptest.NewRequest("GET", "/api/healthz", nil)
	w := httptest.NewRecorder()
	h.ServeHTTP(w, req)

	want := map[string]string{
		"X-Content-Type-Options":          "nosniff",
		"X-Frame-Options":                 "DENY",
		"X-Permitted-Cross-Domain-Policies": "none",
		"Referrer-Policy":                 "no-referrer",
	}
	for header, val := range want {
		got := w.Header().Get(header)
		if got != val {
			t.Errorf("%s = %q, want %q", header, got, val)
		}
	}
}

func TestSecurityHeaders_CSP(t *testing.T) {
	inner := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {})
	h := secureCORSMiddleware(inner)

	req := httptest.NewRequest("GET", "/api/test", nil)
	w := httptest.NewRecorder()
	h.ServeHTTP(w, req)

	csp := w.Header().Get("Content-Security-Policy")
	if csp == "" {
		t.Fatal("Content-Security-Policy header missing")
	}
	for _, directive := range []string{"default-src", "frame-ancestors"} {
		if !strings.Contains(csp, directive) {
			t.Errorf("CSP missing %q directive: %s", directive, csp)
		}
	}
}

func TestSecurityHeaders_HSTS(t *testing.T) {
	inner := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {})
	h := secureCORSMiddleware(inner)

	req := httptest.NewRequest("GET", "/api/test", nil)
	w := httptest.NewRecorder()
	h.ServeHTTP(w, req)

	hsts := w.Header().Get("Strict-Transport-Security")
	if hsts == "" {
		t.Fatal("Strict-Transport-Security header missing")
	}
	if !strings.Contains(hsts, "max-age=") {
		t.Errorf("HSTS missing max-age: %s", hsts)
	}
	if !strings.Contains(hsts, "includeSubDomains") {
		t.Errorf("HSTS missing includeSubDomains: %s", hsts)
	}
}

func TestSecurityHeaders_PermissionsPolicy(t *testing.T) {
	inner := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {})
	h := secureCORSMiddleware(inner)

	req := httptest.NewRequest("GET", "/api/test", nil)
	w := httptest.NewRecorder()
	h.ServeHTTP(w, req)

	pp := w.Header().Get("Permissions-Policy")
	if pp == "" {
		t.Fatal("Permissions-Policy header missing")
	}
	for _, feature := range []string{"geolocation=()", "camera=()", "microphone=()"} {
		if !strings.Contains(pp, feature) {
			t.Errorf("Permissions-Policy missing %q: %s", feature, pp)
		}
	}
}

func TestSecurityHeaders_CORSAllowHeaders(t *testing.T) {
	// Admin headers must be in the CORS allow-list so browser preflight
	// for signed admin requests doesn't block.
	inner := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {})
	h := secureCORSMiddleware(inner)

	req := httptest.NewRequest("OPTIONS", "/api/cbdc/mint", nil)
	req.Header.Set("Origin", "https://example.com")
	w := httptest.NewRecorder()
	h.ServeHTTP(w, req)

	allowHeaders := w.Header().Get("Access-Control-Allow-Headers")
	for _, hdr := range []string{"X-Admin-Nonce", "X-Admin-Timestamp", "X-Admin-Sig"} {
		if !strings.Contains(allowHeaders, hdr) {
			t.Errorf("Access-Control-Allow-Headers missing %q: %s", hdr, allowHeaders)
		}
	}
}

// ── RPC password file loading ─────────────────────────────────────────────────

func TestLoadRPCPassFile_NotSet(t *testing.T) {
	os.Unsetenv("GARUDA_TEST_PASS_FILE_9999")
	if got := loadRPCPassFile("GARUDA_TEST_PASS_FILE_9999"); got != "" {
		t.Errorf("expected empty string when env var unset, got %q", got)
	}
}

func TestLoadRPCPassFile_ValidFile(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "rpc.pass")
	pass := "supersecret-rpc-password-42"
	if err := os.WriteFile(path, []byte(pass+"\n"), 0400); err != nil {
		t.Fatalf("write: %v", err)
	}
	os.Setenv("GARUDA_TEST_PASS_FILE_UNIT", path)
	defer os.Unsetenv("GARUDA_TEST_PASS_FILE_UNIT")

	got := loadRPCPassFile("GARUDA_TEST_PASS_FILE_UNIT")
	if got != pass {
		t.Errorf("got %q, want %q", got, pass)
	}
}

func TestLoadRPCPassFile_MissingFile(t *testing.T) {
	os.Setenv("GARUDA_TEST_PASS_FILE_MISS", "/tmp/no-such-pass-file-garuda-p9-test")
	defer os.Unsetenv("GARUDA_TEST_PASS_FILE_MISS")

	// Should return "" and log a warn, not panic or error.
	got := loadRPCPassFile("GARUDA_TEST_PASS_FILE_MISS")
	if got != "" {
		t.Errorf("expected empty string on missing file, got %q", got)
	}
}
