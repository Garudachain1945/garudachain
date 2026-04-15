// key_provider.go — pluggable master-key retrieval (env → Vault → GCP SM).
//
// # Problem
//
// Pass #11 added AES-256-GCM envelope encryption so that secret files are
// never stored in cleartext on disk. The encryption key, GARUDA_MASTER_KEY,
// is still injected as a plain environment variable. In a VM deployment this
// is "better than nothing" but falls short of hardware key isolation: any
// process running as the same user, or any operator who can read /proc/PID/
// environ, can extract the key.
//
// # Solution
//
// Abstract key retrieval behind a KeyProvider interface. The factory function
// newMasterKeyProvider() auto-selects the best available backend:
//
//	GARUDA_VAULT_ADDR set → VaultKeyProvider (HashiCorp Vault KV v2)
//	otherwise             → EnvKeyProvider   (plain GARUDA_MASTER_KEY)
//
// A GCPSMKeyProvider stub is included for GCP Secret Manager; wiring it up
// requires only implementing GetMasterKey() with the SM SDK.
//
// # Vault KV v2 variables
//
//	GARUDA_VAULT_ADDR   — Vault server URL, e.g. https://vault.internal:8200
//	GARUDA_VAULT_TOKEN  — Vault token (or use VAULT_TOKEN conventional var)
//	GARUDA_VAULT_PATH   — KV v2 secret path, e.g. secret/data/garuda/master
//	GARUDA_VAULT_FIELD  — field name inside the secret (default: "master_key")
//	GARUDA_VAULT_CACERT — optional PEM file for Vault's TLS CA (private PKI)
//
// # Priority
//
//	Vault (if GARUDA_VAULT_ADDR set) > env var GARUDA_MASTER_KEY
//
// # Caching
//
// The resolved key is cached in memory after the first successful fetch.
// On Vault this avoids hammering the server on every admin call. The cache
// is keyed by provider name and invalidated on process restart.

package main

import (
	"crypto/tls"
	"crypto/x509"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log"
	"net/http"
	"os"
	"strings"
	"sync"
	"time"
)

// KeyProvider abstracts where the AES-256 master key comes from.
type KeyProvider interface {
	// GetMasterKey returns the 32-byte AES-256 master key.
	// Implementations must be safe for concurrent use.
	GetMasterKey() ([]byte, error)
	// Name returns a human-readable identifier for logging.
	Name() string
}

// ── EnvKeyProvider ────────────────────────────────────────────────────────────

var errNoMasterKey = errors.New("GARUDA_MASTER_KEY not set or invalid (must be 64 hex chars)")

// EnvKeyProvider reads the master key from the GARUDA_MASTER_KEY environment
// variable (64 hex chars = 32 bytes). This is the fallback provider.
type EnvKeyProvider struct{}

func (EnvKeyProvider) Name() string { return "env:GARUDA_MASTER_KEY" }

func (EnvKeyProvider) GetMasterKey() ([]byte, error) {
	s := os.Getenv("GARUDA_MASTER_KEY")
	if s == "" {
		return nil, errNoMasterKey
	}
	key, err := hex.DecodeString(s)
	if err != nil || len(key) != masterKeyLen {
		return nil, fmt.Errorf("GARUDA_MASTER_KEY must be 64 hex chars (32 bytes): got len=%d", len(s))
	}
	return key, nil
}

// ── VaultKeyProvider ──────────────────────────────────────────────────────────

// VaultKeyProvider fetches the master key from HashiCorp Vault KV v2.
// The secret value must be a 64-char hex string (same format as the env var).
type VaultKeyProvider struct {
	addr   string
	token  string
	path   string
	field  string
	client *http.Client

	mu    sync.Mutex
	cache []byte // cached key bytes (set on first successful fetch)
}

func newVaultKeyProvider(addr, token, path, field, caCertFile string) (*VaultKeyProvider, error) {
	if addr == "" {
		return nil, errors.New("vault addr is empty")
	}
	if token == "" {
		return nil, errors.New("vault token is empty (set GARUDA_VAULT_TOKEN or VAULT_TOKEN)")
	}
	if path == "" {
		return nil, errors.New("vault path is empty (set GARUDA_VAULT_PATH)")
	}
	if field == "" {
		field = "master_key"
	}

	tlsCfg := &tls.Config{MinVersion: tls.VersionTLS12}
	if caCertFile != "" {
		pem, err := os.ReadFile(caCertFile) // #nosec G304 — path from operator config
		if err != nil {
			return nil, fmt.Errorf("read Vault CA cert %q: %w", caCertFile, err)
		}
		pool := x509.NewCertPool()
		if !pool.AppendCertsFromPEM(pem) {
			return nil, fmt.Errorf("Vault CA cert %q: no valid PEM certs found", caCertFile)
		}
		tlsCfg.RootCAs = pool
	}

	return &VaultKeyProvider{
		addr:  strings.TrimRight(addr, "/"),
		token: token,
		path:  path,
		field: field,
		client: &http.Client{
			Timeout:   10 * time.Second,
			Transport: &http.Transport{TLSClientConfig: tlsCfg},
		},
	}, nil
}

func (v *VaultKeyProvider) Name() string {
	return fmt.Sprintf("vault:%s#%s", v.path, v.field)
}

func (v *VaultKeyProvider) GetMasterKey() ([]byte, error) {
	v.mu.Lock()
	if v.cache != nil {
		out := make([]byte, len(v.cache))
		copy(out, v.cache)
		v.mu.Unlock()
		return out, nil
	}
	v.mu.Unlock()

	// KV v2: GET /v1/<path>   (path already includes "secret/data/...")
	url := v.addr + "/v1/" + strings.TrimPrefix(v.path, "/")
	req, err := http.NewRequest(http.MethodGet, url, nil) // #nosec G107 — URL from operator config
	if err != nil {
		return nil, fmt.Errorf("vault request: %w", err)
	}
	req.Header.Set("X-Vault-Token", v.token)

	resp, err := v.client.Do(req)
	if err != nil {
		return nil, fmt.Errorf("vault GET %s: %w", url, err)
	}
	defer resp.Body.Close()
	body, _ := io.ReadAll(io.LimitReader(resp.Body, 64*1024))

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("vault GET %s: HTTP %d: %s", url, resp.StatusCode, body)
	}

	// KV v2 response: {"data":{"data":{"<field>":"<value>"},...}}
	var kv struct {
		Data struct {
			Data map[string]string `json:"data"`
		} `json:"data"`
	}
	if err := json.Unmarshal(body, &kv); err != nil {
		return nil, fmt.Errorf("vault response parse: %w", err)
	}
	raw, ok := kv.Data.Data[v.field]
	if !ok {
		return nil, fmt.Errorf("vault secret at %q missing field %q", v.path, v.field)
	}
	key, err := hex.DecodeString(strings.TrimSpace(raw))
	if err != nil || len(key) != masterKeyLen {
		return nil, fmt.Errorf("vault field %q: must be 64 hex chars (32 bytes), got len=%d", v.field, len(raw))
	}

	v.mu.Lock()
	v.cache = make([]byte, len(key))
	copy(v.cache, key)
	v.mu.Unlock()

	return key, nil
}

// InvalidateVaultCache clears the cached key so the next GetMasterKey() call
// re-fetches from Vault. Useful after a key rotation.
func (v *VaultKeyProvider) InvalidateVaultCache() {
	v.mu.Lock()
	v.cache = nil
	v.mu.Unlock()
}

// ── GCPSMKeyProvider stub ─────────────────────────────────────────────────────

// GCPSMKeyProvider is a placeholder for GCP Secret Manager integration.
// Implement GetMasterKey() using cloud.google.com/go/secretmanager to
// activate it; the factory wires it in when GARUDA_GCP_SM_SECRET is set.
type GCPSMKeyProvider struct {
	secretName string
}

func (g *GCPSMKeyProvider) Name() string { return "gcpsm:" + g.secretName }

func (g *GCPSMKeyProvider) GetMasterKey() ([]byte, error) {
	return nil, fmt.Errorf("GCP Secret Manager provider not yet wired up (secret=%q); "+
		"implement GetMasterKey() using the secretmanager SDK and rebuild", g.secretName)
}

// ── factory ───────────────────────────────────────────────────────────────────

// globalKeyProvider is set once by initKeyProvider() and reused for the
// lifetime of the process. Tests may replace it.
var globalKeyProvider KeyProvider = EnvKeyProvider{}

// initKeyProvider auto-selects and initialises the best available key
// provider. Call once at startup, before loadSecurityConfig(). If Vault
// is configured but the connection fails, the function logs a warning and
// falls back to the env provider so the process can still start.
func initKeyProvider() {
	vaultAddr := os.Getenv("GARUDA_VAULT_ADDR")
	gcpSecret := os.Getenv("GARUDA_GCP_SM_SECRET")

	switch {
	case vaultAddr != "":
		token := os.Getenv("GARUDA_VAULT_TOKEN")
		if token == "" {
			token = os.Getenv("VAULT_TOKEN") // conventional Vault env var
		}
		path := os.Getenv("GARUDA_VAULT_PATH")
		field := os.Getenv("GARUDA_VAULT_FIELD")
		caFile := os.Getenv("GARUDA_VAULT_CACERT")
		p, err := newVaultKeyProvider(vaultAddr, token, path, field, caFile)
		if err != nil {
			log.Printf("[key-provider] Vault configured but init failed (%v) — falling back to env", err)
			globalKeyProvider = EnvKeyProvider{}
			return
		}
		globalKeyProvider = p
		log.Printf("[key-provider] using HashiCorp Vault at %s path=%s field=%s",
			vaultAddr, path, func() string {
				if field == "" {
					return "master_key"
				}
				return field
			}())

	case gcpSecret != "":
		globalKeyProvider = &GCPSMKeyProvider{secretName: gcpSecret}
		log.Printf("[key-provider] using GCP Secret Manager secret=%s (stub — implement SDK)", gcpSecret)

	default:
		globalKeyProvider = EnvKeyProvider{}
		log.Printf("[key-provider] using GARUDA_MASTER_KEY env var")
	}
}

// getMasterKey retrieves the master key via the active provider.
// This replaces direct calls to parseMasterKey() throughout the codebase.
func getMasterKey() ([]byte, error) {
	return globalKeyProvider.GetMasterKey()
}
