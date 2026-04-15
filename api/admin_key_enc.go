// admin_key_enc.go — AES-256-GCM envelope encryption for secret key files.
//
// # Threat model
//
// Plaintext key files on disk (from Pass #8) are protected by 0400
// permissions, but if an attacker steals the file (e.g. a backup, a
// misconfigured snapshot, or a container escape) they have the key in
// cleartext. Envelope encryption adds a second factor: the attacker must
// also know GARUDA_MASTER_KEY to decrypt the file.
//
// GARUDA_MASTER_KEY should live in a secrets manager (AWS Secrets Manager,
// HashiCorp Vault, GCP Secret Manager) or be injected at runtime — it must
// NOT live on the same disk as the encrypted files. This is a software HSM
// approximation, not a substitute for hardware key isolation.
//
// # Environment variables
//
//	GARUDA_MASTER_KEY              — 64 hex chars (32 bytes, AES-256)
//	GARUDA_ADMIN_KEY_ENC_FILE      — path to AES-GCM encrypted admin key
//	GARUDA_RPC_PASS_CBDC_ENC_FILE  — encrypted CBDC RPC password
//	GARUDA_RPC_PASS_PUBLIC_ENC_FILE  — encrypted public RPC password
//	GARUDA_RPC_PASS_CREATOR_ENC_FILE — encrypted creator RPC password
//
// # File format (binary)
//
//	[12-byte GCM nonce][ciphertext][16-byte GCM authentication tag]
//
// # Priority order
//
//	_ENC_FILE > _FILE > env var > hardcoded default
//
// If GARUDA_MASTER_KEY is absent, _ENC_FILE variants are silently skipped
// and the plaintext fallback chain applies. This keeps local dev working
// without needing a master key.

package main

import (
	"crypto/aes"
	"crypto/cipher"
	"crypto/rand"
	"errors"
	"fmt"
	"io"
	"log"
	"os"
	"path/filepath"
	"strings"
)

const masterKeyLen = 32 // AES-256: 32 bytes

// EncryptKeyToFile encrypts plaintext with AES-256-GCM using key and writes
// the ciphertext (nonce || ciphertext || tag) to path with mode 0400.
// Call this at provisioning time to create an encrypted secret file.
func EncryptKeyToFile(path string, plaintext []byte, key []byte) error {
	if len(key) != masterKeyLen {
		return fmt.Errorf("EncryptKeyToFile: key must be %d bytes, got %d", masterKeyLen, len(key))
	}
	block, err := aes.NewCipher(key)
	if err != nil {
		return fmt.Errorf("aes.NewCipher: %w", err)
	}
	gcm, err := cipher.NewGCM(block)
	if err != nil {
		return fmt.Errorf("cipher.NewGCM: %w", err)
	}
	nonce := make([]byte, gcm.NonceSize())
	if _, err := io.ReadFull(rand.Reader, nonce); err != nil {
		return fmt.Errorf("rand nonce: %w", err)
	}
	// gcm.Seal appends ciphertext+tag to nonce, yielding nonce||ct||tag.
	out := gcm.Seal(nonce, nonce, plaintext, nil)
	if err := os.WriteFile(filepath.Clean(path), out, 0400); err != nil {
		return fmt.Errorf("write encrypted file: %w", err)
	}
	return nil
}

// DecryptKeyFromFile reads an encrypted file produced by EncryptKeyToFile
// and returns the plaintext. Returns an error if the key is wrong or the
// file has been tampered with (GCM authentication failure).
func DecryptKeyFromFile(path string, key []byte) ([]byte, error) {
	if len(key) != masterKeyLen {
		return nil, fmt.Errorf("DecryptKeyFromFile: key must be %d bytes, got %d", masterKeyLen, len(key))
	}
	data, err := os.ReadFile(filepath.Clean(path))
	if err != nil {
		return nil, fmt.Errorf("read encrypted file: %w", err)
	}
	block, err := aes.NewCipher(key)
	if err != nil {
		return nil, fmt.Errorf("aes.NewCipher: %w", err)
	}
	gcm, err := cipher.NewGCM(block)
	if err != nil {
		return nil, fmt.Errorf("cipher.NewGCM: %w", err)
	}
	nonceSize := gcm.NonceSize()
	if len(data) < nonceSize+gcm.Overhead() {
		return nil, errors.New("encrypted file too short — likely corrupted")
	}
	nonce, ciphertext := data[:nonceSize], data[nonceSize:]
	plaintext, err := gcm.Open(nil, nonce, ciphertext, nil)
	if err != nil {
		return nil, fmt.Errorf("AES-GCM authentication failed (wrong key or tampered file): %w", err)
	}
	return plaintext, nil
}

// maybeLoadEncryptedAdminKey overrides cfg.AdminKey from
// GARUDA_ADMIN_KEY_ENC_FILE if both that env var and a master key provider are
// configured. Takes priority over GARUDA_ADMIN_KEY_FILE and GARUDA_ADMIN_KEY.
// cfg must be held locked by the caller.
func maybeLoadEncryptedAdminKey(cfg *securityConfigT) {
	encFile := os.Getenv("GARUDA_ADMIN_KEY_ENC_FILE")
	if encFile == "" {
		return
	}
	mk, err := getMasterKey() // uses globalKeyProvider (Vault, GCP SM, or env)
	if err != nil {
		log.Printf("[security] GARUDA_ADMIN_KEY_ENC_FILE set but master key unavailable (%v) — falling back to plaintext", err)
		return
	}
	plaintext, err := DecryptKeyFromFile(encFile, mk)
	if err != nil {
		log.Printf("[security] decrypt admin key file: %v — falling back to plaintext", err)
		return
	}
	key := strings.TrimSpace(string(plaintext))
	if len(key) < minAdminKeyLen {
		log.Printf("[security] decrypted admin key too short (%d < %d) — ignoring", len(key), minAdminKeyLen)
		return
	}
	cfg.AdminKey = key
	delete(cfg.usingDefaults, "GARUDA_ADMIN_KEY")
	log.Printf("[security] admin key loaded from encrypted file (%d chars)", len(key))
}

// maybeLoadEncryptedRPCPass loads an RPC password from an AES-GCM encrypted
// file. encFileEnvVar is the name of the env var holding the file path
// (e.g. "GARUDA_RPC_PASS_CBDC_ENC_FILE"). Returns "" if the env var is
// unset or decryption fails (plaintext fallback applies).
func maybeLoadEncryptedRPCPass(encFileEnvVar string) string {
	encFile := os.Getenv(encFileEnvVar)
	if encFile == "" {
		return ""
	}
	mk, err := getMasterKey() // uses globalKeyProvider (Vault, GCP SM, or env)
	if err != nil {
		log.Printf("[security] %s set but master key unavailable (%v) — falling back", encFileEnvVar, err)
		return ""
	}
	plaintext, err := DecryptKeyFromFile(encFile, mk)
	if err != nil {
		log.Printf("[security] decrypt %s: %v — falling back", encFileEnvVar, err)
		return ""
	}
	return strings.TrimSpace(string(plaintext))
}
