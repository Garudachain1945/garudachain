// admin_rotate.go — POST /api/admin/rotate-key
//
// Atomically replaces the in-memory admin key without a process
// restart. The request must be fully authenticated with the *current*
// key (requireAdmin is called first), so this endpoint cannot be used
// to bootstrap access. Emits an admin_key_rotate audit event.
//
// Request body (JSON):
//
//	{
//	  "new_key": "<at least 32 characters>"
//	}
//
// Response 200 on success, 400 on validation failure, 401/403 on
// auth failure (via requireAdmin).
//
// Threat model: rotating the key mid-session invalidates every
// in-flight nonce from the old key's LRU, because the HMAC sig would
// no longer verify. Old-key replay attacks are therefore defeated
// automatically: a captured old-key request cannot succeed after the
// first rotation.
//
// Note: this endpoint does NOT write the new key to disk or to the
// key file. If the process restarts, the key reverts to whatever was
// in GARUDA_ADMIN_KEY / GARUDA_ADMIN_KEY_FILE at the time. Persistent
// rotation requires updating the source (file or secrets manager) and
// restarting — or reissuing the rotation call after each restart.

package main

import (
	"encoding/json"
	"net/http"
)

// handleAdminRotateKey is the POST /api/admin/rotate-key handler.
// It reads the new_key field, validates length, atomically swaps the
// key, and emits an audit event.
func handleAdminRotateKey(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		writeJSONErrStatus(w, http.StatusMethodNotAllowed, "POST required", nil)
		return
	}
	adminKey := r.URL.Query().Get("admin_key")
	if adminKey == "" {
		adminKey = r.Header.Get("X-Admin-Key")
	}
	if !requireAdmin(w, r, adminKey) {
		return
	}

	var req struct {
		NewKey string `json:"new_key"`
	}
	dec := json.NewDecoder(r.Body)
	dec.DisallowUnknownFields()
	if err := dec.Decode(&req); err != nil {
		writeJSONErrStatus(w, http.StatusBadRequest, "invalid JSON body", err)
		return
	}

	if err := RotateAdminKey(req.NewKey); err != nil {
		writeJSONErrStatus(w, http.StatusBadRequest, "key rotation rejected", err)
		return
	}

	ip := clientIP(r)
	Audit(AuditEvent{
		Event:  "admin_key_rotate",
		IP:     ip,
		Path:   r.URL.Path,
		Result: "ok",
		Meta: map[string]interface{}{
			"new_key_len": len(req.NewKey),
		},
	})

	writeJSON(w, map[string]interface{}{
		"status":      "ok",
		"new_key_len": len(req.NewKey),
	})
}
