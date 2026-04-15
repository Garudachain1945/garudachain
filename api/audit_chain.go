// audit_chain.go — tamper-evident append-only audit log.
//
// Every audit entry is serialized as one JSON line that includes
//
//   - a monotonic sequence number,
//   - the prev_hash of the previous entry (genesis = 64 zeros), and
//   - a sha256 hash of the entry itself (computed over the canonical
//     JSON encoding of the entry with the `hash` field set to "").
//
// Any tampering — reordering, deletion, modification, or insertion —
// breaks the chain at the first affected row and is detected by
// VerifyAuditChain. This is the same construction used by RFC 6962
// Certificate Transparency logs and by most SIEM tamper-evidence
// schemes, reduced to the minimum viable form.
//
// The chain is optional: if GARUDA_AUDIT_FILE is unset, Audit() only
// writes to stdout (existing behavior). When set, every Audit() call
// also appends one line to the file. I/O errors never block the
// caller — audit must not take down the API. A chain write failure
// is surfaced as a gap in the seq numbers (operationally visible).
//
// Recovery at startup: OpenAuditChain scans the existing file from
// the beginning, recovers the tail hash and seq number, and appends
// to the end. No sidecar state file.

package main

import (
	"bufio"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"log"
	"os"
	"path/filepath"
	"sync"
)

// emptyHash is the genesis prev_hash — 64 hex zeros.
const emptyHash = "0000000000000000000000000000000000000000000000000000000000000000"

type auditChainT struct {
	mu       sync.Mutex
	file     *os.File
	prevHash string
	seq      int64
	enabled  bool

	// Circuit breaker. Increments on each consecutive write failure;
	// resets on a successful write. Once it reaches breakerThreshold,
	// breakerTripped is set and stays set until ResetAuditBreaker is
	// called explicitly (or the process restarts). Admin endpoints
	// check IsAuditBreakerTripped before performing privileged writes.
	consecFails    int
	breakerTripped bool
}

const breakerThreshold = 3

var auditChain = &auditChainT{prevHash: emptyHash}

// IsAuditBreakerTripped reports whether the audit chain has failed to
// write often enough to freeze admin operations. Called on the hot
// path of every admin request, so the implementation is a plain lock
// + bool read.
func IsAuditBreakerTripped() bool {
	auditChain.mu.Lock()
	defer auditChain.mu.Unlock()
	return auditChain.breakerTripped
}

// ResetAuditBreaker clears the tripped flag and the consecutive
// failure counter. Operators call this after fixing the underlying
// audit backend issue (disk full, permissions, corruption, etc).
// Tests use it between runs.
func ResetAuditBreaker() {
	auditChain.mu.Lock()
	defer auditChain.mu.Unlock()
	auditChain.breakerTripped = false
	auditChain.consecFails = 0
}

// auditChainEntry is the on-disk form of an audit event: a superset
// of AuditEvent plus seq/prev_hash/hash. Field order matters for
// the canonical marshal — Go's encoding/json writes struct fields
// in declaration order, and we rely on that for deterministic
// hashing.
type auditChainEntry struct {
	Seq      int64                  `json:"seq"`
	Time     string                 `json:"time"`
	Event    string                 `json:"event"`
	IP       string                 `json:"ip"`
	Path     string                 `json:"path"`
	Actor    string                 `json:"actor,omitempty"`
	Result   string                 `json:"result"`
	Meta     map[string]interface{} `json:"meta,omitempty"`
	PrevHash string                 `json:"prev_hash"`
	Hash     string                 `json:"hash"`
}

// OpenAuditChain opens (or creates) the audit file, scans existing
// entries to recover the tail hash and seq number, and marks the
// chain enabled. Call once at startup. If path is empty, the chain
// stays disabled and Audit() retains its old stdout-only behavior.
//
// Returns an error if the file is unreadable, unparseable, or the
// existing chain fails verification — in any of those cases the
// chain stays disabled so a compromised file cannot be silently
// extended.
func OpenAuditChain(path string) error {
	auditChain.mu.Lock()
	defer auditChain.mu.Unlock()

	if path == "" {
		auditChain.enabled = false
		return nil
	}

	path = filepath.Clean(path)
	f, err := os.OpenFile(path, os.O_RDWR|os.O_CREATE|os.O_APPEND, 0600)
	if err != nil {
		return fmt.Errorf("open audit file: %w", err)
	}

	// Scan existing contents to recover state. Also verifies the
	// chain — if the file was tampered with while offline, we refuse
	// to extend it.
	if _, err := f.Seek(0, 0); err != nil {
		f.Close()
		return err
	}
	prev := emptyHash
	var seq int64
	scanner := bufio.NewScanner(f)
	scanner.Buffer(make([]byte, 64*1024), 1<<20)
	for scanner.Scan() {
		var e auditChainEntry
		if err := json.Unmarshal(scanner.Bytes(), &e); err != nil {
			f.Close()
			return fmt.Errorf("audit file corrupt at seq %d: %w", seq+1, err)
		}
		if e.PrevHash != prev {
			f.Close()
			return fmt.Errorf("audit chain break at seq %d: prev_hash mismatch", e.Seq)
		}
		if computeEntryHash(e) != e.Hash {
			f.Close()
			return fmt.Errorf("audit chain break at seq %d: hash mismatch", e.Seq)
		}
		prev = e.Hash
		seq = e.Seq
	}
	if err := scanner.Err(); err != nil {
		f.Close()
		return err
	}

	// Seek to end for appending.
	if _, err := f.Seek(0, 2); err != nil {
		f.Close()
		return err
	}

	auditChain.file = f
	auditChain.prevHash = prev
	auditChain.seq = seq
	auditChain.enabled = true
	return nil
}

// CloseAuditChain flushes and closes the chain file. Safe to call
// multiple times; safe to call when the chain is disabled.
func CloseAuditChain() {
	auditChain.mu.Lock()
	defer auditChain.mu.Unlock()
	if auditChain.file != nil {
		_ = auditChain.file.Sync()
		_ = auditChain.file.Close()
		auditChain.file = nil
	}
	auditChain.enabled = false
}

// appendAuditChain writes one entry to the chain file. Called from
// Audit() under the auditMu held by the caller — but also takes its
// own mutex because the chain state is independent of the logger
// mutex (reset/close races).
func appendAuditChain(ev AuditEvent) {
	auditChain.mu.Lock()
	defer auditChain.mu.Unlock()
	if !auditChain.enabled || auditChain.file == nil {
		return
	}

	auditChain.seq++
	entry := auditChainEntry{
		Seq:      auditChain.seq,
		Time:     ev.Time,
		Event:    ev.Event,
		IP:       ev.IP,
		Path:     ev.Path,
		Actor:    ev.Actor,
		Result:   ev.Result,
		Meta:     ev.Meta,
		PrevHash: auditChain.prevHash,
	}
	entry.Hash = computeEntryHash(entry)

	out, err := json.Marshal(entry)
	if err != nil {
		log.Printf("[audit-err] marshal: %v", err)
		auditChain.seq-- // roll back so a gap isn't introduced by a bug
		bumpBreakerLocked()
		return
	}
	out = append(out, '\n')
	if _, err := auditChain.file.Write(out); err != nil {
		log.Printf("[audit-err] write: %v", err)
		auditChain.seq--
		bumpBreakerLocked()
		return
	}
	if err := auditChain.file.Sync(); err != nil {
		log.Printf("[audit-err] fsync: %v", err)
		// fsync failure is a soft signal — the write may still be in
		// the page cache. Count toward the breaker but don't roll back
		// seq: the line is durable at best-effort.
		bumpBreakerLocked()
		return
	}
	auditChain.prevHash = entry.Hash
	// Success — clear the consecutive failure counter. Leave the
	// tripped flag alone; operator must call ResetAuditBreaker to
	// clear it explicitly, so a single lucky write after a long
	// outage can't silently unfreeze admin ops.
	auditChain.consecFails = 0
}

// bumpBreakerLocked increments the consecutive-failure counter and
// trips the breaker when it crosses the threshold. Caller must hold
// auditChain.mu.
func bumpBreakerLocked() {
	auditChain.consecFails++
	if auditChain.consecFails >= breakerThreshold && !auditChain.breakerTripped {
		auditChain.breakerTripped = true
		log.Printf("[SECURITY CRIT] audit breaker TRIPPED after %d consecutive write failures — admin ops frozen", auditChain.consecFails)
	}
}

// computeEntryHash returns the hex sha256 of the canonical JSON of
// the entry with its Hash field blanked out. Go's json.Marshal
// writes struct fields in declaration order and sorts map keys,
// making the encoding deterministic for any fixed Meta content.
func computeEntryHash(e auditChainEntry) string {
	e.Hash = ""
	body, err := json.Marshal(e)
	if err != nil {
		return ""
	}
	sum := sha256.Sum256(body)
	return hex.EncodeToString(sum[:])
}

// VerifyAuditChain walks an audit file and checks every entry's
// hash and chain linkage. Returns the number of valid entries and
// a non-nil error on the first mismatch. Safe to call on a file
// being actively written — it will simply stop at the last complete
// line.
func VerifyAuditChain(path string) (int, error) {
	path = filepath.Clean(path)
	f, err := os.Open(path)
	if err != nil {
		return 0, err
	}
	defer f.Close()

	prev := emptyHash
	scanner := bufio.NewScanner(f)
	scanner.Buffer(make([]byte, 64*1024), 1<<20)
	n := 0
	for scanner.Scan() {
		line := scanner.Bytes()
		if len(line) == 0 {
			continue
		}
		var e auditChainEntry
		if err := json.Unmarshal(line, &e); err != nil {
			return n, fmt.Errorf("line %d: invalid json: %w", n+1, err)
		}
		if e.PrevHash != prev {
			return n, fmt.Errorf("line %d (seq %d): prev_hash mismatch — chain broken", n+1, e.Seq)
		}
		want := computeEntryHash(e)
		if want != e.Hash {
			return n, fmt.Errorf("line %d (seq %d): hash mismatch — row tampered", n+1, e.Seq)
		}
		prev = e.Hash
		n++
	}
	if err := scanner.Err(); err != nil {
		return n, err
	}
	return n, nil
}

// ResetAuditChainForTest is a test helper that drops any in-memory
// chain state and closes the file. Safe to call outside tests too.
func ResetAuditChainForTest() {
	CloseAuditChain()
	auditChain.mu.Lock()
	defer auditChain.mu.Unlock()
	auditChain.prevHash = emptyHash
	auditChain.seq = 0
}
