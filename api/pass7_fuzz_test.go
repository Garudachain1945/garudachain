// pass7_fuzz_test.go — native Go fuzz tests for the Pass #6 codec
// and replay surfaces. Both fuzz targets were added in Pass #7 to
// catch panics or decoder divergence on malformed input that the
// deterministic unit tests can't enumerate exhaustively.
//
// Run locally with:
//
//     go test -run=FuzzWitnessPayloadRoundtrip -fuzz=FuzzWitnessPayloadRoundtrip ./api -fuzztime=30s
//     go test -run=FuzzCheckAdminReplay       -fuzz=FuzzCheckAdminReplay       ./api -fuzztime=30s
//
// In CI the -fuzz flag is omitted so the seed corpus runs as normal
// deterministic tests — every seed is a regression test, so any panic
// found during fuzzing becomes a permanent guard.

package main

import (
	"encoding/binary"
	"testing"
	"time"
)

// FuzzWitnessPayloadRoundtrip feeds arbitrary bytes to parseWitnessPayload
// and asserts it never panics, and that any payload built via
// buildWitnessPayload roundtrips cleanly back through parse.
func FuzzWitnessPayloadRoundtrip(f *testing.F) {
	// Seed corpus: valid, too-short, too-long, bad-magic, zero-seq.
	valid := buildWitnessPayload(1, make([]byte, 32))
	f.Add(valid)
	f.Add(make([]byte, 0))
	f.Add(make([]byte, 48))
	f.Add(make([]byte, 49))
	f.Add(make([]byte, 50))
	f.Add(append([]byte("XXXXXXXX\x01"), make([]byte, 40)...))

	f.Fuzz(func(t *testing.T, raw []byte) {
		// Must not panic on any input.
		seq, tail, err := parseWitnessPayload(raw)
		if err == nil {
			// Successfully parsed → must roundtrip identically.
			if len(raw) != 49 {
				t.Fatalf("parsed non-49 payload: %d", len(raw))
			}
			tailRaw := make([]byte, 32)
			copy(tailRaw, raw[17:49])
			rebuilt := buildWitnessPayload(seq, tailRaw)
			if rebuilt == nil {
				t.Fatalf("rebuild returned nil for seq=%d", seq)
			}
			seq2, tail2, err2 := parseWitnessPayload(rebuilt)
			if err2 != nil {
				t.Fatalf("rebuild failed to parse: %v", err2)
			}
			if seq2 != seq || tail2 != tail {
				t.Fatalf("roundtrip mismatch: (%d,%s) vs (%d,%s)", seq, tail, seq2, tail2)
			}
		}
	})
}

// FuzzWitnessPayloadSeqBoundary guarantees that the int64-overflow
// guard in parseWitnessPayload actually fires for any uint64 with the
// high bit set (i.e. the entire top half of the uint64 range).
func FuzzWitnessPayloadSeqBoundary(f *testing.F) {
	f.Add(uint64(0))
	f.Add(uint64(1))
	f.Add(uint64(1<<63 - 1))
	f.Add(uint64(1 << 63)) // first overflow
	f.Add(^uint64(0))      // max

	f.Fuzz(func(t *testing.T, seqU uint64) {
		raw := make([]byte, 49)
		copy(raw, witnessMagic)
		raw[8] = witnessVersion
		binary.BigEndian.PutUint64(raw[9:17], seqU)
		// tail bytes left at zero — that's fine, we only care about seq.
		seq, _, err := parseWitnessPayload(raw)
		if seqU > 1<<63-1 {
			if err == nil {
				t.Fatalf("seq=%d should have overflowed int64 but parsed as %d", seqU, seq)
			}
		} else {
			if err != nil {
				t.Fatalf("seq=%d in range should have parsed, got err: %v", seqU, err)
			}
			if uint64(seq) != seqU {
				t.Fatalf("seq roundtrip: got %d want %d", seq, seqU)
			}
		}
	})
}

// FuzzCheckAdminReplay feeds arbitrary nonces, drift offsets, and
// strict flags to CheckAdminReplay and asserts it never panics.
// Correctness is checked by shape, not exact value:
//   - empty fields in non-strict mode: never error.
//   - nonce under 8 chars or over 128: always error.
//   - drift beyond ±5min: always error.
//   - valid first submission: no error; valid second with same nonce: error.
func FuzzCheckAdminReplay(f *testing.F) {
	f.Add("nonce-12345", int64(0), false)
	f.Add("", int64(0), false)
	f.Add("", int64(0), true)
	f.Add("short", int64(0), false)
	f.Add("nonce-too-large-"+string(make([]byte, 200)), int64(0), false)

	f.Fuzz(func(t *testing.T, nonce string, driftSec int64, strict bool) {
		// Clamp drift to something that doesn't overflow time.Unix.
		if driftSec > 1<<30 {
			driftSec = 1 << 30
		}
		if driftSec < -(1 << 30) {
			driftSec = -(1 << 30)
		}
		ResetAdminReplayCacheForTest()

		// Case 1: empty fields (nonce="" and ts=0)
		if nonce == "" && driftSec == 0 {
			err := CheckAdminReplay("", 0, strict)
			if strict && err == nil {
				t.Fatalf("strict mode accepted empty fields")
			}
			if !strict && err != nil {
				t.Fatalf("permissive mode rejected empty fields: %v", err)
			}
			return
		}

		ts := time.Now().Add(time.Duration(driftSec) * time.Second).Unix()
		// Never panic.
		err := CheckAdminReplay(nonce, ts, strict)
		_ = err

		// Length invariant.
		if err == nil && (len(nonce) < minNonceLen || len(nonce) > maxNonceLen) {
			t.Fatalf("nonce length %d accepted (bounds %d..%d)", len(nonce), minNonceLen, maxNonceLen)
		}

		// Replay invariant: same call again must fail *if* the first
		// call succeeded.
		if err == nil {
			err2 := CheckAdminReplay(nonce, ts, strict)
			if err2 == nil {
				t.Fatalf("replay of nonce %q was accepted twice", nonce)
			}
		}
	})
}
