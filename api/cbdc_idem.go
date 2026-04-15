// cbdc_idem.go — idempotency key cache for CBDC mint and burn operations.
//
// # Purpose
//
// Network failures can cause a client to retry a mint or burn request without
// knowing whether the first attempt succeeded. Without idempotency, this leads
// to double-minting or double-burning — a critical correctness issue for a
// CBDC system.
//
// If the request body includes an "idempotency_key" string field, the server:
//  1. Looks up the key in the cache.
//  2. If found (and not expired), returns the original response verbatim
//     without re-executing the RPC.
//  3. If not found, executes the operation, stores the response, and returns it.
//
// # Scope
//
// Keys are scoped per operation name ("mint", "burn") to prevent accidental
// cross-contamination (the same key used for a mint cannot accidentally
// retrieve a burn response).
//
// # Cache parameters
//
//	TTL:        24 hours   (client retry window)
//	Capacity:   10 000 entries (each ~1 KiB = ~10 MiB worst case)
//	Eviction:   expired-first, then arbitrary half-eviction when full
//
// # Security note
//
// Idempotency keys are not authenticated separately — they ride on top of
// requireAdmin. An attacker who can observe a valid idempotency key AND has
// the admin key could replay the response, but they could also just call
// the endpoint directly. The key material is never exposed in responses.

package main

import (
	"bytes"
	"net/http"
	"sync"
	"time"
)

const (
	idemTTL        = 24 * time.Hour
	maxIdemEntries = 10_000
)

type idemEntry struct {
	status  int
	body    []byte
	headers map[string]string
	created time.Time
}

type idemCache struct {
	mu      sync.Mutex
	entries map[string]*idemEntry
}

func newIdemCache() *idemCache {
	return &idemCache{entries: make(map[string]*idemEntry)}
}

// Get returns a cached response for the given operation + key, or nil
// if the entry does not exist or has expired.
func (c *idemCache) Get(op, key string) *idemEntry {
	c.mu.Lock()
	defer c.mu.Unlock()
	e := c.entries[op+":"+key]
	if e == nil {
		return nil
	}
	if time.Since(e.created) > idemTTL {
		delete(c.entries, op+":"+key)
		return nil
	}
	return e
}

// Set stores the response for op+key. If the cache is at capacity, expired
// entries are evicted first; if still full, an arbitrary half is removed.
func (c *idemCache) Set(op, key string, status int, body []byte, contentType string) {
	c.mu.Lock()
	defer c.mu.Unlock()
	if len(c.entries) >= maxIdemEntries {
		now := time.Now()
		for k, v := range c.entries {
			if now.Sub(v.created) > idemTTL {
				delete(c.entries, k)
			}
		}
		if len(c.entries) >= maxIdemEntries {
			n := 0
			for k := range c.entries {
				delete(c.entries, k)
				n++
				if n >= maxIdemEntries/2 {
					break
				}
			}
		}
	}
	c.entries[op+":"+key] = &idemEntry{
		status:  status,
		body:    body,
		headers: map[string]string{"Content-Type": contentType},
		created: time.Now(),
	}
}

// cbdcIdemCache is the shared idempotency store for CBDC operations.
var cbdcIdemCache = newIdemCache()

// idemResponseCapture wraps an http.ResponseWriter to record the status
// code and body so they can be stored in the idempotency cache.
type idemResponseCapture struct {
	http.ResponseWriter
	status int
	buf    bytes.Buffer
}

func (c *idemResponseCapture) WriteHeader(code int) {
	c.status = code
	c.ResponseWriter.WriteHeader(code)
}

func (c *idemResponseCapture) Write(b []byte) (int, error) {
	c.buf.Write(b)
	return c.ResponseWriter.Write(b)
}

// replayIdem writes a cached response to w and returns true.
// Returns false (no-op) if entry is nil.
func replayIdem(w http.ResponseWriter, entry *idemEntry) bool {
	if entry == nil {
		return false
	}
	for k, v := range entry.headers {
		w.Header().Set(k, v)
	}
	w.Header().Set("X-Idempotency-Replayed", "true")
	w.WriteHeader(entry.status)
	w.Write(entry.body) //nolint:errcheck
	return true
}

// ResetIdemCacheForTest clears all entries. Called in test teardown.
func ResetIdemCacheForTest() {
	cbdcIdemCache.mu.Lock()
	cbdcIdemCache.entries = make(map[string]*idemEntry)
	cbdcIdemCache.mu.Unlock()
}
