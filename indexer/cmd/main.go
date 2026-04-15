package main

import (
	"bytes"
	"context"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"os"
	"os/signal"
	"strconv"
	"strings"
	"sync/atomic"
	"syscall"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/redis/go-redis/v9"

	"garuda-indexer/ratelimit"
	"garuda-indexer/ws"
)

// ─── Config ─────────────────────────────────────────────────────────

type Config struct {
	RPCURL   string
	RPCUser  string
	RPCPass  string
	PGDSN    string
	RedisURL string
	PollMs   int
}

func loadConfig() Config {
	return Config{
		RPCURL:   envOr("RPC_URL", "http://127.0.0.1:18443"),
		RPCUser:  envOr("RPC_USER", "garuda"),
		RPCPass:  envOr("RPC_PASS", "garudapass"),
		PGDSN:    envOr("PG_DSN", "postgres://garuda:garudapass@localhost:5432/garudachain?sslmode=disable"),
		RedisURL: envOr("REDIS_URL", "redis://localhost:6379/0"),
		PollMs:   envOrInt("POLL_MS", 1000),
	}
}

func envOr(k, def string) string {
	if v := os.Getenv(k); v != "" {
		return v
	}
	return def
}

func envOrInt(k string, def int) int {
	if v := os.Getenv(k); v != "" {
		n, err := strconv.Atoi(v)
		if err == nil {
			return n
		}
	}
	return def
}

// ─── Bitcoin RPC Client ─────���───────────────────────────────────────

type RPCClient struct {
	url, user, pass string
	client          *http.Client
	id              atomic.Uint64
}

func NewRPC(url, user, pass string) *RPCClient {
	return &RPCClient{url: url, user: user, pass: pass, client: &http.Client{Timeout: 30 * time.Second}}
}

func (c *RPCClient) Call(method string, params []interface{}) (json.RawMessage, error) {
	id := c.id.Add(1)
	body, _ := json.Marshal(map[string]interface{}{"jsonrpc": "1.0", "id": id, "method": method, "params": params})
	req, _ := http.NewRequest("POST", c.url, bytes.NewReader(body))
	req.SetBasicAuth(c.user, c.pass)
	req.Header.Set("Content-Type", "application/json")
	resp, err := c.client.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	raw, _ := io.ReadAll(resp.Body)
	var res struct {
		Result json.RawMessage `json:"result"`
		Error  *struct {
			Code    int    `json:"code"`
			Message string `json:"message"`
		} `json:"error"`
	}
	json.Unmarshal(raw, &res)
	if res.Error != nil {
		return nil, fmt.Errorf("rpc %s: %s", method, res.Error.Message)
	}
	return res.Result, nil
}

// ─── Block/TX types ────────────���────────────────────────────────────

type Block struct {
	Hash          string  `json:"hash"`
	PreviousHash  string  `json:"previousblockhash"`
	Height        int64   `json:"height"`
	Time          int64   `json:"time"`
	Size          int     `json:"size"`
	Tx            []TX    `json:"tx"`
}

type TX struct {
	Txid string  `json:"txid"`
	Hex  string  `json:"hex"`
	Size int     `json:"size"`
	Vin  []VIN   `json:"vin"`
	Vout []VOUT  `json:"vout"`
}

type VIN struct {
	Txid string `json:"txid"`
	Vout int    `json:"vout"`
}

type VOUT struct {
	Value        float64 `json:"value"`
	N            int     `json:"n"`
	ScriptPubKey struct {
		Hex     string   `json:"hex"`
		Address string   `json:"address"`
		Asm     string   `json:"asm"`
		Type    string   `json:"type"`
	} `json:"scriptPubKey"`
}

// ─── Indexer ─────────────────��──────────────────────────────────────

type Indexer struct {
	rpc   *RPCClient
	pg    *pgxpool.Pool
	rdb   *redis.Client
	ctx   context.Context
}

func main() {
	cfg := loadConfig()
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	// Connect PostgreSQL
	pgPool, err := pgxpool.New(ctx, cfg.PGDSN)
	if err != nil {
		log.Fatalf("PostgreSQL: %v", err)
	}
	defer pgPool.Close()
	if err := pgPool.Ping(ctx); err != nil {
		log.Fatalf("PostgreSQL ping: %v", err)
	}
	log.Println("PostgreSQL connected")

	// Connect Redis
	rdbOpts, err := redis.ParseURL(cfg.RedisURL)
	if err != nil {
		log.Fatalf("Redis URL: %v", err)
	}
	rdb := redis.NewClient(rdbOpts)
	if err := rdb.Ping(ctx).Err(); err != nil {
		log.Fatalf("Redis ping: %v", err)
	}
	log.Println("Redis connected")

	// RPC
	rpc := NewRPC(cfg.RPCURL, cfg.RPCUser, cfg.RPCPass)

	idx := &Indexer{rpc: rpc, pg: pgPool, rdb: rdb, ctx: ctx}

	// Get last indexed height
	lastHeight := idx.getLastIndexedHeight()
	log.Printf("Resuming from height %d", lastHeight)

	// Start SSE server for real-time events
	sseServer, err := ws.NewSSEServer(cfg.RedisURL)
	if err != nil {
		log.Fatalf("SSE server: %v", err)
	}
	go sseServer.Start(ctx)

	ssePort := envOr("SSE_PORT", "5100")
	sseMux := http.NewServeMux()
	sseMux.Handle("/events", sseServer)
	sseMux.HandleFunc("/health", func(w http.ResponseWriter, r *http.Request) {
		w.Write([]byte(`{"ok":true}`))
	})

	// Rate limiter: 100 req/sec burst, 50 req/sec sustained per IP
	limiter := ratelimit.New(50, 100, time.Second)

	go func() {
		log.Printf("SSE server listening on :%s (rate limited)", ssePort)
		if err := http.ListenAndServe(":"+ssePort, limiter.Middleware(sseMux)); err != nil {
			log.Printf("SSE server error: %v", err)
		}
	}()

	// Graceful shutdown
	sigCh := make(chan os.Signal, 1)
	signal.Notify(sigCh, syscall.SIGINT, syscall.SIGTERM)

	ticker := time.NewTicker(time.Duration(cfg.PollMs) * time.Millisecond)
	defer ticker.Stop()

	log.Println("Indexer started, polling every", cfg.PollMs, "ms")

	for {
		select {
		case <-sigCh:
			log.Println("Shutting down...")
			cancel()
			return
		case <-ticker.C:
			chainHeight := idx.getChainHeight()
			if chainHeight < 0 {
				continue
			}
			for h := lastHeight + 1; h <= chainHeight; h++ {
				if err := idx.indexBlock(h); err != nil {
					log.Printf("Error indexing block %d: %v", h, err)
					break
				}
				lastHeight = h
				if h%100 == 0 {
					log.Printf("Indexed block %d / %d", h, chainHeight)
				}
			}
		}
	}
}

func (idx *Indexer) getChainHeight() int64 {
	raw, err := idx.rpc.Call("getblockcount", nil)
	if err != nil {
		log.Printf("getblockcount: %v", err)
		return -1
	}
	var height int64
	json.Unmarshal(raw, &height)
	return height
}

func (idx *Indexer) getLastIndexedHeight() int64 {
	var val string
	err := idx.pg.QueryRow(idx.ctx,
		"SELECT value FROM indexer_state WHERE key = 'last_indexed_height'",
	).Scan(&val)
	if err != nil {
		return 0
	}
	h, _ := strconv.ParseInt(val, 10, 64)
	return h
}

func (idx *Indexer) setLastIndexedHeight(h int64) {
	idx.pg.Exec(idx.ctx,
		"UPDATE indexer_state SET value = $1, updated_at = NOW() WHERE key = 'last_indexed_height'",
		strconv.FormatInt(h, 10),
	)
}

func (idx *Indexer) indexBlock(height int64) error {
	// 1. Get block hash
	hashRaw, err := idx.rpc.Call("getblockhash", []interface{}{height})
	if err != nil {
		return fmt.Errorf("getblockhash %d: %w", height, err)
	}
	var hash string
	json.Unmarshal(hashRaw, &hash)

	// 2. Get full block with transactions (verbosity=2)
	blockRaw, err := idx.rpc.Call("getblock", []interface{}{hash, 2})
	if err != nil {
		return fmt.Errorf("getblock %d: %w", height, err)
	}
	var block Block
	json.Unmarshal(blockRaw, &block)

	ts := time.Unix(block.Time, 0).UTC()

	// 3. Insert block
	_, err = idx.pg.Exec(idx.ctx,
		`INSERT INTO blocks (height, hash, prev_hash, timestamp, tx_count, size_bytes)
		 VALUES ($1, $2, $3, $4, $5, $6)
		 ON CONFLICT (height) DO NOTHING`,
		height, block.Hash, block.PreviousHash, ts, len(block.Tx), block.Size,
	)
	if err != nil {
		return fmt.Errorf("insert block %d: %w", height, err)
	}

	// 4. Process transactions
	for _, tx := range block.Tx {
		if err := idx.indexTx(tx, height, block.Hash, ts); err != nil {
			log.Printf("Error indexing tx %s in block %d: %v", tx.Txid, height, err)
		}
	}

	// 5. Update indexer state
	idx.setLastIndexedHeight(height)

	// 6. Update Redis cache for latest block
	idx.rdb.Set(idx.ctx, "chain:height", height, 0)
	idx.rdb.Set(idx.ctx, "chain:latest_hash", block.Hash, 0)

	// 7. Publish block event for real-time SSE clients
	blockEvt, _ := json.Marshal(map[string]interface{}{
		"height": height, "hash": block.Hash, "tx_count": len(block.Tx), "timestamp": ts.Unix(),
	})
	idx.rdb.Publish(idx.ctx, "blocks", blockEvt)

	return nil
}

func (idx *Indexer) indexTx(tx TX, blockHeight int64, blockHash string, ts time.Time) error {
	// Detect tx type from OP_RETURN data
	txType := "transfer"
	for _, vout := range tx.Vout {
		if vout.ScriptPubKey.Type == "nulldata" {
			opData := parseOPReturn(vout.ScriptPubKey.Hex)
			if strings.HasPrefix(opData, "DEX:") || strings.HasPrefix(opData, "ORDER:") {
				txType = "order"
			} else if strings.HasPrefix(opData, "SWAP:") {
				txType = "swap"
			} else if strings.HasPrefix(opData, "MINT:") || strings.HasPrefix(opData, "ISSUE:") {
				txType = "mint"
			}
		}
	}

	// Insert transaction
	_, err := idx.pg.Exec(idx.ctx,
		`INSERT INTO transactions (txid, block_height, block_hash, raw_hex, fee_sat, size_bytes, timestamp, tx_type)
		 VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
		 ON CONFLICT (txid) DO NOTHING`,
		tx.Txid, blockHeight, blockHash, tx.Hex, 0, tx.Size, ts, txType,
	)
	if err != nil {
		return err
	}

	// Process VINs — mark UTXOs as spent
	for _, vin := range tx.Vin {
		if vin.Txid == "" {
			continue // coinbase
		}
		idx.pg.Exec(idx.ctx,
			`UPDATE utxos SET spent = true, spent_txid = $1 WHERE txid = $2 AND vout = $3`,
			tx.Txid, vin.Txid, vin.Vout,
		)
	}

	// Process VOUTs — create UTXOs and update balances
	for _, vout := range tx.Vout {
		addr := vout.ScriptPubKey.Address
		if addr == "" {
			continue
		}
		valueSat := int64(vout.Value * 1e8)

		// Upsert address
		idx.pg.Exec(idx.ctx,
			`INSERT INTO addresses (address, balance_sat, tx_count, first_seen, last_seen, updated_at)
			 VALUES ($1, $2, 1, $3, $3, NOW())
			 ON CONFLICT (address) DO UPDATE SET
			   balance_sat = addresses.balance_sat + $2,
			   tx_count = addresses.tx_count + 1,
			   last_seen = $3,
			   updated_at = NOW()`,
			addr, valueSat, ts,
		)

		// Insert UTXO
		idx.pg.Exec(idx.ctx,
			`INSERT INTO utxos (txid, vout, address, value_sat, script_hex, block_height)
			 VALUES ($1, $2, $3, $4, $5, $6)
			 ON CONFLICT (txid, vout) DO NOTHING`,
			tx.Txid, vout.N, addr, valueSat, vout.ScriptPubKey.Hex, blockHeight,
		)

		// Update Redis balance cache
		idx.rdb.Set(idx.ctx, fmt.Sprintf("bal:%s", addr), 0, 0) // invalidate; API recalculates
	}

	// Deduct spent amounts from addresses
	for _, vin := range tx.Vin {
		if vin.Txid == "" {
			continue
		}
		// Look up the spent UTXO to find address and value
		var spentAddr string
		var spentVal int64
		err := idx.pg.QueryRow(idx.ctx,
			`SELECT address, value_sat FROM utxos WHERE txid = $1 AND vout = $2`,
			vin.Txid, vin.Vout,
		).Scan(&spentAddr, &spentVal)
		if err == nil && spentAddr != "" {
			idx.pg.Exec(idx.ctx,
				`UPDATE addresses SET balance_sat = balance_sat - $1, updated_at = NOW() WHERE address = $2`,
				spentVal, spentAddr,
			)
		}
	}

	return nil
}

func parseOPReturn(scriptHex string) string {
	// OP_RETURN scripts: 6a <pushdata> <data>
	raw, err := hex.DecodeString(scriptHex)
	if err != nil || len(raw) < 3 || raw[0] != 0x6a {
		return ""
	}
	// Skip OP_RETURN (0x6a) + push length byte
	data := raw[2:]
	if len(data) > 0 && int(raw[1]) <= len(data) {
		data = data[:raw[1]]
	}
	return string(data)
}
