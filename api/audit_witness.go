// audit_witness.go — periodically commits the audit-chain tail hash
// to GarudaChain as OP_RETURN, so that truncating the audit file
// would also require reorganizing the blockchain.
//
// This closes threat model gap §13.6 ("truncation of tail"). Pass #5
// gave us a tamper-evident chain inside a file; Pass #6 binds that
// file to an external trust anchor — the GarudaChain proof-of-work
// chain itself — so an attacker who deletes the last N audit lines
// cannot silently pretend those events never happened: the committed
// tail hash on chain still references them.
//
// Cost: one OP_RETURN per witness interval (default 5 min). At
// 10k sat fee and 12 commits/hour, ~1.2M sat/day ≈ 0.012 GRD/day.
// The goroutine is a no-op when GARUDA_WITNESS_INTERVAL is unset.
//
// OP_RETURN payload (49 bytes, well under the 80-byte limit):
//
//   offset 0..7  : magic "GRDAUDIT" (ASCII)
//   offset 8     : version byte (0x01)
//   offset 9..16 : seq (big-endian uint64)
//   offset 17..48: tail hash (raw 32 bytes)

package main

import (
	"encoding/binary"
	"encoding/hex"
	"fmt"
	"log"
	"math"
	"os"
	"path/filepath"
	"sync"
	"time"
)

const (
	witnessMagic   = "GRDAUDIT"
	witnessVersion = byte(0x01)
)

type witnessState struct {
	mu             sync.Mutex
	enabled        bool
	interval       time.Duration
	funderAddr     string
	logFile        *os.File
	lastSeq        int64
	lastTailHash   string
	commitsTotal   int64
	failuresTotal  int64
	lastCommitTime time.Time
	lastCommitTxid string
	stopCh         chan struct{}
}

var witness = &witnessState{}

// StartAuditWitness begins the periodic witness-commit goroutine.
// Call once at startup from main(), after the audit chain is open
// and after RPC clients are initialized.
//
// Configuration (all optional):
//   - GARUDA_WITNESS_INTERVAL — "5m", "30s", etc. If unset, feature is disabled.
//   - GARUDA_WITNESS_FUNDER   — address that pays the OP_RETURN fee.
//     Defaults to the treasury address in security config.
//   - GARUDA_WITNESS_LOG      — path to the witness log file. Defaults
//     to "<audit_file>.witness" if GARUDA_AUDIT_FILE is set, else off.
//
// If the audit chain is disabled, witnessing is also disabled (nothing
// to witness).
func StartAuditWitness() {
	intervalStr := os.Getenv("GARUDA_WITNESS_INTERVAL")
	if intervalStr == "" {
		log.Printf("[witness] disabled (GARUDA_WITNESS_INTERVAL unset)")
		return
	}
	interval, err := time.ParseDuration(intervalStr)
	if err != nil {
		log.Printf("[SECURITY WARN] witness disabled: bad GARUDA_WITNESS_INTERVAL %q: %v", sanitizeLog(intervalStr), err)
		return
	}
	if interval < 10*time.Second {
		log.Printf("[SECURITY WARN] witness disabled: interval %s too short (min 10s)", interval) // #nosec G706 -- time.Duration.String() is not user-controlled
		return
	}

	auditChain.mu.Lock()
	chainEnabled := auditChain.enabled
	auditChain.mu.Unlock()
	if !chainEnabled {
		log.Printf("[witness] disabled: audit chain is not enabled (set GARUDA_AUDIT_FILE)")
		return
	}

	funder := os.Getenv("GARUDA_WITNESS_FUNDER")
	if funder == "" {
		securityConfig.RLock()
		funder = securityConfig.TreasuryAddress
		securityConfig.RUnlock()
	}

	logPath := os.Getenv("GARUDA_WITNESS_LOG")
	if logPath == "" {
		if p := os.Getenv("GARUDA_AUDIT_FILE"); p != "" {
			logPath = p + ".witness"
		}
	}
	var logFile *os.File
	if logPath != "" {
		logPath = filepath.Clean(logPath)
		f, err := os.OpenFile(logPath, os.O_CREATE|os.O_APPEND|os.O_WRONLY, 0600)
		if err != nil {
			log.Printf("[SECURITY WARN] witness disabled: cannot open log %s: %v", sanitizeLog(logPath), err)
			return
		}
		logFile = f
	}

	witness.mu.Lock()
	witness.enabled = true
	witness.interval = interval
	witness.funderAddr = funder
	witness.logFile = logFile
	witness.stopCh = make(chan struct{})
	witness.mu.Unlock()

	log.Printf("[witness] enabled: interval=%s funder=%s log=%s", interval, sanitizeLog(funder), sanitizeLog(logPath)) // #nosec G706 -- funder+logPath sanitized; interval is time.Duration
	go runAuditWitnessLoop()
}

// StopAuditWitness signals the witness goroutine to exit and closes
// the log file. Safe to call when disabled. Used by tests.
func StopAuditWitness() {
	witness.mu.Lock()
	defer witness.mu.Unlock()
	if !witness.enabled {
		return
	}
	if witness.stopCh != nil {
		close(witness.stopCh)
		witness.stopCh = nil
	}
	if witness.logFile != nil {
		_ = witness.logFile.Sync()
		_ = witness.logFile.Close()
		witness.logFile = nil
	}
	witness.enabled = false
}

func runAuditWitnessLoop() {
	// Grab stop channel under the lock once; the channel identity
	// never changes for the lifetime of a single Start/Stop cycle.
	witness.mu.Lock()
	stopCh := witness.stopCh
	interval := witness.interval
	witness.mu.Unlock()
	if stopCh == nil {
		return
	}
	t := time.NewTicker(interval)
	defer t.Stop()
	// Fire once immediately so operators can verify end-to-end without
	// waiting the full interval on first startup.
	commitAuditTail()
	for {
		select {
		case <-stopCh:
			return
		case <-t.C:
			commitAuditTail()
		}
	}
}

// commitAuditTail snapshots the current audit chain tail and, if it
// has advanced since the last commit, broadcasts one OP_RETURN tx
// pinning (seq, tail_hash) to GarudaChain. Errors are logged but
// never kill the goroutine — witness failure must not cascade into
// the rest of the API.
func commitAuditTail() {
	auditChain.mu.Lock()
	seq := auditChain.seq
	tailHex := auditChain.prevHash
	auditChain.mu.Unlock()

	if seq <= 0 || tailHex == "" || tailHex == emptyHash {
		return // nothing to witness yet
	}

	witness.mu.Lock()
	if seq == witness.lastSeq && tailHex == witness.lastTailHash {
		witness.mu.Unlock()
		return // no advance since last commit
	}
	funder := witness.funderAddr
	witness.mu.Unlock()

	tailRaw, err := hex.DecodeString(tailHex)
	if err != nil || len(tailRaw) != 32 {
		log.Printf("[witness-err] invalid tail hash %q: %v", tailHex, err)
		return
	}

	payload := buildWitnessPayload(seq, tailRaw)
	payloadHex := hex.EncodeToString(payload)

	txid, err := broadcastOpReturn(payloadHex, funder)
	if err != nil {
		witness.mu.Lock()
		witness.failuresTotal++
		witness.mu.Unlock()
		log.Printf("[witness-err] broadcast failed for seq %d: %v", seq, err)
		return
	}

	// Mine one block on the CBDC node so the commit confirms immediately
	// under regtest. On a real chain this line is a no-op because the
	// commit will get mined in due course by network miners.
	cbdcNode.Call("generatetoaddress", []interface{}{1, funder})

	now := time.Now().UTC()
	witness.mu.Lock()
	witness.lastSeq = seq
	witness.lastTailHash = tailHex
	witness.commitsTotal++
	witness.lastCommitTime = now
	witness.lastCommitTxid = txid
	logFile := witness.logFile
	witness.mu.Unlock()

	// One JSONL line per commit. Not hash-chained itself — its purpose is
	// operator-readable provenance, not tamper-evidence (the commits are
	// anchored on GarudaChain, which IS tamper-evident).
	if logFile != nil {
		line := fmt.Sprintf(
			`{"time":"%s","seq":%d,"tail_hash":"%s","commit_txid":"%s","funder":"%s"}`+"\n",
			now.Format(time.RFC3339Nano), seq, tailHex, txid, funder,
		)
		_, _ = logFile.WriteString(line)
		_ = logFile.Sync()
	}
	log.Printf("[witness] committed seq=%d tail=%s… txid=%s", seq, tailHex[:12], txid)
}

// buildWitnessPayload packs the magic, version, seq, and tail hash
// into the 49-byte OP_RETURN payload format described at the top
// of this file.
func buildWitnessPayload(seq int64, tailRaw []byte) []byte {
	if seq < 0 {
		return nil
	}
	buf := make([]byte, 0, 49)
	buf = append(buf, []byte(witnessMagic)...)    // 8
	buf = append(buf, witnessVersion)             // 1
	var seqBuf [8]byte
	binary.BigEndian.PutUint64(seqBuf[:], uint64(seq)) // #nosec G115 -- guarded seq >= 0 above
	buf = append(buf, seqBuf[:]...)               // 8
	buf = append(buf, tailRaw...)                 // 32
	return buf
}

// parseWitnessPayload decodes a 49-byte OP_RETURN payload back to
// (seq, tail_hash_hex). Returns an error if magic/version/length
// don't match. Used by verification tools and tests.
func parseWitnessPayload(raw []byte) (int64, string, error) {
	if len(raw) != 49 {
		return 0, "", fmt.Errorf("witness payload: want 49 bytes, got %d", len(raw))
	}
	if string(raw[0:8]) != witnessMagic {
		return 0, "", fmt.Errorf("witness payload: bad magic %q", raw[0:8])
	}
	if raw[8] != witnessVersion {
		return 0, "", fmt.Errorf("witness payload: bad version 0x%02x", raw[8])
	}
	seqU := binary.BigEndian.Uint64(raw[9:17])
	if seqU > math.MaxInt64 {
		return 0, "", fmt.Errorf("witness payload: seq %d overflows int64", seqU)
	}
	seq := int64(seqU)
	tailHex := hex.EncodeToString(raw[17:49])
	return seq, tailHex, nil
}

// WitnessStatus is returned by /api/witness/status for ops dashboards.
type WitnessStatus struct {
	Enabled        bool   `json:"enabled"`
	Interval       string `json:"interval"`
	Funder         string `json:"funder"`
	LastSeq        int64  `json:"last_seq"`
	LastTailHash   string `json:"last_tail_hash"`
	CommitsTotal   int64  `json:"commits_total"`
	FailuresTotal  int64  `json:"failures_total"`
	LastCommitTime string `json:"last_commit_time,omitempty"`
	LastCommitTxid string `json:"last_commit_txid,omitempty"`
}

// GetWitnessStatus returns a snapshot of the current witness state,
// suitable for JSON serialization by a status endpoint or test.
func GetWitnessStatus() WitnessStatus {
	witness.mu.Lock()
	defer witness.mu.Unlock()
	s := WitnessStatus{
		Enabled:        witness.enabled,
		Interval:       witness.interval.String(),
		Funder:         witness.funderAddr,
		LastSeq:        witness.lastSeq,
		LastTailHash:   witness.lastTailHash,
		CommitsTotal:   witness.commitsTotal,
		FailuresTotal:  witness.failuresTotal,
		LastCommitTxid: witness.lastCommitTxid,
	}
	if !witness.lastCommitTime.IsZero() {
		s.LastCommitTime = witness.lastCommitTime.Format(time.RFC3339Nano)
	}
	return s
}
