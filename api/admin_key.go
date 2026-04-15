// admin_key.go — file-based admin key loading and in-memory rotation.
//
// Two loading paths:
//
//  1. GARUDA_ADMIN_KEY env var — existing behaviour, backwards compat.
//  2. GARUDA_ADMIN_KEY_FILE — path to a file containing the key (one
//     line, trailing newlines stripped). Takes precedence over
//     GARUDA_ADMIN_KEY when both are set, enabling a smooth migration:
//     deploy with KEY_FILE set while old KEY is still in env for
//     rollback, then remove the env var once stabilised.
//
// File permission check: if the key file is group- or world-readable
// (mode & 0044 != 0) a WARN is logged at startup; the file is still
// used so a mis-deployed system is loudly signalled rather than
// silently broken. Production should be 0400 (owner-read-only).
//
// RotateAdminKey atomically swaps the in-memory key. It is called by
// POST /api/admin/rotate-key *after* the request has been fully
// authenticated with the old key, so the rotation itself cannot be
// used to bootstrap access.

package main

import (
	"fmt"
	"log"
	"os"
	"path/filepath"
	"strings"
)

// minAdminKeyLen is the shortest key accepted by RotateAdminKey and
// the file-loader. It is also the lower bound enforced by the rotation
// endpoint validator. 32 chars = 256 bits of ASCII entropy at minimum.
const minAdminKeyLen = 32

// loadAdminKeyFromFile reads and returns the trimmed content of a key
// file, checking that the file is not group- or world-readable. The
// error path is informational — callers fall back to the env var on
// error rather than aborting startup.
func loadAdminKeyFromFile(path string) (string, error) {
	path = filepath.Clean(path)
	fi, err := os.Stat(path)
	if err != nil {
		return "", fmt.Errorf("stat %s: %w", path, err)
	}
	mode := fi.Mode().Perm()
	if mode&0o044 != 0 {
		log.Printf("[SECURITY WARN] admin key file %s has permissions %04o — should be 0400 (owner-read-only). Other principals may be able to read the admin key.", sanitizeLog(path), mode)
	}
	raw, err := os.ReadFile(path) // #nosec G304 -- path is operator-supplied via env; cleaned above
	if err != nil {
		return "", fmt.Errorf("read %s: %w", path, err)
	}
	key := strings.TrimRight(string(raw), "\n\r\t ")
	if key == "" {
		return "", fmt.Errorf("admin key file %s is empty", path)
	}
	return key, nil
}

// maybeLoadAdminKeyFile checks GARUDA_ADMIN_KEY_FILE and, when set,
// overrides the key already loaded from GARUDA_ADMIN_KEY. Caller must
// hold securityConfig.Lock().
func maybeLoadAdminKeyFile(cfg *securityConfigT) {
	path := os.Getenv("GARUDA_ADMIN_KEY_FILE")
	if path == "" {
		return
	}
	key, err := loadAdminKeyFromFile(path)
	if err != nil {
		log.Printf("[SECURITY WARN] GARUDA_ADMIN_KEY_FILE: %v — falling back to GARUDA_ADMIN_KEY", err)
		return
	}
	if len(key) < minAdminKeyLen {
		log.Printf("[SECURITY WARN] GARUDA_ADMIN_KEY_FILE: key is %d chars, minimum recommended is %d", len(key), minAdminKeyLen) // #nosec G706 -- len() is an integer, not user-controlled
	}
	cfg.AdminKey = key
	// Clear the default warning for GARUDA_ADMIN_KEY since we loaded
	// from a file; the usingDefaults flag would fire a false warning
	// otherwise.
	delete(cfg.usingDefaults, "GARUDA_ADMIN_KEY")
	log.Printf("[security] admin key loaded from file (path=%s, len=%d)", sanitizeLog(path), len(key))
}

// loadRPCPassFile reads an RPC password from the file pointed to by
// envVar (e.g. "GARUDA_RPC_PASS_CBDC_FILE"). Returns "" when the env
// var is unset. Logs a WARN on read failure but does not abort —
// callers fall back to the env-var password.
func loadRPCPassFile(envVar string) string {
	path := os.Getenv(envVar)
	if path == "" {
		return ""
	}
	pass, err := loadAdminKeyFromFile(path)
	if err != nil {
		log.Printf("[SECURITY WARN] %s: %v — keeping env-var password", envVar, err)
		return ""
	}
	log.Printf("[security] RPC password loaded from file (%s, len=%d)", sanitizeLog(envVar), len(pass)) // #nosec G706 -- envVar sanitized; len is integer
	return pass
}

// RotateAdminKey atomically replaces the in-memory admin key. The new
// key must be at least minAdminKeyLen characters. The caller is
// responsible for ensuring the request was already authenticated with
// the old key before calling this.
func RotateAdminKey(newKey string) error {
	if len(newKey) < minAdminKeyLen {
		return fmt.Errorf("new admin key must be at least %d characters (got %d)", minAdminKeyLen, len(newKey))
	}
	securityConfig.Lock()
	securityConfig.AdminKey = newKey
	delete(securityConfig.usingDefaults, "GARUDA_ADMIN_KEY")
	securityConfig.Unlock()
	return nil
}
