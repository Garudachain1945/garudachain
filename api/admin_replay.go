// admin_replay.go — replay protection for admin endpoints.
//
// Each admin request carries a nonce and a timestamp in the JSON
// body. The server enforces:
//
//  1. Timestamp must be within ±replayWindow of server wall-clock.
//  2. Nonce must not have been seen before (within the same window).
//
// Both together defeat intercepted-body replay: an attacker who
// captures a valid mint payload cannot submit it twice, and cannot
// substitute the timestamp without also computing a new signed
// body (which requires the admin key they already have — but at
// that point they can compose a fresh request anyway, so replay
// protection only closes the passive-intercept / MITM case).
//
// Strict mode (`GARUDA_STRICT=1`) makes both fields required on
// every admin endpoint. In permissive/dev mode, the fields are
// optional: a request without them still works (legacy client
// compatibility), but a request *with* them is still checked for
// replay — so clients can opt in to the stronger guarantee.
//
// The nonce cache is a simple size+TTL LRU. 10k entries × 10 min
// TTL covers ~16 admin req/sec sustained, which is ~100× the
// rate limiter's 5/min allowance, so the cache is effectively
// unbounded under normal operation.

package main

import (
	"container/list"
	"fmt"
	"sync"
	"time"
)

const (
	replayWindow    = 5 * time.Minute
	nonceCacheSize  = 10000
	nonceCacheTTL   = 10 * time.Minute
	minNonceLen     = 8
	maxNonceLen     = 128
)

type nonceEntry struct {
	nonce    string
	expireAt time.Time
}

type nonceLRU struct {
	mu     sync.Mutex
	ll     *list.List              // front = most recent
	idx    map[string]*list.Element
	maxLen int
	ttl    time.Duration
}

var adminNonceCache = &nonceLRU{
	ll:     list.New(),
	idx:    make(map[string]*list.Element),
	maxLen: nonceCacheSize,
	ttl:    nonceCacheTTL,
}

// seenOrRecord returns true if nonce has been seen within the TTL,
// false otherwise (and records the nonce for future calls). Also
// garbage-collects expired entries lazily on each call.
func (n *nonceLRU) seenOrRecord(nonce string, now time.Time) bool {
	n.mu.Lock()
	defer n.mu.Unlock()

	// Evict from the back while expired. List is ordered front=newest
	// so expired entries accumulate at the back.
	for {
		back := n.ll.Back()
		if back == nil {
			break
		}
		e := back.Value.(*nonceEntry)
		if e.expireAt.After(now) {
			break
		}
		n.ll.Remove(back)
		delete(n.idx, e.nonce)
	}

	if _, ok := n.idx[nonce]; ok {
		return true // already seen — replay
	}

	// Enforce size cap by evicting the oldest.
	for n.ll.Len() >= n.maxLen {
		back := n.ll.Back()
		if back == nil {
			break
		}
		e := back.Value.(*nonceEntry)
		n.ll.Remove(back)
		delete(n.idx, e.nonce)
	}

	entry := &nonceEntry{nonce: nonce, expireAt: now.Add(n.ttl)}
	el := n.ll.PushFront(entry)
	n.idx[nonce] = el
	return false
}

// CheckAdminReplay enforces timestamp-window and nonce-uniqueness
// for one admin request. Returns nil if the request is fresh, or an
// error suitable for a 400-class response if it is stale or
// duplicated.
//
// If strict is false and both fields are empty, the check is
// skipped (legacy compatibility). Strict callers set strict=true
// which makes empty values an error.
func CheckAdminReplay(nonce string, tsUnix int64, strict bool) error {
	if nonce == "" && tsUnix == 0 {
		if strict {
			return fmt.Errorf("strict mode: admin request must include nonce and timestamp")
		}
		return nil
	}
	if nonce == "" {
		return fmt.Errorf("nonce required when timestamp is set")
	}
	if tsUnix == 0 {
		return fmt.Errorf("timestamp required when nonce is set")
	}
	if len(nonce) < minNonceLen || len(nonce) > maxNonceLen {
		return fmt.Errorf("nonce length must be %d..%d", minNonceLen, maxNonceLen)
	}

	now := time.Now()
	ts := time.Unix(tsUnix, 0)
	drift := now.Sub(ts)
	if drift < 0 {
		drift = -drift
	}
	if drift > replayWindow {
		return fmt.Errorf("timestamp outside ±%s replay window (drift %s)", replayWindow, drift.Round(time.Second))
	}

	if adminNonceCache.seenOrRecord(nonce, now) {
		return fmt.Errorf("nonce already used (replay detected)")
	}
	return nil
}

// ResetAdminReplayCacheForTest drops all recorded nonces. Tests
// use this between cases.
func ResetAdminReplayCacheForTest() {
	adminNonceCache.mu.Lock()
	defer adminNonceCache.mu.Unlock()
	adminNonceCache.ll.Init()
	adminNonceCache.idx = make(map[string]*list.Element)
}
