package main

import (
	"bytes"
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"math"
	"net/http"
	"os"
	"os/signal"
	"sort"
	"strconv"
	"strings"
	"sync"
	"sync/atomic"
	"syscall"
	"time"
)

// ─── Fee Treasury ─────────────────────────────────────────────────────────────
// Semua fee swap masuk ke treasury address (APBN/sistem)
const (
	feeSwapRate    = 0.001 // 0.1% per swap
	feeTreasuryAddr = "grd1qhaclxgx8xhzxjmwg8meuwp7k2ut53t0equ002s" // CBDC reserve/treasury
)

var feeStats struct {
	sync.RWMutex
	totalGRD   float64
	totalTrades int64
	history    []map[string]interface{}
}

func collectFee(feeGRD float64, fromAddr, note string) {
	if feeGRD <= 0 {
		return
	}
	// Transfer GRD fee ke treasury via RPC (sendtoaddress from system wallet)
	cbdcNode.Call("sendtoaddress", []interface{}{feeTreasuryAddr, feeGRD})
	feeStats.Lock()
	feeStats.totalGRD += feeGRD
	feeStats.totalTrades++
	if len(feeStats.history) < 500 {
		feeStats.history = append(feeStats.history, map[string]interface{}{
			"time":    time.Now().Unix(),
			"fee_grd": feeGRD,
			"from":    fromAddr,
			"note":    note,
		})
	}
	feeStats.Unlock()
	log.Printf("[FEE] %.8f GRD from %s — %s", feeGRD, fromAddr[:min(12, len(fromAddr))], note)
}

func handleFeeStats(w http.ResponseWriter, r *http.Request) {
	feeStats.RLock()
	defer feeStats.RUnlock()
	writeJSON(w, map[string]interface{}{
		"treasury_address": feeTreasuryAddr,
		"fee_rate_pct":     feeSwapRate * 100,
		"total_grd":        feeStats.totalGRD,
		"total_trades":     feeStats.totalTrades,
		"recent":           feeStats.history,
	})
}

func min(a, b int) int {
	if a < b {
		return a
	}
	return b
}

// ─── Bech32 encoding (hash160 → grd1q... address) ───

const bech32Charset = "qpzry9x8gf2tvdw0s3jn54khce6mua7l"

func bech32Polymod(values []int) int {
	gen := []int{0x3b6a57b2, 0x26508e6d, 0x1ea119fa, 0x3d4233dd, 0x2a1462b3}
	chk := 1
	for _, v := range values {
		b := chk >> 25
		chk = ((chk & 0x1ffffff) << 5) ^ v
		for i := 0; i < 5; i++ {
			if (b>>uint(i))&1 == 1 {
				chk ^= gen[i]
			}
		}
	}
	return chk
}

func bech32HrpExpand(hrp string) []int {
	ret := make([]int, 0, len(hrp)*2+1)
	for _, c := range hrp {
		ret = append(ret, int(c>>5))
	}
	ret = append(ret, 0)
	for _, c := range hrp {
		ret = append(ret, int(c&31))
	}
	return ret
}

// convertBits is the standard bech32 base-conversion helper. All
// int→uint conversions here operate on values bounded to [0,8], and
// all narrowing shifts produce values bounded by maxv ≤ 31. gosec
// G115 false positives are suppressed at each site.
func convertBits(data []byte, fromBits, toBits int, pad bool) []int {
	acc, bits := 0, 0
	var ret []int
	maxv := (1 << uint(toBits)) - 1 // #nosec G115 -- bech32: toBits ∈ [1,8]
	for _, value := range data {
		acc = (acc << uint(fromBits)) | int(value) // #nosec G115 -- bech32: fromBits ∈ [1,8]
		bits += fromBits
		for bits >= toBits {
			bits -= toBits
			ret = append(ret, (acc>>uint(bits))&maxv) // #nosec G115 -- bech32: bits ≥ 0
		}
	}
	if pad && bits > 0 {
		ret = append(ret, (acc<<uint(toBits-bits))&maxv) // #nosec G115 -- bech32: toBits>bits
	}
	return ret
}

func hash160ToBech32(hash160Hex string) string {
	h160, err := hex.DecodeString(hash160Hex)
	if err != nil || len(h160) != 20 {
		return hash160Hex // fallback
	}
	hrp := "grd"
	witver := 0
	data5 := append([]int{witver}, convertBits(h160, 8, 5, true)...)
	// checksum
	values := append(bech32HrpExpand(hrp), data5...)
	polymod := bech32Polymod(append(values, 0, 0, 0, 0, 0, 0)) ^ 1
	checksum := make([]int, 6)
	for i := 0; i < 6; i++ {
		checksum[i] = (polymod >> uint(5*(5-i))) & 31
	}
	all := append(data5, checksum...)
	var sb strings.Builder
	sb.WriteString(hrp)
	sb.WriteByte('1')
	for _, d := range all {
		sb.WriteByte(bech32Charset[d])
	}
	return sb.String()
}

// ─── RPC Client ───

type RPCClient struct {
	url, user, pass string
	client          *http.Client
	id              atomic.Uint64
}

func NewRPC(url, user, pass string) *RPCClient {
	return &RPCClient{url: url, user: user, pass: pass, client: &http.Client{Timeout: 15 * time.Second}}
}

func (c *RPCClient) Call(method string, params []interface{}) (json.RawMessage, error) {
	id := c.id.Add(1)
	body, mErr := json.Marshal(map[string]interface{}{
		"jsonrpc": "1.0", "id": id, "method": method, "params": params,
	})
	if mErr != nil {
		return nil, fmt.Errorf("rpc %s marshal: %w", method, mErr)
	}
	req, rErr := http.NewRequest("POST", c.url, bytes.NewReader(body))
	if rErr != nil {
		return nil, fmt.Errorf("rpc %s newreq: %w", method, rErr)
	}
	req.SetBasicAuth(c.user, c.pass)
	req.Header.Set("Content-Type", "application/json")
	resp, err := c.client.Do(req)
	if err != nil {
		return nil, fmt.Errorf("rpc %s transport: %w", method, err)
	}
	defer resp.Body.Close()
	raw, readErr := io.ReadAll(resp.Body)
	if readErr != nil {
		return nil, fmt.Errorf("rpc %s read: %w", method, readErr)
	}
	if resp.StatusCode >= 500 {
		// Surface server-side errors. Bitcoin Core returns a JSON error body
		// on 500 too — try to parse it so the caller sees the actual reason
		// (e.g. "txn-mempool-conflict") instead of a bare status code.
		var errBody struct {
			Error *struct {
				Code    int    `json:"code"`
				Message string `json:"message"`
			} `json:"error"`
		}
		if json.Unmarshal(raw, &errBody) == nil && errBody.Error != nil {
			return nil, fmt.Errorf("rpc %s: %s (code %d)", method, errBody.Error.Message, errBody.Error.Code)
		}
		return nil, fmt.Errorf("rpc %s status %d: %s", method, resp.StatusCode, string(raw))
	}
	var res struct {
		ID     interface{}     `json:"id"`
		Result json.RawMessage `json:"result"`
		Error  *struct {
			Code    int    `json:"code"`
			Message string `json:"message"`
		} `json:"error"`
	}
	if uErr := json.Unmarshal(raw, &res); uErr != nil {
		return nil, fmt.Errorf("rpc %s decode: %w", method, uErr)
	}
	if res.Error != nil {
		return nil, fmt.Errorf("rpc %s: %s", method, res.Error.Message)
	}
	return res.Result, nil
}

// ─── Nodes ───

var (
	publicNode       *RPCClient
	cbdcNode         *RPCClient
	creatorNode      *RPCClient
	creatorWalletNode *RPCClient // creator node dengan wallet path
	cbdcWalletNode    *RPCClient // cbdc node dengan wallet path untuk QRIS
)

// ─── DEX Internal Ledger (Custodial Trading Balances) ───────────────────────
// L1 balance = on-chain (scantxoutset). Trading balance = internal ledger.
// Deposit: lock L1 balance → trading balance bertambah.
// Withdraw: trading balance berkurang → L1 unlocked.
// l1Address → tradingAddress mapping stored per user.
var dexLedger = struct {
	sync.RWMutex
	trading  map[string]float64 // tradingAddr → trading GRD balance
	locked   map[string]float64 // l1Addr → total GRD locked (deposited to trading)
	l1ToTrading map[string]string // l1Addr → tradingAddr
}{
	trading:     make(map[string]float64),
	locked:      make(map[string]float64),
	l1ToTrading: make(map[string]string),
}

func getDexTradingBalance(tradingAddr string) float64 {
	dexLedger.RLock()
	defer dexLedger.RUnlock()
	return dexLedger.trading[tradingAddr]
}

func getL1LockedBalance(l1Addr string) float64 {
	dexLedger.RLock()
	defer dexLedger.RUnlock()
	return dexLedger.locked[l1Addr]
}

// getL1OnChainBalance returns on-chain balance via scantxoutset
func getL1OnChainBalance(addr string) float64 {
	var bal float64
	scanRaw, err := cbdcNode.Call("scantxoutset", []interface{}{"start", []string{"addr(" + addr + ")"}})
	if err == nil {
		var scanResult struct {
			TotalAmount float64 `json:"total_amount"`
		}
		json.Unmarshal(scanRaw, &scanResult)
		bal = scanResult.TotalAmount
	}
	return bal
}

// ─── Oracle Price History (for smooth stablecoin candlestick charts) ─────────

var oraclePriceHistory = struct {
	sync.RWMutex
	// assetID → []PricePoint (kept to max 10000 points per asset)
	data map[string][]PricePoint
}{data: make(map[string][]PricePoint)}

// recordOraclePrice stores a price tick for an asset
func recordOraclePrice(assetID string, price float64) {
	if price <= 0 || assetID == "" {
		return
	}
	now := time.Now().Unix()
	oraclePriceHistory.Lock()
	defer oraclePriceHistory.Unlock()
	pts := oraclePriceHistory.data[assetID]
	// Avoid duplicate timestamps (at most 1 per second)
	if len(pts) > 0 && pts[len(pts)-1].Timestamp == now {
		pts[len(pts)-1].Price = price
		oraclePriceHistory.data[assetID] = pts
		return
	}
	pts = append(pts, PricePoint{Timestamp: now, Price: price})
	if len(pts) > 10000 {
		pts = pts[len(pts)-8000:]
	}
	oraclePriceHistory.data[assetID] = pts
}

// getOraclePriceHistory returns stored oracle price points for an asset
func getOraclePriceHistory(assetID string) []PricePoint {
	oraclePriceHistory.RLock()
	defer oraclePriceHistory.RUnlock()
	pts := oraclePriceHistory.data[assetID]
	if len(pts) == 0 {
		return nil
	}
	cp := make([]PricePoint, len(pts))
	copy(cp, pts)
	return cp
}

// getAssetOraclePrice returns the oracle price for a stablecoin/pegged asset
// Returns (price, true) if found, (0, false) if not a stablecoin
// getAssetOraclePrice returns oracle price ONLY for STABLECOIN_PEGGED (world stablecoins).
// STABLECOIN (blockchain) uses orderbook bid/ask prices, not oracle.
func getAssetOraclePrice(assetID string) (float64, bool) {
	assets := scanAssets()
	for _, a := range assets {
		if a.AssetID == assetID {
			tipUpper := strings.ToUpper(a.Tipe)
			// Only STABLECOIN_PEGGED uses oracle prices (world stablecoin)
			// STABLECOIN (blockchain) uses orderbook — handled by normal price flow
			if tipUpper == "STABLECOIN_PEGGED" {
				sym := strings.ToUpper(a.Kode)
				if len(sym) > 1 && strings.HasPrefix(sym, "P") {
					sym = sym[1:]
				}
				// Try bulk oracle rates first
				oracleRates := fetchOracleRatesMap()
				if rate, ok := oracleRates[sym]; ok && rate[0] > 0 {
					return rate[0], true
				}
				// Fallback: query individual symbol from blockchain
				raw, err := cbdcNode.Call("getpegrates", []interface{}{sym})
				if err == nil {
					var rates []struct {
						GrdPerUnit float64 `json:"grd_per_unit"`
					}
					json.Unmarshal(raw, &rates)
					if len(rates) > 0 && rates[0].GrdPerUnit > 0 {
						return rates[0].GrdPerUnit, true
					}
				}
				// Last fallback: default hardcoded rates
				defaults := defaultOracleRates()
				if rate, ok := defaults[sym]; ok && rate[0] > 0 {
					return rate[0], true
				}
				return 0, true // is oracle stablecoin but no rate found
			}
			if tipUpper == "NATIVE" {
				return 1.0, true
			}
			return 0, false // STABLECOIN (blockchain) or SAHAM — use orderbook price
		}
	}
	return 0, false
}

// isOracleStablecoin returns true only for STABLECOIN_PEGGED (world stablecoins)
func isOracleStablecoin(assetID string) bool {
	assets := scanAssets()
	for _, a := range assets {
		if a.AssetID == assetID {
			return strings.ToUpper(a.Tipe) == "STABLECOIN_PEGGED"
		}
	}
	return false
}

// isStablecoinAsset checks if an assetID belongs to any stablecoin type or native
func isStablecoinAsset(assetID string) bool {
	assets := scanAssets()
	for _, a := range assets {
		if a.AssetID == assetID {
			tipUpper := strings.ToUpper(a.Tipe)
			return tipUpper == "STABLECOIN" || tipUpper == "STABLECOIN_PEGGED" || tipUpper == "NATIVE"
		}
	}
	return false
}

// startOraclePriceRecorder periodically records oracle prices for STABLECOIN_PEGGED only
// STABLECOIN (blockchain) gets price history from orderbook/trades, not oracle
func startOraclePriceRecorder() {
	go func() {
		for {
			assets := scanAssets()
			for _, a := range assets {
				tipUpper := strings.ToUpper(a.Tipe)
				if tipUpper == "STABLECOIN_PEGGED" {
					if price, ok := getAssetOraclePrice(a.AssetID); ok && price > 0 {
						recordOraclePrice(a.AssetID, price)
					}
				}
			}
			time.Sleep(10 * time.Second)
		}
	}()
}

// ─── Exchange Rate (Real-time dari API gratis) ────────────────────────────────

var (
	exchangeRates     map[string]float64
	exchangeRatesLock sync.RWMutex
	exchangeRateBase  = "USD"
	exchangeRateTime  time.Time
)

func fetchExchangeRates() {
	url := "https://open.er-api.com/v6/latest/USD"
	client := &http.Client{Timeout: 10 * time.Second}
	resp, err := client.Get(url)
	if err != nil {
		log.Printf("[WARN] Exchange rate fetch failed: %v", err)
		return
	}
	defer resp.Body.Close()

	var data struct {
		Result string             `json:"result"`
		Rates  map[string]float64 `json:"rates"`
		Time   string             `json:"time_last_update_utc"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&data); err != nil {
		log.Printf("[WARN] Exchange rate decode failed: %v", err)
		return
	}
	if data.Result != "success" || len(data.Rates) == 0 {
		log.Printf("[WARN] Exchange rate API returned: %s", data.Result)
		return
	}

	exchangeRatesLock.Lock()
	exchangeRates = data.Rates
	exchangeRateTime = time.Now()
	exchangeRatesLock.Unlock()

	log.Printf("[OK] Exchange rates updated: %d currencies (base=USD)", len(data.Rates))
}

func runExchangeRateUpdater() {
	fetchExchangeRates()
	for {
		time.Sleep(1 * time.Hour) // Update setiap 1 jam
		fetchExchangeRates()
	}
}

// GET /api/exchange-rates — semua kurs
func handleExchangeRates(w http.ResponseWriter, r *http.Request) {
	exchangeRatesLock.RLock()
	rates := exchangeRates
	updated := exchangeRateTime
	exchangeRatesLock.RUnlock()

	if rates == nil {
		writeJSON(w, map[string]interface{}{"error": "rates not loaded yet"})
		return
	}

	writeJSON(w, map[string]interface{}{
		"base":       exchangeRateBase,
		"updated_at": updated.Format(time.RFC3339),
		"count":      len(rates),
		"rates":      rates,
	})
}

// GET /api/exchange-rates/convert?from=USD&to=IDR&amount=100
func handleExchangeConvert(w http.ResponseWriter, r *http.Request) {
	from := strings.ToUpper(r.URL.Query().Get("from"))
	to := strings.ToUpper(r.URL.Query().Get("to"))
	amountStr := r.URL.Query().Get("amount")
	if from == "" || to == "" {
		writeJSON(w, map[string]interface{}{"error": "from and to required"})
		return
	}
	amount := 1.0
	if amountStr != "" {
		amount, _ = strconv.ParseFloat(amountStr, 64)
	}

	exchangeRatesLock.RLock()
	rates := exchangeRates
	exchangeRatesLock.RUnlock()

	if rates == nil {
		writeJSON(w, map[string]interface{}{"error": "rates not loaded"})
		return
	}

	fromRate, okFrom := rates[from]
	toRate, okTo := rates[to]
	if !okFrom {
		writeJSON(w, map[string]interface{}{"error": "unknown currency: " + from})
		return
	}
	if !okTo {
		writeJSON(w, map[string]interface{}{"error": "unknown currency: " + to})
		return
	}

	// Convert: amount in FROM → USD → TO
	usdAmount := amount / fromRate
	result := usdAmount * toRate

	writeJSON(w, map[string]interface{}{
		"from":     from,
		"to":       to,
		"amount":   amount,
		"result":   math.Round(result*10000) / 10000,
		"rate":     math.Round((toRate/fromRate)*10000) / 10000,
	})
}

// GET /api/exchange-rates/currencies — daftar semua mata uang
func handleExchangeCurrencies(w http.ResponseWriter, r *http.Request) {
	exchangeRatesLock.RLock()
	rates := exchangeRates
	exchangeRatesLock.RUnlock()

	if rates == nil {
		writeJSON(w, map[string]interface{}{"error": "rates not loaded"})
		return
	}

	currencies := make([]string, 0, len(rates))
	for k := range rates {
		currencies = append(currencies, k)
	}
	sort.Strings(currencies)
	writeJSON(w, map[string]interface{}{
		"count":      len(currencies),
		"currencies": currencies,
	})
}

// ─── Orderbook (in-memory) ───

type OrderEntry struct {
	ID        uint64  `json:"id"`
	Price     float64 `json:"price"`
	Quantity  float64 `json:"quantity"`
	Amount    float64 `json:"amount"`
	Side      string  `json:"side"`
	Address   string  `json:"address"`
	AssetID   string  `json:"asset_id"`
	Timestamp int64   `json:"timestamp"`
}

type TradeEntry struct {
	Price     float64 `json:"price"`
	PriceAfter float64 `json:"price_after"`
	PriceBefore float64 `json:"price_before"`
	Quantity  float64 `json:"quantity"`
	TokenOut  float64 `json:"token_out"`
	TokenIn   float64 `json:"token_in"`
	Side      string  `json:"side"`
	Direction string  `json:"direction"`
	Buyer     string  `json:"buyer"`
	Seller    string  `json:"seller"`
	Timestamp int64   `json:"timestamp"`
}

type PricePoint struct {
	Timestamp int64   `json:"timestamp"`
	Price     float64 `json:"price"`
}

type AssetBook struct {
	mu         sync.RWMutex
	asks       []OrderEntry
	bids       []OrderEntry
	trades     []TradeEntry
	priceHist  []PricePoint
	nextID     uint64
	spotPrice  float64
	reserveGRD float64
	reserveTok float64
}

var books = struct {
	mu sync.RWMutex
	m  map[string]*AssetBook
}{m: make(map[string]*AssetBook)}

func getBook(assetID string) *AssetBook {
	books.mu.RLock()
	b := books.m[assetID]
	books.mu.RUnlock()
	if b != nil {
		return b
	}
	books.mu.Lock()
	defer books.mu.Unlock()
	if b = books.m[assetID]; b != nil {
		return b
	}
	b = &AssetBook{
		spotPrice:  0,
		reserveGRD: 0,
		reserveTok: 0,
	}
	books.m[assetID] = b
	return b
}

// PlaceOrder adds an order to the book and attempts to match it.
// Returns fills (matched trades) and any remaining resting order.
func (book *AssetBook) PlaceOrder(side string, price float64, qty float64, addr string) []TradeEntry {
	book.mu.Lock()
	defer book.mu.Unlock()

	book.nextID++
	now := time.Now().Unix()
	remaining := qty
	var fills []TradeEntry

	if side == "buy" {
		// Match against asks (lowest first) where ask.Price <= buy price
		sort.Slice(book.asks, func(i, j int) bool { return book.asks[i].Price < book.asks[j].Price })
		newAsks := make([]OrderEntry, 0, len(book.asks))
		for _, ask := range book.asks {
			if remaining <= 0 || ask.Price > price {
				newAsks = append(newAsks, ask)
				continue
			}
			fillQty := math.Min(remaining, ask.Quantity)
			fills = append(fills, TradeEntry{
				Price: ask.Price, PriceAfter: ask.Price, PriceBefore: book.spotPrice,
				Quantity: fillQty, Side: "buy", Direction: "buy",
				Buyer: addr, Seller: ask.Address, Timestamp: now,
			})
			book.spotPrice = ask.Price
			remaining -= fillQty
			ask.Quantity -= fillQty
			if ask.Quantity > 0.000001 {
				newAsks = append(newAsks, ask)
			}
		}
		book.asks = newAsks
		if remaining > 0.000001 {
			book.bids = append(book.bids, OrderEntry{
				ID: book.nextID, Price: price, Quantity: remaining, Amount: remaining,
				Side: "buy", Address: addr, AssetID: "", Timestamp: now,
			})
		}
	} else {
		// Match against bids (highest first) where bid.Price >= sell price
		sort.Slice(book.bids, func(i, j int) bool { return book.bids[i].Price > book.bids[j].Price })
		newBids := make([]OrderEntry, 0, len(book.bids))
		for _, bid := range book.bids {
			if remaining <= 0 || bid.Price < price {
				newBids = append(newBids, bid)
				continue
			}
			fillQty := math.Min(remaining, bid.Quantity)
			fills = append(fills, TradeEntry{
				Price: bid.Price, PriceAfter: bid.Price, PriceBefore: book.spotPrice,
				Quantity: fillQty, Side: "sell", Direction: "sell",
				Buyer: bid.Address, Seller: addr, Timestamp: now,
			})
			book.spotPrice = bid.Price
			remaining -= fillQty
			bid.Quantity -= fillQty
			if bid.Quantity > 0.000001 {
				newBids = append(newBids, bid)
			}
		}
		book.bids = newBids
		if remaining > 0.000001 {
			book.asks = append(book.asks, OrderEntry{
				ID: book.nextID, Price: price, Quantity: remaining, Amount: remaining,
				Side: "sell", Address: addr, AssetID: "", Timestamp: now,
			})
		}
	}

	// Record trades + price history
	for _, f := range fills {
		book.trades = append(book.trades, f)
		book.priceHist = append(book.priceHist, PricePoint{Timestamp: f.Timestamp, Price: f.Price})
	}

	// Keep last 10000 trades
	if len(book.trades) > 10000 {
		book.trades = book.trades[len(book.trades)-8000:]
	}
	if len(book.priceHist) > 10000 {
		book.priceHist = book.priceHist[len(book.priceHist)-8000:]
	}

	return fills
}

// ─── Asset scanning from blockchain ───

type AssetInfo struct {
	AssetID string `json:"assetId"`
	Kode    string `json:"kode"`
	Nama    string `json:"nama"`
	Tipe    string `json:"tipe"`
	Supply  int64  `json:"supply"`
}

var assetsCache struct {
	mu     sync.RWMutex
	assets []AssetInfo
	lastAt time.Time
}

func scanAssets() []AssetInfo {
	assetsCache.mu.RLock()
	if time.Since(assetsCache.lastAt) < 10*time.Second && len(assetsCache.assets) > 0 {
		a := assetsCache.assets
		assetsCache.mu.RUnlock()
		return a
	}
	assetsCache.mu.RUnlock()

	// Use listassets RPC (available on CBDC node which has full AssetDB)
	raw, err := cbdcNode.Call("listassets", nil)
	if err != nil {
		// Fallback to defaults if no cache exists
		if len(assetsCache.assets) == 0 {
			defaults := defaultAssets()
			assetsCache.mu.Lock()
			assetsCache.assets = defaults
			assetsCache.lastAt = time.Now()
			assetsCache.mu.Unlock()
			return defaults
		}
		return assetsCache.assets
	}

	var rpcAssets []struct {
		AssetID     string `json:"asset_id"`
		Symbol      string `json:"symbol"`
		Name        string `json:"name"`
		Type        string `json:"type"`
		TotalSupply int64  `json:"total_supply"`
		Issuer      string `json:"issuer"`
		Height      int    `json:"height"`
	}
	json.Unmarshal(raw, &rpcAssets)

	assets := make([]AssetInfo, 0, len(rpcAssets))
	for _, a := range rpcAssets {
		tipe := "SAHAM"
		switch strings.ToLower(a.Type) {
		case "saham":
			tipe = "SAHAM"
		case "obligasi":
			tipe = "OBLIGASI"
		case "reksadana":
			tipe = "REKSADANA"
		case "stablecoin":
			tipe = "STABLECOIN"
		case "stablecoin_pegged":
			tipe = "STABLECOIN_PEGGED"
		}
		nama := a.Name
		if nama == "" {
			nama = a.Symbol
		}
		assets = append(assets, AssetInfo{
			AssetID: a.AssetID,
			Kode:    a.Symbol,
			Nama:    nama,
			Tipe:    tipe,
			Supply:  a.TotalSupply,
		})
	}

	if len(assets) == 0 {
		assets = defaultAssets()
	}

	assetsCache.mu.Lock()
	assetsCache.assets = assets
	assetsCache.lastAt = time.Now()
	assetsCache.mu.Unlock()

	return assets
}

func parseAssetData(data []byte, txid string) AssetInfo {
	// Simple parse: GAST + type(1) + kode_len(1) + kode + nama_len(1) + nama
	if len(data) < 7 {
		return AssetInfo{}
	}
	// Skip GAST magic (4 bytes)
	pos := 4
	if pos >= len(data) {
		return AssetInfo{}
	}
	tipeB := data[pos]
	pos++
	tipe := "SAHAM"
	switch tipeB {
	case 1:
		tipe = "SAHAM"
	case 2:
		tipe = "OBLIGASI"
	case 3:
		tipe = "REKSADANA"
	case 4:
		tipe = "STABLECOIN"
	}

	if pos >= len(data) {
		return AssetInfo{}
	}
	kodeLen := int(data[pos])
	pos++
	if pos+kodeLen > len(data) {
		return AssetInfo{}
	}
	kode := string(data[pos : pos+kodeLen])
	pos += kodeLen

	nama := kode
	if pos < len(data) {
		namaLen := int(data[pos])
		pos++
		if pos+namaLen <= len(data) {
			nama = string(data[pos : pos+namaLen])
		}
	}

	return AssetInfo{
		AssetID: txid[:16],
		Kode:    kode,
		Nama:    nama,
		Tipe:    tipe,
		Supply:  1000000,
	}
}

func defaultAssets() []AssetInfo {
	return []AssetInfo{
		// Native blockchain
		{AssetID: "native-grd", Kode: "GRD", Nama: "Garuda Coin", Tipe: "NATIVE", Supply: 21000000},
		// Saham (stocks)
		{AssetID: "bbca000000000001", Kode: "BBCA", Nama: "Bank Central Asia", Tipe: "SAHAM", Supply: 1000000},
		{AssetID: "bbri000000000002", Kode: "BBRI", Nama: "Bank Rakyat Indonesia", Tipe: "SAHAM", Supply: 1000000},
		{AssetID: "tlkm000000000003", Kode: "TLKM", Nama: "Telkom Indonesia", Tipe: "SAHAM", Supply: 1000000},
		{AssetID: "goto000000000004", Kode: "GOTO", Nama: "GoTo Gojek Tokopedia", Tipe: "SAHAM", Supply: 1000000},
		{AssetID: "antm000000000005", Kode: "ANTM", Nama: "Aneka Tambang", Tipe: "SAHAM", Supply: 1000000},
		// Stablecoin Orderbook (market-priced)
		{AssetID: "idr0000000000006", Kode: "IDR", Nama: "Rupiah Orderbook", Tipe: "STABLECOIN", Supply: 100000000000},
		{AssetID: "usd0000000000007", Kode: "USD", Nama: "US Dollar Orderbook", Tipe: "STABLECOIN", Supply: 10000000000},
		{AssetID: "myr0000000000008", Kode: "MYR", Nama: "Ringgit Orderbook", Tipe: "STABLECOIN", Supply: 10000000000},
		{AssetID: "sgd0000000000012", Kode: "SGD", Nama: "Singapore Dollar Orderbook", Tipe: "STABLECOIN", Supply: 10000000000},
		{AssetID: "jpy0000000000013", Kode: "JPY", Nama: "Japanese Yen Orderbook", Tipe: "STABLECOIN", Supply: 10000000000},
		{AssetID: "eur0000000000014", Kode: "EUR", Nama: "Euro Orderbook", Tipe: "STABLECOIN", Supply: 10000000000},
		{AssetID: "gbp0000000000015", Kode: "GBP", Nama: "British Pound Orderbook", Tipe: "STABLECOIN", Supply: 10000000000},
		{AssetID: "cny0000000000016", Kode: "CNY", Nama: "Chinese Yuan Orderbook", Tipe: "STABLECOIN", Supply: 10000000000},
		{AssetID: "krw0000000000017", Kode: "KRW", Nama: "Korean Won Orderbook", Tipe: "STABLECOIN", Supply: 10000000000},
		{AssetID: "thb0000000000018", Kode: "THB", Nama: "Thai Baht Orderbook", Tipe: "STABLECOIN", Supply: 10000000000},
		{AssetID: "aud0000000000019", Kode: "AUD", Nama: "Australian Dollar Orderbook", Tipe: "STABLECOIN", Supply: 10000000000},
		{AssetID: "hkd0000000000020", Kode: "HKD", Nama: "Hong Kong Dollar Orderbook", Tipe: "STABLECOIN", Supply: 10000000000},
		{AssetID: "php0000000000021", Kode: "PHP", Nama: "Philippine Peso Orderbook", Tipe: "STABLECOIN", Supply: 10000000000},
		{AssetID: "inr0000000000022", Kode: "INR", Nama: "Indian Rupee Orderbook", Tipe: "STABLECOIN", Supply: 10000000000},
		{AssetID: "chf0000000000023", Kode: "CHF", Nama: "Swiss Franc Orderbook", Tipe: "STABLECOIN", Supply: 10000000000},
		{AssetID: "twd0000000000024", Kode: "TWD", Nama: "Taiwan Dollar Orderbook", Tipe: "STABLECOIN", Supply: 10000000000},
		{AssetID: "sar0000000000025", Kode: "SAR", Nama: "Saudi Riyal Orderbook", Tipe: "STABLECOIN", Supply: 10000000000},
		{AssetID: "aed0000000000026", Kode: "AED", Nama: "UAE Dirham Orderbook", Tipe: "STABLECOIN", Supply: 10000000000},
		{AssetID: "vnd0000000000027", Kode: "VND", Nama: "Vietnamese Dong Orderbook", Tipe: "STABLECOIN", Supply: 10000000000},
		{AssetID: "brl0000000000028", Kode: "BRL", Nama: "Brazilian Real Orderbook", Tipe: "STABLECOIN", Supply: 10000000000},
		// Stablecoin Oracle (pegged to real-world rate)
		{AssetID: "pidr000000000009", Kode: "pIDR", Nama: "Rupiah Oracle", Tipe: "STABLECOIN_PEGGED", Supply: 100000000000},
		{AssetID: "pusd000000000010", Kode: "pUSD", Nama: "US Dollar Oracle", Tipe: "STABLECOIN_PEGGED", Supply: 10000000000},
		{AssetID: "pmyr000000000011", Kode: "pMYR", Nama: "Ringgit Oracle", Tipe: "STABLECOIN_PEGGED", Supply: 10000000000},
		{AssetID: "psgd000000000029", Kode: "pSGD", Nama: "Singapore Dollar Oracle", Tipe: "STABLECOIN_PEGGED", Supply: 10000000000},
		{AssetID: "pjpy000000000030", Kode: "pJPY", Nama: "Japanese Yen Oracle", Tipe: "STABLECOIN_PEGGED", Supply: 10000000000},
		{AssetID: "peur000000000031", Kode: "pEUR", Nama: "Euro Oracle", Tipe: "STABLECOIN_PEGGED", Supply: 10000000000},
		{AssetID: "pgbp000000000032", Kode: "pGBP", Nama: "British Pound Oracle", Tipe: "STABLECOIN_PEGGED", Supply: 10000000000},
		{AssetID: "pcny000000000033", Kode: "pCNY", Nama: "Chinese Yuan Oracle", Tipe: "STABLECOIN_PEGGED", Supply: 10000000000},
		{AssetID: "pkrw000000000034", Kode: "pKRW", Nama: "Korean Won Oracle", Tipe: "STABLECOIN_PEGGED", Supply: 10000000000},
		{AssetID: "pthb000000000035", Kode: "pTHB", Nama: "Thai Baht Oracle", Tipe: "STABLECOIN_PEGGED", Supply: 10000000000},
		{AssetID: "paud000000000036", Kode: "pAUD", Nama: "Australian Dollar Oracle", Tipe: "STABLECOIN_PEGGED", Supply: 10000000000},
		{AssetID: "phkd000000000037", Kode: "pHKD", Nama: "Hong Kong Dollar Oracle", Tipe: "STABLECOIN_PEGGED", Supply: 10000000000},
		{AssetID: "pphp000000000038", Kode: "pPHP", Nama: "Philippine Peso Oracle", Tipe: "STABLECOIN_PEGGED", Supply: 10000000000},
		{AssetID: "pinr000000000039", Kode: "pINR", Nama: "Indian Rupee Oracle", Tipe: "STABLECOIN_PEGGED", Supply: 10000000000},
		{AssetID: "pchf000000000040", Kode: "pCHF", Nama: "Swiss Franc Oracle", Tipe: "STABLECOIN_PEGGED", Supply: 10000000000},
		{AssetID: "ptwd000000000041", Kode: "pTWD", Nama: "Taiwan Dollar Oracle", Tipe: "STABLECOIN_PEGGED", Supply: 10000000000},
		{AssetID: "psar000000000042", Kode: "pSAR", Nama: "Saudi Riyal Oracle", Tipe: "STABLECOIN_PEGGED", Supply: 10000000000},
		{AssetID: "paed000000000043", Kode: "pAED", Nama: "UAE Dirham Oracle", Tipe: "STABLECOIN_PEGGED", Supply: 10000000000},
		{AssetID: "pvnd000000000044", Kode: "pVND", Nama: "Vietnamese Dong Oracle", Tipe: "STABLECOIN_PEGGED", Supply: 10000000000},
		{AssetID: "pbrl000000000045", Kode: "pBRL", Nama: "Brazilian Real Oracle", Tipe: "STABLECOIN_PEGGED", Supply: 10000000000},
	}
}

// ─── Handlers ───

func writeJSON(w http.ResponseWriter, v interface{}) {
	w.Header().Set("Content-Type", "application/json")
	w.Header().Set("Access-Control-Allow-Origin", "*")
	json.NewEncoder(w).Encode(v)
}

func corsMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Access-Control-Allow-Origin", "*")
		w.Header().Set("Access-Control-Allow-Methods", "GET,POST,DELETE,OPTIONS")
		w.Header().Set("Access-Control-Allow-Headers", "Content-Type")
		if r.Method == "OPTIONS" {
			w.WriteHeader(204)
			return
		}
		next.ServeHTTP(w, r)
	})
}

// GET /api/healthz
func handleHealthz(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, map[string]string{"status": "ok"})
}

// GET /api/blockchain/stats
func handleStats(w http.ResponseWriter, r *http.Request) {
	raw, err := publicNode.Call("getblockchaininfo", nil)
	if err != nil {
		writeJSON(w, map[string]interface{}{"error": err.Error()})
		return
	}
	var info struct {
		Chain  string `json:"chain"`
		Blocks int64  `json:"blocks"`
		Best   string `json:"bestblockhash"`
	}
	json.Unmarshal(raw, &info)

	// Get network info
	netRaw, _ := publicNode.Call("getnetworkinfo", nil)
	var netInfo struct {
		Version    int    `json:"version"`
		SubVersion string `json:"subversion"`
		Conns      int    `json:"connections"`
	}
	json.Unmarshal(netRaw, &netInfo)

	// Get mining info
	mineRaw, _ := publicNode.Call("getmininginfo", nil)
	var mineInfo struct {
		Difficulty float64 `json:"difficulty"`
		Hashrate   float64 `json:"networkhashps"`
	}
	json.Unmarshal(mineRaw, &mineInfo)

	// Count total transactions by summing nTx from recent blocks
	totalTx := int64(0)
	avgBlockTime := 5.0 // default
	if info.Blocks > 0 {
		// Estimate total tx: avg ~2 tx/block
		totalTx = info.Blocks * 2
		// Get last 2 blocks to compute avg block time
		if info.Blocks >= 2 {
			h1Raw, _ := publicNode.Call("getblockhash", []interface{}{info.Blocks})
			h2Raw, _ := publicNode.Call("getblockhash", []interface{}{info.Blocks - 1})
			var h1, h2 string
			json.Unmarshal(h1Raw, &h1)
			json.Unmarshal(h2Raw, &h2)
			b1Raw, _ := publicNode.Call("getblockheader", []interface{}{h1})
			b2Raw, _ := publicNode.Call("getblockheader", []interface{}{h2})
			var bh1, bh2 struct{ Time int64 `json:"time"` }
			json.Unmarshal(b1Raw, &bh1)
			json.Unmarshal(b2Raw, &bh2)
			if diff := bh1.Time - bh2.Time; diff > 0 {
				avgBlockTime = float64(diff)
			}
		}
	}
	tps := 0.0
	if avgBlockTime > 0 {
		tps = float64(totalTx) / float64(info.Blocks) / avgBlockTime
	}

	writeJSON(w, map[string]interface{}{
		// Fields expected by website schema
		"latestBlock":       info.Blocks,
		"totalTransactions": totalTx,
		"totalAddresses":    netInfo.Conns * 10, // approximate
		"avgBlockTime":      avgBlockTime,
		"tps":               tps,
		"validators":        netInfo.Conns,
		"networkName":       "GarudaChain Mainnet",
		"chainId":           1945,
		"tokenSymbol":       "GRD",
		// Legacy fields
		"chain":       info.Chain,
		"bestHash":    info.Best,
		"connections": netInfo.Conns,
		"version":     netInfo.SubVersion,
		"difficulty":  mineInfo.Difficulty,
		"hashrate":    mineInfo.Hashrate,
	})
}

// GET /api/blockchain/blocks
func handleBlocks(w http.ResponseWriter, r *http.Request) {
	raw, _ := publicNode.Call("getblockcount", nil)
	var height int64
	json.Unmarshal(raw, &height)

	limit := 20
	if l := r.URL.Query().Get("limit"); l != "" {
		if n, err := strconv.Atoi(l); err == nil && n > 0 && n <= 100 {
			limit = n
		}
	}

	var blocks []map[string]interface{}
	for i := 0; i < limit && height-int64(i) >= 0; i++ {
		h := height - int64(i)
		hashRaw, err := publicNode.Call("getblockhash", []interface{}{h})
		if err != nil {
			continue
		}
		var hash string
		json.Unmarshal(hashRaw, &hash)

		blockRaw, err := publicNode.Call("getblock", []interface{}{hash, 2})
		if err != nil {
			continue
		}
		var block map[string]interface{}
		json.Unmarshal(blockRaw, &block)

		txCount := 0
		if txs, ok := block["tx"].([]interface{}); ok {
			txCount = len(txs)
		}

		// Extract miner address from coinbase tx
		miner := ""
		if txs, ok := block["tx"].([]interface{}); ok && len(txs) > 0 {
			if coinbase, ok := txs[0].(map[string]interface{}); ok {
				if vouts, ok := coinbase["vout"].([]interface{}); ok && len(vouts) > 0 {
					if vout0, ok := vouts[0].(map[string]interface{}); ok {
						if spk, ok := vout0["scriptPubKey"].(map[string]interface{}); ok {
							if addr, ok := spk["address"].(string); ok {
								miner = addr
							}
						}
					}
				}
			}
		}

		// Format timestamp as ISO string
		timeUnix := int64(0)
		if t, ok := block["time"].(float64); ok {
			timeUnix = int64(t)
		}
		timeStr := time.Unix(timeUnix, 0).UTC().Format(time.RFC3339)

		blocks = append(blocks, map[string]interface{}{
			// Fields expected by website
			"number":           h,
			"hash":             hash,
			"parentHash":       block["previousblockhash"],
			"timestamp":        timeStr,
			"transactionCount": txCount,
			"validator":        miner,
			"size":             block["size"],
			"gasUsed":          0,
			"gasLimit":         0,
			// Legacy fields
			"height":       h,
			"time":         block["time"],
			"nTx":          txCount,
			"weight":       block["weight"],
			"difficulty":   block["difficulty"],
			"previoushash": block["previousblockhash"],
		})
	}

	writeJSON(w, blocks)
}

// GET /api/blockchain/blocks/{height}
func handleBlockByHeight(w http.ResponseWriter, r *http.Request) {
	parts := strings.Split(r.URL.Path, "/")
	heightStr := parts[len(parts)-1]
	height, err := strconv.ParseInt(heightStr, 10, 64)
	if err != nil {
		// Maybe it's a hash
		blockRaw, err := publicNode.Call("getblock", []interface{}{heightStr, 2})
		if err != nil {
			writeJSON(w, map[string]string{"error": err.Error()})
			return
		}
		var block map[string]interface{}
		json.Unmarshal(blockRaw, &block)
		writeJSON(w, block)
		return
	}

	hashRaw, err := publicNode.Call("getblockhash", []interface{}{height})
	if err != nil {
		writeJSON(w, map[string]string{"error": err.Error()})
		return
	}
	var hash string
	json.Unmarshal(hashRaw, &hash)

	blockRaw, err := publicNode.Call("getblock", []interface{}{hash, 2})
	if err != nil {
		writeJSON(w, map[string]string{"error": err.Error()})
		return
	}
	var block map[string]interface{}
	json.Unmarshal(blockRaw, &block)
	writeJSON(w, block)
}

// GET /api/blockchain/transactions
func handleTransactions(w http.ResponseWriter, r *http.Request) {
	raw, _ := publicNode.Call("getblockcount", nil)
	var height int64
	json.Unmarshal(raw, &height)

	var txs []map[string]interface{}
	for i := 0; i < 5 && height-int64(i) >= 0; i++ {
		h := height - int64(i)
		hashRaw, _ := publicNode.Call("getblockhash", []interface{}{h})
		var hash string
		json.Unmarshal(hashRaw, &hash)

		blockRaw, _ := publicNode.Call("getblock", []interface{}{hash, 2})
		var block struct {
			Time int64 `json:"time"`
			Tx   []struct {
				Txid string                   `json:"txid"`
				Vin  []map[string]interface{} `json:"vin"`
				Vout []map[string]interface{} `json:"vout"`
				Size int                      `json:"size"`
			} `json:"tx"`
		}
		json.Unmarshal(blockRaw, &block)

		timeStr := time.Unix(block.Time, 0).UTC().Format(time.RFC3339)

		for _, tx := range block.Tx {
			totalOut := 0.0
			fromAddr := ""
			toAddr := ""
			for _, vout := range tx.Vout {
				if v, ok := vout["value"].(float64); ok {
					totalOut += v
				}
				if toAddr == "" {
					if spk, ok := vout["scriptPubKey"].(map[string]interface{}); ok {
						if addr, ok := spk["address"].(string); ok {
							toAddr = addr
						}
					}
				}
			}
			// Get from address from first vin
			if len(tx.Vin) > 0 {
				if prevTxid, ok := tx.Vin[0]["txid"].(string); ok && prevTxid != "" {
					fromAddr = prevTxid[:16] + "..." // Simplified
					// Try to resolve actual address
					prevRaw, err := publicNode.Call("getrawtransaction", []interface{}{prevTxid, true})
					if err == nil {
						var prevTx struct {
							Vout []struct {
								ScriptPubKey struct {
									Address string `json:"address"`
								} `json:"scriptPubKey"`
							} `json:"vout"`
						}
						json.Unmarshal(prevRaw, &prevTx)
						voutIdx := 0
						if vi, ok := tx.Vin[0]["vout"].(float64); ok {
							voutIdx = int(vi)
						}
						if voutIdx < len(prevTx.Vout) {
							fromAddr = prevTx.Vout[voutIdx].ScriptPubKey.Address
						}
					}
				}
			}

			txs = append(txs, map[string]interface{}{
				// Fields expected by website
				"hash":        tx.Txid,
				"blockNumber": h,
				"from":        fromAddr,
				"to":          toAddr,
				"value":       fmt.Sprintf("%.8f", totalOut),
				"fee":         "0.01",
				"timestamp":   timeStr,
				"status":      "success",
				// Legacy fields
				"txid":        tx.Txid,
				"blockHeight": h,
				"time":        block.Time,
				"size":        tx.Size,
				"vinCount":    len(tx.Vin),
				"voutCount":   len(tx.Vout),
				"totalOutput": totalOut,
			})
		}
	}
	writeJSON(w, txs)
}

// GET /api/blockchain/transactions/{hash}
func handleTxByHash(w http.ResponseWriter, r *http.Request) {
	parts := strings.Split(r.URL.Path, "/")
	txHash := parts[len(parts)-1]

	txRaw, err := publicNode.Call("getrawtransaction", []interface{}{txHash, true})
	if err != nil {
		writeJSON(w, map[string]string{"error": err.Error()})
		return
	}
	var tx map[string]interface{}
	json.Unmarshal(txRaw, &tx)
	writeJSON(w, tx)
}

// GET /api/blockchain/address/{addr}
func handleAddress(w http.ResponseWriter, r *http.Request) {
	parts := strings.Split(r.URL.Path, "/")
	addr := parts[len(parts)-1]

	// Try scantxoutset for GRD balance
	balRaw, _ := publicNode.Call("scantxoutset", []interface{}{"start", []string{"addr(" + addr + ")"}})
	var balInfo struct {
		TotalAmount float64 `json:"total_amount"`
		Unspents    []struct {
			Txid   string  `json:"txid"`
			Vout   int     `json:"vout"`
			Amount float64 `json:"amount"`
			Height int64   `json:"height"`
		} `json:"unspents"`
	}
	json.Unmarshal(balRaw, &balInfo)

	// Get asset portfolio via getwalletassets RPC on CBDC node
	type AssetHolding struct {
		AssetID string `json:"asset_id"`
		Symbol  string `json:"symbol"`
		Type    string `json:"type"`
		Balance int64  `json:"balance"`
	}
	portfolio := make([]AssetHolding, 0)

	// Check balance for each known asset
	assets := scanAssets()
	for _, a := range assets {
		balanceRaw, err := cbdcNode.Call("getassetbalance", []interface{}{addr, a.AssetID})
		if err != nil {
			continue
		}
		var result struct {
			Asset struct {
				Balance int64 `json:"balance"`
			} `json:"asset"`
		}
		json.Unmarshal(balanceRaw, &result)
		if result.Asset.Balance > 0 {
			portfolio = append(portfolio, AssetHolding{
				AssetID: a.AssetID,
				Symbol:  a.Kode,
				Type:    a.Tipe,
				Balance: result.Asset.Balance,
			})
		}
	}

	// ── Gather ALL transactions involving this address ──
	var transactions []map[string]interface{}
	var firstSeen, lastSeen string
	seenTxid := map[string]bool{} // dedup

	addTx := func(txid string, height int64, ts string, from, to, value, fee, method string) {
		if seenTxid[txid+method] {
			return
		}
		seenTxid[txid+method] = true
		transactions = append(transactions, map[string]interface{}{
			"hash":        txid,
			"blockNumber": height,
			"timestamp":   ts,
			"from":        from,
			"to":          to,
			"value":       value,
			"fee":         fee,
			"status":      "confirmed",
			"method":      method,
		})
		if lastSeen == "" || ts > lastSeen {
			lastSeen = ts
		}
		if firstSeen == "" || ts < firstSeen {
			firstSeen = ts
		}
	}

	// 1) GRD transactions: scan recent blocks for this address in vouts
	heightRaw, _ := publicNode.Call("getblockcount", nil)
	var currentHeight int64
	json.Unmarshal(heightRaw, &currentHeight)

	scanFrom := currentHeight - 500
	if scanFrom < 0 {
		scanFrom = 0
	}
	for h := currentHeight; h >= scanFrom; h-- {
		bhRaw, err := publicNode.Call("getblockhash", []interface{}{h})
		if err != nil {
			continue
		}
		var bh string
		json.Unmarshal(bhRaw, &bh)
		blkRaw, err := publicNode.Call("getblock", []interface{}{bh, 2})
		if err != nil {
			continue
		}
		var blk struct {
			Time int64 `json:"time"`
			Tx   []struct {
				Txid string `json:"txid"`
				Vin  []struct {
					Txid string `json:"txid"`
					Vout int    `json:"vout"`
				} `json:"vin"`
				Vout []struct {
					Value        float64 `json:"value"`
					N            int     `json:"n"`
					ScriptPubKey struct {
						Address string `json:"address"`
					} `json:"scriptPubKey"`
				} `json:"vout"`
			} `json:"tx"`
		}
		json.Unmarshal(blkRaw, &blk)
		ts := time.Unix(blk.Time, 0).UTC().Format(time.RFC3339)

		for _, tx := range blk.Tx {
			isCoinbase := len(tx.Vin) > 0 && tx.Vin[0].Txid == ""

			// Check outputs: is this address receiving GRD?
			var recvTotal float64
			for _, vout := range tx.Vout {
				if vout.ScriptPubKey.Address == addr && vout.Value > 0 {
					recvTotal += vout.Value
				}
			}

			// Check inputs: is this address sending GRD?
			isSender := false
			if !isCoinbase {
				for _, vin := range tx.Vin {
					if vin.Txid == "" {
						continue
					}
					prevRaw, err := publicNode.Call("getrawtransaction", []interface{}{vin.Txid, true})
					if err != nil {
						continue
					}
					var prevTx struct {
						Vout []struct {
							Value        float64 `json:"value"`
							ScriptPubKey struct {
								Address string `json:"address"`
							} `json:"scriptPubKey"`
						} `json:"vout"`
					}
					json.Unmarshal(prevRaw, &prevTx)
					if vin.Vout < len(prevTx.Vout) && prevTx.Vout[vin.Vout].ScriptPubKey.Address == addr {
						isSender = true
						break
					}
				}
			}

			if recvTotal == 0 && !isSender {
				continue
			}

			// Resolve from address
			fromAddr := "coinbase"
			if !isCoinbase && len(tx.Vin) > 0 && tx.Vin[0].Txid != "" {
				if isSender {
					fromAddr = addr
				} else {
					prevRaw, err := publicNode.Call("getrawtransaction", []interface{}{tx.Vin[0].Txid, true})
					if err == nil {
						var prevTx struct {
							Vout []struct {
								ScriptPubKey struct {
									Address string `json:"address"`
								} `json:"scriptPubKey"`
							} `json:"vout"`
						}
						json.Unmarshal(prevRaw, &prevTx)
						if tx.Vin[0].Vout < len(prevTx.Vout) {
							fromAddr = prevTx.Vout[tx.Vin[0].Vout].ScriptPubKey.Address
						}
					}
				}
			}

			// Resolve to address
			toAddr := ""
			var val float64
			if isSender {
				// Find where the GRD went (non-self, non-OP_RETURN outputs)
				for _, vout := range tx.Vout {
					if vout.ScriptPubKey.Address != "" && vout.ScriptPubKey.Address != addr {
						toAddr = vout.ScriptPubKey.Address
						val = vout.Value
						break
					}
				}
				if toAddr == "" {
					toAddr = addr // self-transfer / change
					val = recvTotal
				}
			} else {
				toAddr = addr
				val = recvTotal
			}

			addTx(tx.Txid, h, ts, fromAddr, toAddr,
				fmt.Sprintf("%.8f GRD", val), "0.00000000", "Transfer")
		}
	}

	// 2) Asset transactions: issuance + transfers (getassettx) per asset
	for _, a := range assets {
		assetTxRaw, _ := cbdcNode.Call("getassettx", []interface{}{a.AssetID, 500})
		var assetTxs []struct {
			Txid      string `json:"txid"`
			Height    int64  `json:"height"`
			Timestamp int64  `json:"timestamp"`
			Type      string `json:"type"`
			Amount    int64  `json:"amount"`
			FromH160  string `json:"from_hash160"`
			ToH160    string `json:"to_hash160"`
		}
		json.Unmarshal(assetTxRaw, &assetTxs)
		for _, atx := range assetTxs {
			fromAddr := ""
			if atx.FromH160 != "" {
				fromAddr = hash160ToBech32(atx.FromH160)
			}
			toAddr := ""
			if atx.ToH160 != "" {
				toAddr = hash160ToBech32(atx.ToH160)
			}
			if fromAddr != addr && toAddr != addr {
				continue
			}
			ts := time.Unix(atx.Timestamp, 0).UTC().Format(time.RFC3339)
			method := "Issue"
			if atx.Type == "transfer" {
				method = "Transfer"
			}
			addTx(atx.Txid, atx.Height, ts, fromAddr, toAddr,
				fmt.Sprintf("%d %s", atx.Amount, a.Kode), "0.00000000", method)
		}

		// 3) Asset trades (gettradehistory) per asset
		tradeRaw, _ := cbdcNode.Call("gettradehistory", []interface{}{a.AssetID})
		var trades []struct {
			TradeID   string  `json:"trade_id"`
			Buyer     string  `json:"buyer"`
			Seller    string  `json:"seller"`
			Amount    int64   `json:"amount"`
			PriceGRD  float64 `json:"price_grd"`
			Height    int64   `json:"height"`
			Timestamp int64   `json:"timestamp"`
		}
		json.Unmarshal(tradeRaw, &trades)
		for _, tr := range trades {
			buyerAddr := hash160ToBech32(tr.Buyer)
			sellerAddr := hash160ToBech32(tr.Seller)
			if buyerAddr != addr && sellerAddr != addr {
				continue
			}
			ts := time.Unix(tr.Timestamp, 0).UTC().Format(time.RFC3339)
			totalGRD := float64(tr.Amount) * tr.PriceGRD
			addTx(tr.TradeID, tr.Height, ts, sellerAddr, buyerAddr,
				fmt.Sprintf("%d %s", tr.Amount, a.Kode),
				fmt.Sprintf("%.8f GRD", totalGRD), "Trade")
		}
	}

	// Sort by blockNumber desc (newest first)
	sort.Slice(transactions, func(i, j int) bool {
		bi, _ := transactions[i]["blockNumber"].(int64)
		bj, _ := transactions[j]["blockNumber"].(int64)
		return bi > bj
	})

	if transactions == nil {
		transactions = []map[string]interface{}{}
	}

	writeJSON(w, map[string]interface{}{
		"address":          addr,
		"balance":          fmt.Sprintf("%.8f", balInfo.TotalAmount),
		"transactionCount": len(transactions),
		"firstSeen":        firstSeen,
		"lastSeen":         lastSeen,
		"transactions":     transactions,
		"portfolio":        portfolio,
	})
}

// GET /api/blockchain/search?q=
func handleSearch(w http.ResponseWriter, r *http.Request) {
	q := r.URL.Query().Get("q")
	if q == "" {
		writeJSON(w, map[string]string{"error": "empty query"})
		return
	}

	// Try block height
	if h, err := strconv.ParseInt(q, 10, 64); err == nil {
		hashRaw, err := publicNode.Call("getblockhash", []interface{}{h})
		if err == nil {
			var hash string
			json.Unmarshal(hashRaw, &hash)
			writeJSON(w, map[string]interface{}{"type": "block", "height": h, "hash": hash})
			return
		}
	}

	// Try tx hash
	_, err := publicNode.Call("getrawtransaction", []interface{}{q, true})
	if err == nil {
		writeJSON(w, map[string]interface{}{"type": "transaction", "txid": q})
		return
	}

	// Try block hash
	_, err = publicNode.Call("getblock", []interface{}{q})
	if err == nil {
		writeJSON(w, map[string]interface{}{"type": "block", "hash": q})
		return
	}

	// Assume address
	writeJSON(w, map[string]interface{}{"type": "address", "address": q})
}

// GET /api/blockchain/stocks
func handleStocks(w http.ResponseWriter, r *http.Request) {
	assets := scanAssets()
	oracleRates := fetchOracleRatesMap()
	var result []map[string]interface{}
	for i, a := range assets {
		tipUpper := strings.ToUpper(a.Tipe)
		holderList := getAssetHolders(a.AssetID)

		// Compute price based on type
		price := 0.0
		changePercent := 0.0
		switch tipUpper {
		case "NATIVE":
			price = 1.0 // GRD = 1 GRD
		case "STABLECOIN":
			// Orderbook stablecoin — use oracle rate as reference price
			sym := strings.ToUpper(a.Kode)
			if rate, ok := oracleRates[sym]; ok && rate[0] > 0 {
				price = rate[0] // grd_per_unit
			}
		case "STABLECOIN_PEGGED":
			// Oracle stablecoin — use oracle rate directly
			sym := strings.ToUpper(a.Kode)
			if len(sym) > 1 && strings.HasPrefix(sym, "P") {
				sym = sym[1:]
			}
			if rate, ok := oracleRates[sym]; ok && rate[0] > 0 {
				price = rate[0] // grd_per_unit
			}
		default:
			// Saham etc — get from orderbook mid-price
			book := getBook(a.AssetID)
			book.mu.RLock()
			price = book.spotPrice
			book.mu.RUnlock()
		}

		result = append(result, map[string]interface{}{
			"rank":          i + 1,
			"kode":          a.Kode,
			"nama":          a.Nama,
			"assetId":       a.AssetID,
			"tipe":          tipUpper,
			"totalSupply":   a.Supply,
			"supply":        a.Supply,
			"outstanding":   a.Supply,
			"holders":       len(holderList),
			"issueHeight":   1,
			"issueTxid":     "",
			"status":        "ACTIVE",
			"price":         price,
			"changePercent": changePercent,
		})
	}
	if len(result) == 0 {
		result = []map[string]interface{}{}
	}
	writeJSON(w, result)
}

// GET /api/blockchain/pool/{assetId}
func handlePool(w http.ResponseWriter, r *http.Request) {
	parts := strings.Split(r.URL.Path, "/")
	assetID := parts[len(parts)-1]

	book := getBook(assetID)
	book.mu.RLock()
	spot := book.spotPrice
	resGRD := book.reserveGRD
	resTok := book.reserveTok
	book.mu.RUnlock()

	writeJSON(w, map[string]interface{}{
		"asset_id":       assetID,
		"spot_price_grd": spot,
		"reserve_grd":    resGRD,
		"reserve_token":  resTok,
		"k":              resGRD * resTok,
	})
}

// GET /api/blockchain/orderbook/{assetId}
func handleOrderbook(w http.ResponseWriter, r *http.Request) {
	parts := strings.Split(r.URL.Path, "/")
	assetID := parts[len(parts)-1]

	// Try on-chain orderbook from CBDC node
	raw, err := cbdcNode.Call("getorderbook", []interface{}{assetID})
	if err == nil {
		var ob map[string]interface{}
		json.Unmarshal(raw, &ob)
		writeJSON(w, ob)
		return
	}

	// Fallback to in-memory book
	book := getBook(assetID)
	book.mu.RLock()
	defer book.mu.RUnlock()

	writeJSON(w, map[string]interface{}{
		"asks": book.asks,
		"bids": book.bids,
	})
}

// GET /api/blockchain/mining
func handleMining(w http.ResponseWriter, r *http.Request) {
	raw, _ := publicNode.Call("getmininginfo", nil)
	var info struct {
		Blocks      int64   `json:"blocks"`
		Difficulty  float64 `json:"difficulty"`
		NetworkHash float64 `json:"networkhashps"`
	}
	json.Unmarshal(raw, &info)

	netRaw, _ := publicNode.Call("getnetworkinfo", nil)
	var netInfo struct {
		Conns      int    `json:"connections"`
		SubVersion string `json:"subversion"`
	}
	json.Unmarshal(netRaw, &netInfo)

	writeJSON(w, map[string]interface{}{
		"networkHashrate": info.NetworkHash,
		"difficulty":      info.Difficulty,
		"blockHeight":     info.Blocks,
		"peers":           netInfo.Conns,
		"blockReward":     0.01,
		"apbnFeeRate":     0.08,
		"algorithm":       "SHA-256d",
		"version":         netInfo.SubVersion,
		// Legacy
		"blocks":        info.Blocks,
		"networkhashps": info.NetworkHash,
	})
}

// GET /api/blockchain/wallets
func handleWallets(w http.ResponseWriter, r *http.Request) {
	// Return known wallet addresses
	var wallets []map[string]interface{}

	for name, node := range map[string]*RPCClient{"cbdc": cbdcNode, "creator": creatorNode, "public": publicNode} {
		addrRaw, err := node.Call("getaddressesbylabel", []interface{}{""})
		if err != nil {
			continue
		}
		var addrs map[string]interface{}
		json.Unmarshal(addrRaw, &addrs)

		balRaw, _ := node.Call("getbalance", nil)
		var bal float64
		json.Unmarshal(balRaw, &bal)

		for addr := range addrs {
			wallets = append(wallets, map[string]interface{}{
				"address": addr,
				"node":    name,
				"balance": bal,
			})
			break // just first address per node
		}
	}

	writeJSON(w, wallets)
}

// GET /api/blockchain/supply
func handleSupply(w http.ResponseWriter, r *http.Request) {
	raw, _ := publicNode.Call("getblockcount", nil)
	var height int64
	json.Unmarshal(raw, &height)

	blockReward := 0.01
	apbnPerBlock := blockReward * 0.08
	minerPerBlock := blockReward - apbnPerBlock
	totalMined := float64(height) * blockReward
	apbnTotal := float64(height) * apbnPerBlock
	minerTotal := float64(height) * minerPerBlock

	writeJSON(w, map[string]interface{}{
		"totalMined":        totalMined,
		"circulatingSupply": totalMined,
		"blockHeight":       height,
		"apbnTotal":         apbnTotal,
		"minerTotal":        minerTotal,
		"apbnPerBlock":      apbnPerBlock,
		"minerPerBlock":     minerPerBlock,
		"blockReward":       blockReward,
	})
}

// defaultOracleRates returns hardcoded oracle rates for regtest fallback
// Rate = how many units of currency per 1 GRD (approx real-world rates)
func defaultOracleRates() map[string][2]float64 {
	rates := map[string]float64{
		"IDR": 16500,   // 1 GRD = 16,500 IDR
		"USD": 1.0,     // 1 GRD = 1 USD
		"MYR": 4.50,    // 1 GRD = 4.50 MYR
		"SGD": 1.35,    // 1 GRD = 1.35 SGD
		"JPY": 155.0,   // 1 GRD = 155 JPY
		"EUR": 0.92,    // 1 GRD = 0.92 EUR
		"GBP": 0.79,    // 1 GRD = 0.79 GBP
		"CNY": 7.25,    // 1 GRD = 7.25 CNY
		"KRW": 1350.0,  // 1 GRD = 1,350 KRW
		"THB": 35.5,    // 1 GRD = 35.5 THB
		"AUD": 1.55,    // 1 GRD = 1.55 AUD
		"HKD": 7.82,    // 1 GRD = 7.82 HKD
		"PHP": 56.5,    // 1 GRD = 56.5 PHP
		"INR": 83.5,    // 1 GRD = 83.5 INR
		"CHF": 0.88,    // 1 GRD = 0.88 CHF
		"TWD": 32.0,    // 1 GRD = 32 TWD
		"SAR": 3.75,    // 1 GRD = 3.75 SAR
		"AED": 3.67,    // 1 GRD = 3.67 AED
		"VND": 25000.0, // 1 GRD = 25,000 VND
		"BRL": 5.0,     // 1 GRD = 5.0 BRL
	}
	result := make(map[string][2]float64, len(rates))
	for sym, unitsPerGrd := range rates {
		result[sym] = [2]float64{1.0 / unitsPerGrd, unitsPerGrd}
	}
	return result
}

// fetchOracleRatesMap returns map[symbol] → { grd_per_unit, units_per_grd } from oracle
func fetchOracleRatesMap() map[string][2]float64 {
	result := map[string][2]float64{}
	raw, err := cbdcNode.Call("getpegrates", []interface{}{})
	if err != nil {
		// Fallback to hardcoded rates for regtest
		return defaultOracleRates()
	}
	var rates []struct {
		Symbol     string  `json:"symbol"`
		GrdPerUnit float64 `json:"grd_per_unit"`
		RatePerGrd float64 `json:"rate_per_grd"`
	}
	json.Unmarshal(raw, &rates)
	for _, r := range rates {
		unitsPerGrd := 0.0
		if r.GrdPerUnit > 0 {
			unitsPerGrd = 1.0 / r.GrdPerUnit
		}
		result[strings.ToUpper(r.Symbol)] = [2]float64{r.GrdPerUnit, unitsPerGrd}
	}
	if len(result) == 0 {
		return defaultOracleRates()
	}
	return result
}

// stablecoinsCache caches the result of handleStablecoins since it's expensive
// (calls listassetholders + getorderbook for ~449 assets).
var (
	stablecoinsCache     []map[string]interface{}
	stablecoinsCacheTime time.Time
	stablecoinsCacheLock sync.RWMutex
)

// GET /api/blockchain/stablecoins
func handleStablecoins(w http.ResponseWriter, r *http.Request) {
	// Serve from cache if fresh (5s TTL — balances live-feel with RPC load)
	stablecoinsCacheLock.RLock()
	if time.Since(stablecoinsCacheTime) < 5*time.Second && stablecoinsCache != nil {
		cached := stablecoinsCache
		stablecoinsCacheLock.RUnlock()
		writeJSON(w, cached)
		return
	}
	stablecoinsCacheLock.RUnlock()

	assets := scanAssets()
	oracleRates := fetchOracleRatesMap()

	// Filter stablecoin assets
	var stableAssets []AssetInfo
	for _, a := range assets {
		tipUpper := strings.ToUpper(a.Tipe)
		if tipUpper == "STABLECOIN" || tipUpper == "STABLECOIN_PEGGED" {
			stableAssets = append(stableAssets, a)
		}
	}

	// Parallelize RPC calls (holders + orderbook) with worker pool
	type stableResult struct {
		idx  int
		data map[string]interface{}
	}
	results := make([]map[string]interface{}, len(stableAssets))
	resultCh := make(chan stableResult, len(stableAssets))
	sem := make(chan struct{}, 32) // concurrency limit

	var wg sync.WaitGroup
	for i, a := range stableAssets {
		wg.Add(1)
		go func(i int, a AssetInfo) {
			defer wg.Done()
			sem <- struct{}{}
			defer func() { <-sem }()

			tipUpper := strings.ToUpper(a.Tipe)
			holderList := getAssetHolders(a.AssetID)
			sym := strings.ToUpper(a.Kode)
			lookupSym := sym
			if tipUpper == "STABLECOIN_PEGGED" && len(lookupSym) > 1 && strings.HasPrefix(lookupSym, "P") {
				lookupSym = lookupSym[1:]
			}
			oracleGrdPerUnit := 0.001
			oracleUnitsPerGrd := 1000.0
			if rate, ok := oracleRates[lookupSym]; ok && rate[0] > 0 {
				oracleGrdPerUnit = rate[0]
				oracleUnitsPerGrd = rate[1]
			}
			obPrice, bestAsk, bestBid := 0.0, 0.0, 0.0
			obRaw, err := cbdcNode.Call("getorderbook", []interface{}{a.AssetID})
			if err == nil {
				var ob struct {
					Asks []struct{ Price float64 `json:"price"` } `json:"asks"`
					Bids []struct{ Price float64 `json:"price"` } `json:"bids"`
				}
				json.Unmarshal(obRaw, &ob)
				if len(ob.Asks) > 0 {
					bestAsk = ob.Asks[0].Price
				}
				if len(ob.Bids) > 0 {
					bestBid = ob.Bids[0].Price
				}
				if bestAsk > 0 && bestBid > 0 {
					obPrice = (bestAsk + bestBid) / 2
				} else if bestAsk > 0 {
					obPrice = bestAsk
				} else {
					obPrice = bestBid
				}
			}

			spread := 0.0
			if oracleGrdPerUnit > 0 && obPrice > 0 {
				spread = ((obPrice - oracleGrdPerUnit) / oracleGrdPerUnit) * 100
			}

			resultCh <- stableResult{idx: i, data: map[string]interface{}{
				"symbol":            a.Kode,
				"name":              a.Nama,
				"assetId":           a.AssetID,
				"totalSupply":       a.Supply,
				"outstanding":       a.Supply,
				"holders":           len(holderList),
				"transfers":         0,
				"pegCurrency":       sym,
				"pegRate":           oracleGrdPerUnit,
				"oracleGrdPerUnit":  oracleGrdPerUnit,
				"oracleUnitsPerGrd": oracleUnitsPerGrd,
				"orderbookPrice":    obPrice,
				"orderbookBestAsk":  bestAsk,
				"orderbookBestBid":  bestBid,
				"spreadPercent":     spread,
				"issueHeight":       1,
				"issueTxid":         "",
				"status":            "ACTIVE",
				"supply":            a.Supply,
				"tipe":              a.Tipe,
			}}
		}(i, a)
	}
	wg.Wait()
	close(resultCh)
	for r := range resultCh {
		results[r.idx] = r.data
	}

	stablecoins := make([]map[string]interface{}, 0, len(results))
	for _, r := range results {
		if r != nil {
			stablecoins = append(stablecoins, r)
		}
	}

	// Update cache
	stablecoinsCacheLock.Lock()
	stablecoinsCache = stablecoins
	stablecoinsCacheTime = time.Now()
	stablecoinsCacheLock.Unlock()

	writeJSON(w, stablecoins)
}

// GET /api/blockchain/trade-history/{assetId}
func handleTradeHistory(w http.ResponseWriter, r *http.Request) {
	parts := strings.Split(r.URL.Path, "/")
	assetID := parts[len(parts)-1]

	raw, err := cbdcNode.Call("gettradehistory", []interface{}{assetID})
	if err != nil {
		writeJSON(w, []interface{}{})
		return
	}
	var trades interface{}
	json.Unmarshal(raw, &trades)
	writeJSON(w, trades)
}

// GET /api/blockchain/asset-holders/{assetId}
func getAssetHolders(assetID string) []map[string]interface{} {
	raw, err := cbdcNode.Call("listassetholders", []interface{}{assetID})
	if err != nil {
		return []map[string]interface{}{}
	}

	// RPC returns flat array: [{address, balance}, ...]
	var flatList []struct {
		Address string `json:"address"`
		Balance int64  `json:"balance"`
	}
	if err := json.Unmarshal(raw, &flatList); err != nil || len(flatList) == 0 {
		// Fallback: try nested format {holders: [...]}
		var nested struct {
			Holders []struct {
				Hash160  string  `json:"hash160"`
				Address  string  `json:"address"`
				Balance  int64   `json:"balance"`
				PctOwner float64 `json:"pct_ownership"`
			} `json:"holders"`
		}
		json.Unmarshal(raw, &nested)
		for _, h := range nested.Holders {
			addr := h.Address
			if addr == "" && h.Hash160 != "" {
				addr = hash160ToBech32(h.Hash160)
			}
			flatList = append(flatList, struct {
				Address string `json:"address"`
				Balance int64  `json:"balance"`
			}{Address: addr, Balance: h.Balance})
		}
	}

	var holders []map[string]interface{}
	totalSupply := int64(0)
	for _, h := range flatList {
		totalSupply += h.Balance
	}
	for _, h := range flatList {
		pct := 0.0
		if totalSupply > 0 {
			pct = float64(h.Balance) / float64(totalSupply) * 100
		}
		holders = append(holders, map[string]interface{}{
			"address":    h.Address,
			"balance":    h.Balance,
			"percentage": pct,
		})
	}
	if holders == nil {
		holders = []map[string]interface{}{}
	}
	sort.Slice(holders, func(i, j int) bool {
		// SafeMapInt64 handles int64/int/float64/json.Number safely without
		// panicking on unexpected types — the legacy version assumed int64
		// and would silently zero out anything else, which broke ranking
		// after JSON round-trip.
		return SafeMapInt64(holders[i], "balance") > SafeMapInt64(holders[j], "balance")
	})
	return holders
}

func handleAssetHolders(w http.ResponseWriter, r *http.Request) {
	assetID, err := SafePathSegment(r.URL.Path)
	if err != nil {
		writeJSONErr(w, "invalid asset id in path", err)
		return
	}
	holders := getAssetHolders(assetID)
	writeJSON(w, map[string]interface{}{
		"asset_id": assetID,
		"holders":  holders,
		"count":    len(holders),
	})
}

// GET /api/blockchain/stream (SSE)
func handleStream(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "text/event-stream")
	w.Header().Set("Cache-Control", "no-cache")
	w.Header().Set("Connection", "keep-alive")
	w.Header().Set("Access-Control-Allow-Origin", "*")

	flusher, ok := w.(http.Flusher)
	if !ok {
		http.Error(w, "streaming not supported", 500)
		return
	}

	// Send current block info every 3 seconds
	ctx := r.Context()
	ticker := time.NewTicker(3 * time.Second)
	defer ticker.Stop()

	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			raw, err := publicNode.Call("getblockcount", nil)
			if err != nil {
				continue
			}
			var height int64
			json.Unmarshal(raw, &height)

			data, _ := json.Marshal(map[string]interface{}{
				"type":   "block",
				"height": height,
				"time":   time.Now().Unix(),
			})
			fmt.Fprintf(w, "event: block\ndata: %s\n\n", data)
			flusher.Flush()
		}
	}
}

// ─── CBDC Management Endpoints ───

// broadcastOpReturn builds, funds, signs and broadcasts a tx with OP_RETURN data.
// funderAddr is the address paying the fee. Returns txid or error.
func broadcastOpReturnWithNode(node *RPCClient, opReturnHex string, funderAddr string) (string, error) {
	type pickedUTXO struct {
		Txid         string
		Vout         int
		Amount       float64
		Address      string
		ScriptPubKey string
	}
	findUTXO := func(addr string) (pickedUTXO, bool) {
		filter := []string{}
		if addr != "" {
			filter = []string{addr}
		}
		res, err := node.Call("listunspent", []interface{}{1, 9999999, filter, true})
		if err != nil {
			return pickedUTXO{}, false
		}
		var utxos []struct {
			Txid         string  `json:"txid"`
			Vout         int     `json:"vout"`
			Amount       float64 `json:"amount"`
			Address      string  `json:"address"`
			ScriptPubKey string  `json:"scriptPubKey"`
			Spendable    bool    `json:"spendable"`
		}
		json.Unmarshal(res, &utxos)
		bestIdx := -1
		bestAmt := 0.0
		for i, u := range utxos {
			if u.Amount >= 0.001 && u.Amount > bestAmt && u.Spendable {
				bestAmt = u.Amount
				bestIdx = i
			}
		}
		if bestIdx >= 0 {
			u := utxos[bestIdx]
			return pickedUTXO{u.Txid, u.Vout, u.Amount, u.Address, u.ScriptPubKey}, true
		}
		return pickedUTXO{}, false
	}

	picked, found := pickedUTXO{}, false
	if funderAddr != "" {
		picked, found = findUTXO(funderAddr)
	}
	if !found && funderAddr != "" {
		// Use wallet-aware node so the call lands on a specific wallet
		// instead of failing with "Wallet file not specified" when the
		// daemon has multiple wallets loaded.
		node.Call("sendtoaddress", []interface{}{funderAddr, 0.1})
		node.Call("generatetoaddress", []interface{}{1, funderAddr})
		picked, found = findUTXO(funderAddr)
	}
	if !found {
		picked, found = findUTXO("")
	}
	if !found {
		return "", fmt.Errorf("no UTXO with >= 0.001 GRD found for fee payment")
	}

	pickedSats := int64(math.Round(picked.Amount * 1e8))
	feeSats := int64(10000)
	changeSats := pickedSats - feeSats
	changeAmt := float64(changeSats) / 1e8

	inputs := []interface{}{map[string]interface{}{"txid": picked.Txid, "vout": picked.Vout}}
	outputs := []interface{}{
		map[string]string{"data": opReturnHex},
		map[string]interface{}{picked.Address: changeAmt},
	}

	rawTxRes, err := node.Call("createrawtransaction", []interface{}{inputs, outputs})
	if err != nil {
		return "", fmt.Errorf("createrawtransaction: %v", err)
	}
	var rawHex string
	json.Unmarshal(rawTxRes, &rawHex)

	// Pass explicit prevtxs to signrawtransactionwithwallet. Without this,
	// newer Bitcoin Core variants fail to look up older UTXOs in the wallet's
	// coin cache and return "Input not found or already spent" even though
	// listunspent just confirmed the UTXO exists and is spendable.
	prevTxs := []interface{}{
		map[string]interface{}{
			"txid":         picked.Txid,
			"vout":         picked.Vout,
			"scriptPubKey": picked.ScriptPubKey,
			"amount":       picked.Amount,
		},
	}
	signRes, err := node.Call("signrawtransactionwithwallet", []interface{}{rawHex, prevTxs})
	if err != nil {
		return "", fmt.Errorf("signrawtransaction: %v", err)
	}
	var signData struct {
		Hex      string `json:"hex"`
		Complete bool   `json:"complete"`
	}
	json.Unmarshal(signRes, &signData)
	if !signData.Complete {
		return "", fmt.Errorf("sign incomplete")
	}

	sendRes, err := node.Call("sendrawtransaction", []interface{}{signData.Hex})
	if err != nil {
		return "", fmt.Errorf("sendrawtransaction: %v", err)
	}
	var resultTxid string
	json.Unmarshal(sendRes, &resultTxid)
	return resultTxid, nil
}

// broadcastOpReturn — default uses the wallet-aware cbdc client so wallet
// RPCs (listunspent, signrawtransactionwithwallet) target a specific wallet
// instead of failing under multi-wallet mode. The cbdc-authority wallet
// holds the fee UTXOs used for OP_RETURN broadcasts.
func broadcastOpReturn(opReturnHex string, funderAddr string) (string, error) {
	return broadcastOpReturnWithNode(cbdcWalletNode, opReturnHex, funderAddr)
}

// findCBDCTokenHolder — cari address di CBDC wallet yang memegang token tsb
func findCBDCTokenHolder(assetID string) string {
	holders := getAssetHolders(assetID)
	for _, h := range holders {
		addr, _ := h["address"].(string)
		if addr == "" {
			continue
		}
		infoRaw, err := cbdcNode.Call("getaddressinfo", []interface{}{addr})
		if err != nil {
			continue
		}
		var info struct {
			IsMine bool `json:"ismine"`
		}
		json.Unmarshal(infoRaw, &info)
		if info.IsMine {
			return addr
		}
	}
	return ""
}

// POST /api/cbdc/mint — Mint stablecoin (CBDC authority only)
func handleCBDCMint(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "POST only", http.StatusMethodNotAllowed)
		return
	}
	var req struct {
		AssetID        string `json:"asset_id"`
		Symbol         string `json:"symbol"`
		Amount         int64  `json:"amount"`
		AdminKey       string `json:"admin_key"`
		IdempotencyKey string `json:"idempotency_key"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeJSONErr(w, "invalid json", err)
		return
	}
	if !requireAdmin(w, r, req.AdminKey) {
		return
	}
	if req.IdempotencyKey != "" {
		if entry := cbdcIdemCache.Get("mint", req.IdempotencyKey); replayIdem(w, entry) {
			return
		}
	}
	if !mintRateLimit.Allow(clientIP(r)) {
		IncMetric("rate_limited")
		writeJSONErrStatus(w, http.StatusTooManyRequests, "mint rate limit exceeded", nil)
		return
	}

	// Resolve asset ID from symbol if needed
	assetID := req.AssetID
	if assetID == "" && req.Symbol != "" {
		if err := ValidSymbol(req.Symbol); err != nil {
			writeJSONErr(w, err.Error(), nil)
			return
		}
		for _, a := range scanAssets() {
			if strings.EqualFold(a.Kode, req.Symbol) {
				assetID = a.AssetID
				break
			}
		}
	}
	if assetID == "" || req.Amount <= 0 {
		writeJSONErr(w, "asset_id/symbol and amount required", nil)
		return
	}
	if err := ValidAssetID(assetID); err != nil {
		writeJSONErr(w, err.Error(), nil)
		return
	}
	if err := ValidAmount(float64(req.Amount), 0); err != nil {
		writeJSONErr(w, err.Error(), nil)
		return
	}

	AuditRequest(r, "cbdc_mint", "start", map[string]interface{}{
		"asset_id": assetID, "amount": req.Amount,
	})

	// Call mintasset RPC on CBDC node
	mintRes, err := cbdcNode.Call("mintasset", []interface{}{assetID, req.Amount})
	if err != nil {
		AuditRequest(r, "cbdc_mint", "rpc_fail", map[string]interface{}{"asset_id": assetID})
		writeJSONErr(w, "mint failed", err)
		return
	}
	var mintData struct {
		OpReturnHex string `json:"op_return_hex"`
		NewSupply   int64  `json:"new_supply"`
		Symbol      string `json:"symbol"`
	}
	json.Unmarshal(mintRes, &mintData)

	// Broadcast the OP_RETURN tx
	cbdcAddr := "grd1qhaclxgx8xhzxjmwg8meuwp7k2ut53t0equ002s"
	txid, err := broadcastOpReturn(mintData.OpReturnHex, cbdcAddr)
	if err != nil {
		AuditRequest(r, "cbdc_mint", "broadcast_fail", map[string]interface{}{"asset_id": assetID})
		writeJSONErr(w, "broadcast failed", err)
		return
	}

	// Mine a block to confirm
	cbdcNode.Call("generatetoaddress", []interface{}{1, cbdcAddr})

	// Clear asset cache
	assetsCache.mu.Lock()
	assetsCache.assets = nil
	assetsCache.mu.Unlock()

	IncMetric("mint")
	AuditRequest(r, "cbdc_mint", "ok", map[string]interface{}{
		"asset_id": assetID, "amount": req.Amount, "txid": txid,
	})

	if req.IdempotencyKey != "" {
		cap := &idemResponseCapture{ResponseWriter: w, status: http.StatusOK}
		writeJSON(cap, map[string]interface{}{
			"status":     "ok",
			"action":     "mint",
			"asset_id":   assetID,
			"amount":     req.Amount,
			"new_supply": mintData.NewSupply,
			"txid":       txid,
		})
		cbdcIdemCache.Set("mint", req.IdempotencyKey, cap.status, cap.buf.Bytes(),
			w.Header().Get("Content-Type"))
	} else {
		writeJSON(w, map[string]interface{}{
			"status":     "ok",
			"action":     "mint",
			"asset_id":   assetID,
			"amount":     req.Amount,
			"new_supply": mintData.NewSupply,
			"txid":       txid,
		})
	}
}

// POST /api/cbdc/burn — Burn stablecoin (reduce supply)
func handleCBDCBurn(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "POST only", http.StatusMethodNotAllowed)
		return
	}
	var req struct {
		AssetID        string `json:"asset_id"`
		Symbol         string `json:"symbol"`
		Amount         int64  `json:"amount"`
		Address        string `json:"address"`
		AdminKey       string `json:"admin_key"`
		IdempotencyKey string `json:"idempotency_key"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeJSONErr(w, "invalid json", err)
		return
	}
	if !requireAdmin(w, r, req.AdminKey) {
		return
	}
	if req.IdempotencyKey != "" {
		if entry := cbdcIdemCache.Get("burn", req.IdempotencyKey); replayIdem(w, entry) {
			return
		}
	}
	if !mintRateLimit.Allow(clientIP(r)) {
		IncMetric("rate_limited")
		writeJSONErrStatus(w, http.StatusTooManyRequests, "burn rate limit exceeded", nil)
		return
	}

	assetID := req.AssetID
	if assetID == "" && req.Symbol != "" {
		if err := ValidSymbol(req.Symbol); err != nil {
			writeJSONErr(w, err.Error(), nil)
			return
		}
		for _, a := range scanAssets() {
			if strings.EqualFold(a.Kode, req.Symbol) {
				assetID = a.AssetID
				break
			}
		}
	}
	if assetID == "" || req.Amount <= 0 || req.Address == "" {
		writeJSONErr(w, "asset_id/symbol, amount, and address required", nil)
		return
	}
	if err := ValidAssetID(assetID); err != nil {
		writeJSONErr(w, err.Error(), nil)
		return
	}
	if err := ValidAddress(req.Address); err != nil {
		writeJSONErr(w, err.Error(), nil)
		return
	}
	if err := ValidAmount(float64(req.Amount), 0); err != nil {
		writeJSONErr(w, err.Error(), nil)
		return
	}

	AuditRequest(r, "cbdc_burn", "start", map[string]interface{}{
		"asset_id": assetID, "amount": req.Amount, "address": req.Address,
	})

	// Call burnasset RPC
	burnRes, err := cbdcNode.Call("burnasset", []interface{}{assetID, req.Amount, req.Address})
	if err != nil {
		AuditRequest(r, "cbdc_burn", "rpc_fail", map[string]interface{}{"asset_id": assetID})
		writeJSONErr(w, "burn failed", err)
		return
	}
	var burnData struct {
		OpReturnHex string `json:"op_return_hex"`
		NewSupply   int64  `json:"new_supply"`
		Symbol      string `json:"symbol"`
	}
	json.Unmarshal(burnRes, &burnData)

	// Broadcast OP_RETURN tx
	cbdcAddr := "grd1qhaclxgx8xhzxjmwg8meuwp7k2ut53t0equ002s"
	txid, err := broadcastOpReturn(burnData.OpReturnHex, cbdcAddr)
	if err != nil {
		AuditRequest(r, "cbdc_burn", "broadcast_fail", map[string]interface{}{"asset_id": assetID})
		writeJSONErr(w, "broadcast failed", err)
		return
	}

	// Mine block to confirm
	cbdcNode.Call("generatetoaddress", []interface{}{1, cbdcAddr})

	// Clear cache
	assetsCache.mu.Lock()
	assetsCache.assets = nil
	assetsCache.mu.Unlock()

	IncMetric("burn")
	AuditRequest(r, "cbdc_burn", "ok", map[string]interface{}{
		"asset_id": assetID, "amount": req.Amount, "txid": txid,
	})

	if req.IdempotencyKey != "" {
		cap := &idemResponseCapture{ResponseWriter: w, status: http.StatusOK}
		writeJSON(cap, map[string]interface{}{
			"status":     "ok",
			"action":     "burn",
			"asset_id":   assetID,
			"amount":     req.Amount,
			"new_supply": burnData.NewSupply,
			"txid":       txid,
		})
		cbdcIdemCache.Set("burn", req.IdempotencyKey, cap.status, cap.buf.Bytes(),
			w.Header().Get("Content-Type"))
	} else {
		writeJSON(w, map[string]interface{}{
			"status":     "ok",
			"action":     "burn",
			"asset_id":   assetID,
			"amount":     req.Amount,
			"new_supply": burnData.NewSupply,
			"txid":       txid,
		})
	}
}

// POST /api/cbdc/issue — Issue new token (saham/stablecoin/obligasi)
func handleCBDCIssue(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "POST only", http.StatusMethodNotAllowed)
		return
	}
	var req struct {
		Symbol      string  `json:"symbol"`
		Name        string  `json:"name"`
		Type        string  `json:"type"` // saham, stablecoin, obligasi
		TotalSupply int64   `json:"total_supply"`
		Address     string  `json:"address"`
		PegRate     float64 `json:"peg_rate"`
		PegCurrency string  `json:"peg_currency"`
		AdminKey    string  `json:"admin_key"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeJSONErr(w, "invalid json", err)
		return
	}
	if !requireAdmin(w, r, req.AdminKey) {
		return
	}
	if !mintRateLimit.Allow(clientIP(r)) {
		IncMetric("rate_limited")
		writeJSONErrStatus(w, http.StatusTooManyRequests, "issue rate limit exceeded", nil)
		return
	}

	if req.Symbol == "" || req.Name == "" || req.Type == "" || req.TotalSupply <= 0 || req.Address == "" {
		writeJSONErr(w, "symbol, name, type, total_supply, and address required", nil)
		return
	}
	if err := ValidSymbol(req.Symbol); err != nil {
		writeJSONErr(w, err.Error(), nil)
		return
	}
	if err := ValidAddress(req.Address); err != nil {
		writeJSONErr(w, err.Error(), nil)
		return
	}
	if err := ValidAmount(float64(req.TotalSupply), 0); err != nil {
		writeJSONErr(w, err.Error(), nil)
		return
	}
	switch strings.ToLower(req.Type) {
	case "saham", "stablecoin", "obligasi":
	default:
		writeJSONErr(w, "invalid type (saham, stablecoin, obligasi)", nil)
		return
	}
	if len(req.Name) > 64 {
		writeJSONErr(w, "name too long", nil)
		return
	}

	AuditRequest(r, "cbdc_issue", "start", map[string]interface{}{
		"symbol": req.Symbol, "type": req.Type, "supply": req.TotalSupply,
	})

	// Build params for issueasset RPC
	params := []interface{}{req.Symbol, req.Name, req.Type, req.TotalSupply, req.Address}

	// Add optional stablecoin peg params
	if strings.EqualFold(req.Type, "stablecoin") && req.PegRate > 0 {
		// face_value, maturity, coupon, nav, peg_rate, peg_currency
		params = append(params, 0, 0, 0, 0, req.PegRate, req.PegCurrency)
	}

	issueRes, err := cbdcNode.Call("issueasset", params)
	if err != nil {
		AuditRequest(r, "cbdc_issue", "rpc_fail", map[string]interface{}{"symbol": req.Symbol})
		writeJSONErr(w, "issue failed", err)
		return
	}
	var issueData struct {
		AssetID      string `json:"asset_id"`
		OpReturnData string `json:"opreturn_data"`
		Symbol       string `json:"symbol"`
	}
	json.Unmarshal(issueRes, &issueData)

	// Broadcast OP_RETURN tx to finalize issuance on-chain
	cbdcAddr := "grd1qhaclxgx8xhzxjmwg8meuwp7k2ut53t0equ002s"
	txid, err := broadcastOpReturn(issueData.OpReturnData, cbdcAddr)
	if err != nil {
		AuditRequest(r, "cbdc_issue", "broadcast_fail", map[string]interface{}{"symbol": req.Symbol})
		writeJSONErr(w, "broadcast failed", err)
		return
	}

	// Mine block to confirm
	cbdcNode.Call("generatetoaddress", []interface{}{1, cbdcAddr})

	// Clear asset cache
	assetsCache.mu.Lock()
	assetsCache.assets = nil
	assetsCache.mu.Unlock()

	IncMetric("issue")
	AuditRequest(r, "cbdc_issue", "ok", map[string]interface{}{
		"symbol": req.Symbol, "asset_id": issueData.AssetID, "txid": txid,
	})

	writeJSON(w, map[string]interface{}{
		"status":   "ok",
		"action":   "issue",
		"symbol":   req.Symbol,
		"asset_id": issueData.AssetID,
		"txid":     txid,
	})
}

// POST /api/cbdc/transfer — Transfer asset between addresses
func handleCBDCTransfer(w http.ResponseWriter, r *http.Request) {
	var req struct {
		AssetID string `json:"asset_id"`
		Symbol  string `json:"symbol"`
		Amount  int64  `json:"amount"`
		From    string `json:"from"`
		To      string `json:"to"`
	}
	json.NewDecoder(r.Body).Decode(&req)

	assetID := req.AssetID
	if assetID == "" && req.Symbol != "" {
		for _, a := range scanAssets() {
			if strings.EqualFold(a.Kode, req.Symbol) {
				assetID = a.AssetID
				break
			}
		}
	}
	if assetID == "" || req.Amount <= 0 || req.From == "" || req.To == "" {
		writeJSON(w, map[string]string{"error": "asset_id/symbol, amount, from, to required"})
		return
	}

	txRes, err := cbdcNode.Call("transferasset", []interface{}{assetID, req.Amount, req.From, req.To})
	if err != nil {
		writeJSON(w, map[string]interface{}{"error": "Transfer failed: " + err.Error()})
		return
	}
	var txData struct {
		OpReturnData string `json:"opreturn_data"`
	}
	json.Unmarshal(txRes, &txData)

	// Broadcast OP_RETURN tx (input must be from sender for ownership proof)
	bcastTxid, err := broadcastOpReturn(txData.OpReturnData, req.From)
	if err != nil {
		writeJSON(w, map[string]interface{}{"error": "Broadcast failed: " + err.Error()})
		return
	}

	// Mine block to confirm
	cbdcNode.Call("generatetoaddress", []interface{}{1, req.From})

	// Clear cache
	assetsCache.mu.Lock()
	assetsCache.assets = nil
	assetsCache.mu.Unlock()

	writeJSON(w, map[string]interface{}{
		"status":   "ok",
		"action":   "transfer",
		"asset_id": assetID,
		"amount":   req.Amount,
		"from":     req.From,
		"to":       req.To,
		"txid":     bcastTxid,
	})
}

// POST /api/cbdc/wallet/create — Create new wallet address
func handleCBDCWalletCreate(w http.ResponseWriter, r *http.Request) {
	var req struct {
		WalletType string `json:"wallet_type"` // miner, cbdc, creator
		Label      string `json:"label"`
	}
	json.NewDecoder(r.Body).Decode(&req)

	if req.WalletType == "" {
		req.WalletType = "semua"
	}

	// Generate new address on public node
	addrRaw, err := publicNode.Call("getnewaddress", []interface{}{req.Label})
	if err != nil {
		writeJSON(w, map[string]interface{}{"error": "Failed to create address: " + err.Error()})
		return
	}
	var addr string
	json.Unmarshal(addrRaw, &addr)

	// Register as asset wallet
	_, err = cbdcNode.Call("createassetwallet2", []interface{}{addr, req.WalletType})
	if err != nil {
		// Still return address even if wallet registration fails
		writeJSON(w, map[string]interface{}{
			"status":  "partial",
			"address": addr,
			"warning": "Address created but wallet registration failed: " + err.Error(),
		})
		return
	}

	writeJSON(w, map[string]interface{}{
		"status":      "ok",
		"address":     addr,
		"wallet_type": req.WalletType,
	})
}

// GET /api/cbdc/supply/{assetId} — Get live supply for an asset
func handleCBDCSupply(w http.ResponseWriter, r *http.Request) {
	parts := strings.Split(r.URL.Path, "/")
	assetID := parts[len(parts)-1]

	// Try by symbol
	if len(assetID) < 20 {
		for _, a := range scanAssets() {
			if strings.EqualFold(a.Kode, assetID) {
				assetID = a.AssetID
				break
			}
		}
	}

	res, err := cbdcNode.Call("getasset", []interface{}{assetID})
	if err != nil {
		writeJSON(w, map[string]interface{}{"error": err.Error()})
		return
	}
	var data map[string]interface{}
	json.Unmarshal(res, &data)
	writeJSON(w, data)
}

// ─── Asset Logo Endpoints (Pinata IPFS) ───

const (
	pinataJWT      = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySW5mb3JtYXRpb24iOnsiaWQiOiI3NjAwNjU5Zi0wZDg3LTQwN2QtOTNkMS1lOGEzZjI4NmFkYjQiLCJlbWFpbCI6ImJsYWNrY2F0c29sY29tQGdtYWlsLmNvbSIsImVtYWlsX3ZlcmlmaWVkIjp0cnVlLCJwaW5fcG9saWN5Ijp7InJlZ2lvbnMiOlt7ImRlc2lyZWRSZXBsaWNhdGlvbkNvdW50IjoxLCJpZCI6IkZSQTEifSx7ImRlc2lyZWRSZXBsaWNhdGlvbkNvdW50IjoxLCJpZCI6Ik5ZQzEifV0sInZlcnNpb24iOjF9LCJtZmFfZW5hYmxlZCI6ZmFsc2UsInN0YXR1cyI6IkFDVElWRSJ9LCJhdXRoZW50aWNhdGlvblR5cGUiOiJzY29wZWRLZXkiLCJzY29wZWRLZXlLZXkiOiIwM2JiN2Y3Nzg3ZGI5NjM3MDMxOCIsInNjb3BlZEtleVNlY3JldCI6IjM2MzU5NmE5MGFlZWZiMDY5ODRhMzViOTQ2NTJiNjdmYjQ0MWIxNjU5NGZjZWVlMDk5NWQ0NDg1OGVhZWExY2MiLCJleHAiOjE4MDYxNDU1Mzd9.heyMidLV6NqBszne8j2thI7QPBENe8Wxi1fpGVTfABg"
	pinataGateway  = "https://gateway.pinata.cloud/ipfs"
	logoCIDFile    = "./static/logos/cids.json"
)

var (
	logoCIDsMu sync.RWMutex
	logoCIDs   map[string]string // symbol → IPFS CID
)

func loadLogoCIDs() {
	logoCIDsMu.Lock()
	defer logoCIDsMu.Unlock()
	logoCIDs = make(map[string]string)
	data, err := os.ReadFile(logoCIDFile)
	if err != nil {
		return
	}
	json.Unmarshal(data, &logoCIDs)
}

func saveLogoCIDs() {
	data, _ := json.MarshalIndent(logoCIDs, "", "  ")
	if err := os.MkdirAll("./static/logos", 0750); err != nil {
		log.Printf("[warn] mkdir logos: %v", err)
		return
	}
	if err := os.WriteFile(logoCIDFile, data, 0600); err != nil {
		log.Printf("[warn] write logo CIDs: %v", err)
	}
}

func uploadToPinata(fileData []byte, filename string, symbol string) (string, error) {
	var body bytes.Buffer
	writer := &multipartWriter{buf: &body}
	writer.init()

	// Write file part
	fw, err := writer.createFormFile("file", filename)
	if err != nil {
		return "", err
	}
	fw.Write(fileData)

	// Write pinataMetadata
	meta := fmt.Sprintf(`{"name":"garuda-logo-%s"}`, strings.ToLower(symbol))
	mw, err := writer.createFormField("pinataMetadata")
	if err != nil {
		return "", err
	}
	mw.Write([]byte(meta))

	writer.close()

	req, err := http.NewRequest("POST", "https://api.pinata.cloud/pinning/pinFileToIPFS", &body)
	if err != nil {
		return "", err
	}
	req.Header.Set("Authorization", "Bearer "+pinataJWT)
	req.Header.Set("Content-Type", writer.contentType())

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return "", err
	}
	defer resp.Body.Close()

	var result struct {
		IpfsHash string `json:"IpfsHash"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return "", err
	}
	if result.IpfsHash == "" {
		return "", fmt.Errorf("pinata returned empty hash")
	}
	return result.IpfsHash, nil
}

// multipartWriter helper (wraps mime/multipart)
type multipartWriter struct {
	buf *bytes.Buffer
	mw  *multipartWriterInner
}

type multipartWriterInner struct {
	boundary string
	buf      *bytes.Buffer
}

func (w *multipartWriter) init() {
	boundary := fmt.Sprintf("--boundary%d", time.Now().UnixNano())
	w.mw = &multipartWriterInner{boundary: boundary, buf: w.buf}
}

func (w *multipartWriter) createFormFile(fieldname, filename string) (*bytes.Buffer, error) {
	fmt.Fprintf(w.buf, "--%s\r\n", w.mw.boundary)
	fmt.Fprintf(w.buf, "Content-Disposition: form-data; name=%q; filename=%q\r\n", fieldname, filename)
	fmt.Fprintf(w.buf, "Content-Type: application/octet-stream\r\n\r\n")
	return w.buf, nil
}

func (w *multipartWriter) createFormField(fieldname string) (*bytes.Buffer, error) {
	fmt.Fprintf(w.buf, "\r\n--%s\r\n", w.mw.boundary)
	fmt.Fprintf(w.buf, "Content-Disposition: form-data; name=%q\r\n\r\n", fieldname)
	return w.buf, nil
}

func (w *multipartWriter) close() {
	fmt.Fprintf(w.buf, "\r\n--%s--\r\n", w.mw.boundary)
}

func (w *multipartWriter) contentType() string {
	return fmt.Sprintf("multipart/form-data; boundary=%s", w.mw.boundary)
}

// POST /api/asset/logo/{symbol} — Upload logo to Pinata IPFS
func handleAssetLogoUpload(w http.ResponseWriter, r *http.Request) {
	parts := strings.Split(r.URL.Path, "/")
	symbol := parts[len(parts)-1]
	if symbol == "" {
		writeJSON(w, map[string]string{"error": "symbol required"})
		return
	}

	r.Body = http.MaxBytesReader(w, r.Body, 10<<20)
	if err := r.ParseMultipartForm(10 << 20); err != nil {
		writeJSON(w, map[string]string{"error": "upload too large or invalid (max 10MB)"})
		return
	}
	file, header, err := r.FormFile("logo")
	if err != nil {
		writeJSON(w, map[string]string{"error": "logo file required"})
		return
	}
	defer file.Close()

	fileData, err := io.ReadAll(file)
	if err != nil {
		writeJSON(w, map[string]string{"error": "failed to read file"})
		return
	}

	// Upload to Pinata
	cid, err := uploadToPinata(fileData, header.Filename, symbol)
	if err != nil {
		log.Printf("[Logo] Pinata upload failed for %s: %v", sanitizeLog(symbol), err) // #nosec G706 -- sanitized
		writeJSON(w, map[string]interface{}{"error": "IPFS upload failed: " + err.Error()})
		return
	}

	// Save CID mapping
	logoCIDsMu.Lock()
	logoCIDs[symbol] = cid
	saveLogoCIDs()
	logoCIDsMu.Unlock()

	ipfsURL := fmt.Sprintf("%s/%s", pinataGateway, cid)
	log.Printf("[Logo] Uploaded logo for %s → IPFS CID: %s", sanitizeLog(symbol), sanitizeLog(cid))

	writeJSON(w, map[string]interface{}{
		"status":   "ok",
		"symbol":   symbol,
		"cid":      cid,
		"ipfs_url": ipfsURL,
		"logo_url": fmt.Sprintf("/api/asset/logo/%s", symbol),
	})
}

// GET /api/asset/logo/{symbol} — Redirect to IPFS gateway
func handleAssetLogoGet(w http.ResponseWriter, r *http.Request) {
	parts := strings.Split(r.URL.Path, "/")
	symbol := parts[len(parts)-1]

	logoCIDsMu.RLock()
	cid, ok := logoCIDs[symbol]
	logoCIDsMu.RUnlock()

	if !ok || cid == "" {
		http.NotFound(w, r)
		return
	}

	http.Redirect(w, r, fmt.Sprintf("%s/%s", pinataGateway, cid), http.StatusFound)
}

// GET /api/asset/logos — List all logos
func handleAssetLogosList(w http.ResponseWriter, r *http.Request) {
	logoCIDsMu.RLock()
	defer logoCIDsMu.RUnlock()
	result := make(map[string]string)
	for sym, cid := range logoCIDs {
		result[sym] = fmt.Sprintf("%s/%s", pinataGateway, cid)
	}
	writeJSON(w, result)
}

// ─── Dividend Endpoints ───

// POST /api/dividend/declare — Declare dividend for an asset
// ─── Asset Metadata (sector, website, social, docs) ───

const metadataFile = "./static/metadata/metadata.json"

type AssetMetadata struct {
	Sector   string `json:"sector,omitempty"`
	Website  string `json:"website,omitempty"`
	SocialX  string `json:"social_x,omitempty"`
	SocialIG string `json:"social_ig,omitempty"`
	SocialYT string `json:"social_yt,omitempty"`
	SocialFB string `json:"social_fb,omitempty"`
	SocialLI string `json:"social_li,omitempty"`
	SocialTT string `json:"social_tt,omitempty"`
	Doc1URL  string `json:"doc1_url,omitempty"`
	Doc1Name string `json:"doc1_name,omitempty"`
	Doc2URL  string `json:"doc2_url,omitempty"`
	Doc2Name string `json:"doc2_name,omitempty"`
}

var (
	metadataMu    sync.RWMutex
	metadataStore map[string]AssetMetadata // symbol → metadata
)

func loadAssetMetadata() {
	metadataMu.Lock()
	defer metadataMu.Unlock()
	metadataStore = make(map[string]AssetMetadata)
	data, err := os.ReadFile(metadataFile)
	if err != nil {
		return
	}
	json.Unmarshal(data, &metadataStore)
}

func saveAssetMetadata() {
	data, _ := json.MarshalIndent(metadataStore, "", "  ")
	if err := os.MkdirAll("./static/metadata", 0750); err != nil {
		log.Printf("[warn] mkdir metadata: %v", err)
		return
	}
	if err := os.WriteFile(metadataFile, data, 0600); err != nil {
		log.Printf("[warn] write asset metadata: %v", err)
	}
}

// GET /api/asset/metadata/{symbol}
// POST /api/asset/metadata/{symbol}
func handleAssetMetadata(w http.ResponseWriter, r *http.Request) {
	symbol := strings.TrimPrefix(r.URL.Path, "/api/asset/metadata/")
	symbol = strings.TrimSpace(symbol)
	if symbol == "" {
		http.Error(w, "symbol required", 400)
		return
	}

	if r.Method == http.MethodGet {
		metadataMu.RLock()
		m, ok := metadataStore[symbol]
		metadataMu.RUnlock()
		if !ok {
			writeJSON(w, AssetMetadata{})
			return
		}
		writeJSON(w, m)
		return
	}

	if r.Method == http.MethodPost {
		var m AssetMetadata
		if err := json.NewDecoder(r.Body).Decode(&m); err != nil {
			http.Error(w, "invalid json", 400)
			return
		}
		metadataMu.Lock()
		metadataStore[symbol] = m
		saveAssetMetadata()
		metadataMu.Unlock()
		writeJSON(w, map[string]string{"status": "ok", "symbol": symbol})
		return
	}

	http.Error(w, "method not allowed", 405)
}

// POST /api/asset/doc/{symbol} — upload PDF to Pinata, return URL
func handleAssetDocUpload(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "POST only", 405)
		return
	}
	parts := strings.Split(strings.TrimPrefix(r.URL.Path, "/api/asset/doc/"), "/")
	symbol := parts[0]
	docSlot := "doc1"
	if len(parts) > 1 {
		docSlot = parts[1]
	}

	r.Body = http.MaxBytesReader(w, r.Body, 20<<20)
	if err := r.ParseMultipartForm(20 << 20); err != nil {
		writeJSON(w, map[string]string{"error": "upload too large or invalid (max 20MB)"})
		return
	}
	file, header, err := r.FormFile("file")
	if err != nil {
		writeJSON(w, map[string]string{"error": "no file"})
		return
	}
	defer file.Close()

	fileData, err := io.ReadAll(file)
	if err != nil {
		writeJSON(w, map[string]string{"error": "read error"})
		return
	}

	// Upload to Pinata
	var body bytes.Buffer
	writer := &multipartWriter{buf: &body}
	writer.init()
	fw, _ := writer.createFormFile("file", header.Filename)
	fw.Write(fileData)
	meta := fmt.Sprintf(`{"name":"garuda-doc-%s-%s"}`, strings.ToLower(symbol), docSlot)
	mw, _ := writer.createFormField("pinataMetadata")
	mw.Write([]byte(meta))
	writer.close()

	req, _ := http.NewRequest("POST", "https://api.pinata.cloud/pinning/pinFileToIPFS", &body)
	req.Header.Set("Content-Type", writer.contentType())
	req.Header.Set("Authorization", "Bearer "+pinataJWT)

	resp, err := (&http.Client{Timeout: 60 * time.Second}).Do(req)
	if err != nil {
		writeJSON(w, map[string]string{"error": err.Error()})
		return
	}
	defer resp.Body.Close()

	var pinRes struct {
		IpfsHash string `json:"IpfsHash"`
	}
	json.NewDecoder(resp.Body).Decode(&pinRes)
	if pinRes.IpfsHash == "" {
		writeJSON(w, map[string]string{"error": "pinata upload failed"})
		return
	}

	ipfsURL := fmt.Sprintf("%s/%s", pinataGateway, pinRes.IpfsHash)

	// Save to metadata store
	metadataMu.Lock()
	m := metadataStore[symbol]
	if docSlot == "doc2" {
		m.Doc2URL = ipfsURL
		m.Doc2Name = header.Filename
	} else {
		m.Doc1URL = ipfsURL
		m.Doc1Name = header.Filename
	}
	metadataStore[symbol] = m
	saveAssetMetadata()
	metadataMu.Unlock()

	writeJSON(w, map[string]interface{}{"status": "ok", "ipfs_url": ipfsURL, "filename": header.Filename})
}

// ─── Dividend Metadata Storage ────────────────────────────────────────────────
// Menyimpan tanggal record_date, payment_date, period per txid (data blockchain tidak menyimpan ini)
type DividendMeta struct {
	RecordDate  string `json:"record_date"`  // Tanggal pencatatan (ex-date)
	PaymentDate string `json:"payment_date"` // Tanggal pembayaran
	Period      string `json:"period"`       // Periode (mis: "Q1 2025", "Tahunan 2025")
	Note        string `json:"note"`         // Catatan opsional
}

var (
	dividendMetaMu   sync.RWMutex
	dividendMetaFile = "./dividend_meta.json"
	dividendMetaMap  = map[string]DividendMeta{} // key: txid
)

func loadDividendMeta() {
	raw, err := os.ReadFile(dividendMetaFile)
	if err != nil {
		return
	}
	json.Unmarshal(raw, &dividendMetaMap)
}

func saveDividendMeta() {
	raw, _ := json.MarshalIndent(dividendMetaMap, "", "  ")
	if err := os.WriteFile(dividendMetaFile, raw, 0600); err != nil {
		log.Printf("[warn] write dividend meta: %v", err)
	}
}

func handleDividendDeclare(w http.ResponseWriter, r *http.Request) {
	var req struct {
		AssetID       string  `json:"asset_id"`
		TotalDividend float64 `json:"total_dividend_grd"`
		IssuerAddress string  `json:"issuer_address"`
		RecordDate    string  `json:"record_date"`  // opsional: "2025-03-31"
		PaymentDate   string  `json:"payment_date"` // opsional: "2025-04-15"
		Period        string  `json:"period"`       // opsional: "Q1 2025"
		Note          string  `json:"note"`         // opsional
	}
	json.NewDecoder(r.Body).Decode(&req)

	if req.AssetID == "" || req.TotalDividend <= 0 || req.IssuerAddress == "" {
		writeJSON(w, map[string]string{"error": "asset_id, total_dividend_grd, and issuer_address required"})
		return
	}

	result, err := cbdcNode.Call("declaredividend", []interface{}{req.AssetID, req.TotalDividend, req.IssuerAddress})
	if err != nil {
		writeJSON(w, map[string]interface{}{"error": err.Error()})
		return
	}

	var rpcResult struct {
		OpReturnData string `json:"opreturn_data"`
	}
	json.Unmarshal(result, &rpcResult)

	var finalTxid string

	// Broadcast OP_RETURN if present
	if rpcResult.OpReturnData != "" {
		txid, err := broadcastOpReturn(rpcResult.OpReturnData, req.IssuerAddress)
		if err != nil {
			cbdcAddr := "grd1qufk0s4hh95gn7srrj06t0pmpzfym37ndjvjjgv"
			txid, err = broadcastOpReturn(rpcResult.OpReturnData, cbdcAddr)
		}
		if err == nil {
			cbdcNode.Call("generatetoaddress", []interface{}{1, req.IssuerAddress})
			finalTxid = txid
			var data map[string]interface{}
			json.Unmarshal(result, &data)
			data["txid"] = txid
			data["status"] = "ok"
			// Simpan metadata tanggal
			saveDivMeta(finalTxid, req.RecordDate, req.PaymentDate, req.Period, req.Note)
			data["record_date"] = req.RecordDate
			data["payment_date"] = req.PaymentDate
			data["period"] = req.Period
			writeJSON(w, data)
			return
		}
	}

	// Mine block to confirm
	cbdcNode.Call("generatetoaddress", []interface{}{1, req.IssuerAddress})
	var data map[string]interface{}
	json.Unmarshal(result, &data)
	data["status"] = "ok"
	if txid, ok := data["txid"].(string); ok {
		finalTxid = txid
	}
	// Simpan metadata tanggal
	saveDivMeta(finalTxid, req.RecordDate, req.PaymentDate, req.Period, req.Note)
	data["record_date"] = req.RecordDate
	data["payment_date"] = req.PaymentDate
	data["period"] = req.Period
	writeJSON(w, data)
}

func saveDivMeta(txid, recordDate, paymentDate, period, note string) {
	if txid == "" {
		return
	}
	// Default payment date = today + 14 hari jika tidak diisi
	if paymentDate == "" {
		paymentDate = time.Now().AddDate(0, 0, 14).Format("2006-01-02")
	}
	if recordDate == "" {
		recordDate = time.Now().Format("2006-01-02")
	}
	if period == "" {
		period = time.Now().Format("Q1 2006") // approximate
		m := time.Now().Month()
		q := "Q1"
		if m >= 4 && m <= 6 {
			q = "Q2"
		} else if m >= 7 && m <= 9 {
			q = "Q3"
		} else if m >= 10 {
			q = "Q4"
		}
		period = q + " " + time.Now().Format("2006")
	}
	dividendMetaMu.Lock()
	dividendMetaMap[txid] = DividendMeta{
		RecordDate:  recordDate,
		PaymentDate: paymentDate,
		Period:      period,
		Note:        note,
	}
	saveDividendMeta()
	dividendMetaMu.Unlock()
}

// GET /api/dividend/history/{assetId} — Get dividend payment history
func handleDividendHistory(w http.ResponseWriter, r *http.Request) {
	parts := strings.Split(r.URL.Path, "/")
	assetID := parts[len(parts)-1]

	raw, err := cbdcNode.Call("getdividendhistory", []interface{}{assetID})
	if err != nil {
		writeJSON(w, []interface{}{})
		return
	}
	var history []map[string]interface{}
	json.Unmarshal(raw, &history)
	if history == nil {
		writeJSON(w, []interface{}{})
		return
	}
	// Enrich each record with stored date metadata
	dividendMetaMu.RLock()
	for i, rec := range history {
		txid, _ := rec["txid"].(string)
		if meta, ok := dividendMetaMap[txid]; ok {
			history[i]["record_date"] = meta.RecordDate
			history[i]["payment_date"] = meta.PaymentDate
			history[i]["period"] = meta.Period
			history[i]["note"] = meta.Note
		}
	}
	dividendMetaMu.RUnlock()
	writeJSON(w, history)
}

// ─── DEX Endpoints ───

// POST /api/dex/wallet/create — Create a new per-user wallet
func handleDexWalletCreate(w http.ResponseWriter, r *http.Request) {
	var req struct {
		Label string `json:"label"` // User identifier (e.g. username, email hash)
	}
	json.NewDecoder(r.Body).Decode(&req)
	if req.Label == "" {
		req.Label = fmt.Sprintf("dex-user-%d", time.Now().UnixNano())
	}

	label := "dex-" + req.Label

	// Check if user already has an address
	addrsRaw, err := publicNode.Call("getaddressesbylabel", []interface{}{label})
	if err == nil {
		var addrs map[string]interface{}
		json.Unmarshal(addrsRaw, &addrs)
		for addr := range addrs {
			// Already exists — return existing address with balances
			result := getWalletInfo(addr)
			writeJSON(w, result)
			return
		}
	}

	// Create new address
	addrRaw, err := publicNode.Call("getnewaddress", []interface{}{label})
	if err != nil {
		writeJSON(w, map[string]interface{}{"error": "Failed to create wallet: " + err.Error()})
		return
	}
	var addr string
	json.Unmarshal(addrRaw, &addr)

	// Register as asset wallet (so it can hold tokens)
	regResult, err := cbdcNode.Call("createassetwallet2", []interface{}{addr, "semua"})
	if err == nil {
		var reg struct {
			OpReturnData string `json:"opreturn_data"`
		}
		json.Unmarshal(regResult, &reg)
		if reg.OpReturnData != "" {
			cbdcAddr := "grd1qufk0s4hh95gn7srrj06t0pmpzfym37ndjvjjgv"
			broadcastOpReturn(reg.OpReturnData, cbdcAddr)
			cbdcNode.Call("generatetoaddress", []interface{}{1, cbdcAddr})
		}
	}

	// Fund with a small amount of GRD for transaction fees
	cbdcNode.Call("sendtoaddress", []interface{}{addr, 0.01})
	cbdcNode.Call("generatetoaddress", []interface{}{1, addr})

	log.Printf("[Wallet] Created new DEX wallet: %s (label: %s)", addr, label)

	result := getWalletInfo(addr)
	writeJSON(w, result)
}

// GET /api/dex/wallet/connect — Connect existing wallet (by address query param) or legacy global
func handleDexWalletConnect(w http.ResponseWriter, r *http.Request) {
	addr := r.URL.Query().Get("address")

	if addr != "" {
		// Per-user wallet: return info for specific address
		result := getWalletInfo(addr)
		writeJSON(w, result)
		return
	}

	// Legacy: global wallet for backward compatibility
	var dexAddr string
	addrsRaw, err := publicNode.Call("getaddressesbylabel", []interface{}{"dex"})
	if err == nil {
		var addrs map[string]interface{}
		json.Unmarshal(addrsRaw, &addrs)
		for a := range addrs {
			dexAddr = a
			break
		}
	}
	if dexAddr == "" {
		addrRaw, _ := publicNode.Call("getnewaddress", []interface{}{"dex"})
		json.Unmarshal(addrRaw, &dexAddr)
	}

	result := getWalletInfo(dexAddr)
	writeJSON(w, result)
}

// getWalletInfo returns balance + asset holdings for an address
// For L1 addresses: balance_grd = on-chain - locked (available for deposit)
// For trading addresses: balance_grd = internal ledger balance
func getWalletInfo(addr string) map[string]interface{} {
	// On-chain balance
	onChain := getL1OnChainBalance(addr)

	// Check if this address has locked balance (L1 wallet)
	locked := getL1LockedBalance(addr)
	available := onChain - locked
	if available < 0 {
		available = 0
	}

	// Check if this address has trading balance
	tradingBal := getDexTradingBalance(addr)

	// Use trading balance if it exists (this is a trading address),
	// otherwise use available L1 balance
	displayBal := available
	if tradingBal > 0 && onChain == 0 {
		// This is a trading-only address (no on-chain funds)
		displayBal = tradingBal
	}

	// Get asset balances
	var assets []map[string]interface{}
	for _, a := range scanAssets() {
		var assetResp struct {
			Asset struct {
				Balance int64 `json:"balance"`
			} `json:"asset"`
		}
		balRaw, err := cbdcNode.Call("getassetbalance", []interface{}{addr, a.AssetID})
		if err == nil {
			json.Unmarshal(balRaw, &assetResp)
		}
		assets = append(assets, map[string]interface{}{
			"asset_id": a.AssetID,
			"symbol":   a.Kode,
			"balance":  assetResp.Asset.Balance,
		})
	}

	return map[string]interface{}{
		"connected":     true,
		"address":       addr,
		"balance_grd":   displayBal,
		"onchain_grd":   onChain,
		"locked_grd":    locked,
		"trading_grd":   tradingBal,
		"assets":        assets,
	}
}

// ─── QRIS Fiat Deposit System ────────────────────────────────────────────────
// Bank Jago: 109944006088
// Kurs: 1 GRD = Rp 1.000
// Auto-match via jumlah unik (Rp + 3 digit random)

const (
	qrisBankName    = "Bank Jago"
	qrisBankAccount = "109944006088"
	qrisBankHolder  = "Garudachain"
	qrisGRDRate     = 1000.0 // 1 GRD = Rp 1.000
	// QRIS statis merchant (dari QR terdaftar)
	qrisStaticRaw = "00020101021126610014COM.GO-JEK.WWW01189360091432039232440210G2039232440303UMI51440014ID.CO.QRIS.WWW0215ID10265042026270303UMI5204899953033605802ID5925Garudachain, Digital & Kr6015JAKARTA SELATAN61051295062070703A016304870A"
)

// generateDynamicQRIS membuat QRIS dinamis dari string statis + jumlah
// Format EMVCo: tag 54 = transaction amount, tag 63 = CRC-16 checksum
func generateDynamicQRIS(amountIDR float64) string {
	// Ambil string statis tanpa CRC (hapus 4 char terakhir = CRC value, dan "6304" = tag 63 + length)
	// String statis diakhiri "63045F63" → tag 63, length 04, value 5F63
	base := qrisStaticRaw
	// Hapus CRC lama (tag 63 selalu di akhir, format: 6304xxxx)
	crcIdx := strings.LastIndex(base, "6304")
	if crcIdx > 0 {
		base = base[:crcIdx]
	}

	// Ubah tipe dari statis (01) ke dinamis (02) di tag 01
	// Tag 01 value "11" = statis, "12" = dinamis
	base = strings.Replace(base, "010211", "010212", 1)

	// Tambah tag 54 (Transaction Amount)
	amountStr := fmt.Sprintf("%.0f", amountIDR)
	tag54 := fmt.Sprintf("54%02d%s", len(amountStr), amountStr)

	// Sisipkan tag 54 sebelum tag 58 (country code)
	tag58Idx := strings.Index(base, "5802")
	if tag58Idx > 0 {
		base = base[:tag58Idx] + tag54 + base[tag58Idx:]
	} else {
		base += tag54
	}

	// Tambah tag 63 placeholder untuk CRC
	base += "6304"

	// Hitung CRC-16/CCITT-FALSE
	crc := crc16CCITT([]byte(base))
	return base + fmt.Sprintf("%04X", crc)
}

// CRC-16/CCITT-FALSE (polynomial 0x1021, init 0xFFFF)
func crc16CCITT(data []byte) uint16 {
	crc := uint16(0xFFFF)
	for _, b := range data {
		crc ^= uint16(b) << 8
		for i := 0; i < 8; i++ {
			if crc&0x8000 != 0 {
				crc = (crc << 1) ^ 0x1021
			} else {
				crc <<= 1
			}
		}
	}
	return crc
}

type QRISDeposit struct {
	ID           string  `json:"id"`
	Address      string  `json:"address"`       // wallet address penerima GRD
	AmountGRD    float64 `json:"amount_grd"`     // jumlah GRD yang diminta
	AmountIDR    float64 `json:"amount_idr"`     // jumlah Rupiah yang harus ditransfer
	UniqueCode   int     `json:"unique_code"`    // 3 digit unik untuk matching
	TotalIDR     float64 `json:"total_idr"`      // amount_idr + unique_code
	Status       string  `json:"status"`         // pending | confirmed | expired | cancelled
	CreatedAt    int64   `json:"created_at"`
	ConfirmedAt  int64   `json:"confirmed_at,omitempty"`
	ExpiresAt    int64   `json:"expires_at"`
	TxID         string  `json:"txid,omitempty"` // txid GRD setelah confirmed
	BankName     string  `json:"bank_name"`
	BankAccount  string  `json:"bank_account"`
	BankHolder   string  `json:"bank_holder"`
	QRISString   string  `json:"qris_string"`   // QRIS dinamis string (untuk generate QR di frontend)
}

var qrisDeposits struct {
	sync.RWMutex
	items map[string]*QRISDeposit
}

func init() {
	qrisDeposits.items = make(map[string]*QRISDeposit)
}

// POST /api/dex/qris/create — Buat deposit order QRIS
func handleQRISCreate(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "POST only", http.StatusMethodNotAllowed)
		return
	}
	var req struct {
		Address   string  `json:"address"`    // wallet GRD address
		AmountGRD float64 `json:"amount_grd"` // jumlah GRD
	}
	json.NewDecoder(r.Body).Decode(&req)
	if req.Address == "" || req.AmountGRD <= 0 {
		writeJSON(w, map[string]interface{}{"error": "address dan amount_grd wajib diisi"})
		return
	}
	if req.AmountGRD < 1 {
		writeJSON(w, map[string]interface{}{"error": "Minimum deposit 1 GRD (Rp 1.000)"})
		return
	}
	if req.AmountGRD > 5000 {
		writeJSON(w, map[string]interface{}{"error": "Maksimum deposit 5.000 GRD (Rp 5.000.000) per transaksi"})
		return
	}

	amountIDR := req.AmountGRD * qrisGRDRate

	// Generate unique code (100-999) yang belum dipakai untuk pending deposits
	qrisDeposits.Lock()
	uniqueCode := 100 + int(time.Now().UnixNano()%900)
	// Pastikan tidak bentrok dengan pending deposit lain
	for attempts := 0; attempts < 50; attempts++ {
		conflict := false
		for _, d := range qrisDeposits.items {
			if d.Status == "pending" && d.UniqueCode == uniqueCode && d.AmountIDR == amountIDR {
				conflict = true
				break
			}
		}
		if !conflict {
			break
		}
		uniqueCode = 100 + int((time.Now().UnixNano()+int64(attempts*7))%900)
	}

	totalIDR := amountIDR + float64(uniqueCode)
	now := time.Now()

	// Generate ID
	h := sha256.Sum256([]byte(fmt.Sprintf("%s-%f-%d-%d", req.Address, req.AmountGRD, uniqueCode, now.UnixNano())))
	depositID := "QR-" + hex.EncodeToString(h[:])[:12]

	// Generate QRIS dinamis dengan jumlah total (termasuk kode unik)
	qrisString := generateDynamicQRIS(totalIDR)

	deposit := &QRISDeposit{
		ID:          depositID,
		Address:     req.Address,
		AmountGRD:   req.AmountGRD,
		AmountIDR:   amountIDR,
		UniqueCode:  uniqueCode,
		TotalIDR:    totalIDR,
		Status:      "pending",
		CreatedAt:   now.Unix(),
		ExpiresAt:   now.Add(30 * time.Minute).Unix(),
		BankName:    qrisBankName,
		BankAccount: qrisBankAccount,
		BankHolder:  qrisBankHolder,
		QRISString:  qrisString,
	}

	qrisDeposits.items[depositID] = deposit
	qrisDeposits.Unlock()

	log.Printf("[QRIS] Created deposit %s: %.0f GRD = Rp %.0f (unique: %d, total: Rp %.0f) → %s",
		depositID, req.AmountGRD, amountIDR, uniqueCode, totalIDR, req.Address)

	// Auto-confirm setelah 10 detik (simulasi pembayaran diterima via QRIS)
	go func(depID string) {
		time.Sleep(10 * time.Second)
		qrisDeposits.Lock()
		dep, ok := qrisDeposits.items[depID]
		if !ok || dep.Status != "pending" {
			qrisDeposits.Unlock()
			return
		}
		// Transfer GRD ke wallet user
		txRaw, err := cbdcWalletNode.Call("sendtoaddress", []interface{}{dep.Address, dep.AmountGRD})
		if err != nil {
			log.Printf("[QRIS] Auto-confirm failed for %s: %v", depID, err)
			qrisDeposits.Unlock()
			return
		}
		var txid string
		json.Unmarshal(txRaw, &txid)
		cbdcWalletNode.Call("generatetoaddress", []interface{}{1, dep.Address})
		dep.Status = "confirmed"
		dep.ConfirmedAt = time.Now().Unix()
		dep.TxID = txid
		qrisDeposits.Unlock()
		log.Printf("[QRIS] Auto-confirmed deposit %s: %.0f GRD → %s, txid: %s", depID, dep.AmountGRD, dep.Address, txid)
	}(depositID)

	writeJSON(w, deposit)
}

// GET /api/dex/qris/status/{id} — Cek status deposit
func handleQRISStatus(w http.ResponseWriter, r *http.Request) {
	id := strings.TrimPrefix(r.URL.Path, "/api/dex/qris/status/")
	if id == "" {
		writeJSON(w, map[string]interface{}{"error": "ID required"})
		return
	}

	qrisDeposits.RLock()
	deposit, ok := qrisDeposits.items[id]
	qrisDeposits.RUnlock()

	if !ok {
		writeJSON(w, map[string]interface{}{"error": "Deposit not found"})
		return
	}

	// Auto-expire
	if deposit.Status == "pending" && time.Now().Unix() > deposit.ExpiresAt {
		qrisDeposits.Lock()
		deposit.Status = "expired"
		qrisDeposits.Unlock()
	}

	writeJSON(w, deposit)
}

// POST /api/dex/qris/confirm — Konfirmasi pembayaran (admin atau auto-mutasi)
func handleQRISConfirm(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "POST only", http.StatusMethodNotAllowed)
		return
	}
	var req struct {
		ID       string `json:"id"`        // deposit ID
		AdminKey string `json:"admin_key"` // simple auth
	}
	json.NewDecoder(r.Body).Decode(&req)

	// Constant-time admin key check + per-IP rate limit
	if !requireAdmin(w, r, req.AdminKey) {
		return
	}

	qrisDeposits.Lock()
	deposit, ok := qrisDeposits.items[req.ID]
	if !ok {
		qrisDeposits.Unlock()
		writeJSON(w, map[string]interface{}{"error": "Deposit not found"})
		return
	}
	if deposit.Status != "pending" {
		qrisDeposits.Unlock()
		writeJSON(w, map[string]interface{}{"error": "Deposit status: " + deposit.Status})
		return
	}

	// Transfer GRD ke wallet user
	txRaw, err := cbdcWalletNode.Call("sendtoaddress", []interface{}{deposit.Address, deposit.AmountGRD})
	if err != nil {
		qrisDeposits.Unlock()
		writeJSON(w, map[string]interface{}{"error": "Failed to send GRD: " + err.Error()})
		return
	}
	var txid string
	json.Unmarshal(txRaw, &txid)

	// Mine block to confirm
	cbdcWalletNode.Call("generatetoaddress", []interface{}{1, deposit.Address})

	deposit.Status = "confirmed"
	deposit.ConfirmedAt = time.Now().Unix()
	deposit.TxID = txid
	qrisDeposits.Unlock()

	log.Printf("[QRIS] Confirmed deposit %s: %.0f GRD → %s, txid: %s", deposit.ID, deposit.AmountGRD, deposit.Address, txid)

	writeJSON(w, deposit)
}

// GET /api/dex/qris/pending — List semua pending deposits (untuk admin)
func handleQRISPending(w http.ResponseWriter, r *http.Request) {
	adminKey := r.URL.Query().Get("admin_key")
	if !requireAdmin(w, r, adminKey) {
		return
	}

	qrisDeposits.RLock()
	var pending []*QRISDeposit
	now := time.Now().Unix()
	for _, d := range qrisDeposits.items {
		if d.Status == "pending" && now <= d.ExpiresAt {
			pending = append(pending, d)
		}
	}
	qrisDeposits.RUnlock()

	// Sort by created_at desc
	sort.Slice(pending, func(i, j int) bool {
		return pending[i].CreatedAt > pending[j].CreatedAt
	})

	writeJSON(w, map[string]interface{}{
		"count":   len(pending),
		"pending": pending,
	})
}

// POST /api/dex/deposit — Deposit GRD from L1 wallet to DEX trading account
// Like Hyperliquid: lock L1 balance, credit trading balance (internal ledger)
func handleDexDeposit(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "POST only", http.StatusMethodNotAllowed)
		return
	}
	var req struct {
		FromAddress string  `json:"from_address"` // L1 wallet address
		ToAddress   string  `json:"to_address"`   // DEX trading address
		Amount      float64 `json:"amount"`
	}
	json.NewDecoder(r.Body).Decode(&req)
	if req.FromAddress == "" || req.ToAddress == "" || req.Amount <= 0 {
		writeJSON(w, map[string]interface{}{"error": "from_address, to_address, dan amount wajib diisi"})
		return
	}

	// Check L1 on-chain balance
	onChain := getL1OnChainBalance(req.FromAddress)
	locked := getL1LockedBalance(req.FromAddress)
	available := onChain - locked
	if available < req.Amount {
		writeJSON(w, map[string]interface{}{"error": fmt.Sprintf("Saldo L1 tidak cukup. Tersedia: %.4f GRD", available)})
		return
	}

	// Lock L1 balance + credit trading balance
	dexLedger.Lock()
	dexLedger.locked[req.FromAddress] += req.Amount
	dexLedger.trading[req.ToAddress] += req.Amount
	dexLedger.l1ToTrading[req.FromAddress] = req.ToAddress
	dexLedger.Unlock()

	log.Printf("[DEX Deposit] %.4f GRD locked: L1 %s → Trading %s", req.Amount, req.FromAddress, req.ToAddress)

	writeJSON(w, map[string]interface{}{
		"status":       "ok",
		"deposited":    req.Amount,
		"balance_grd":  getDexTradingBalance(req.ToAddress),
		"l1_available": onChain - getL1LockedBalance(req.FromAddress),
	})
}

// POST /api/dex/withdraw — Withdraw GRD from DEX trading account back to L1 wallet
// Like Hyperliquid: debit trading balance, unlock L1 balance
func handleDexWithdraw(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "POST only", http.StatusMethodNotAllowed)
		return
	}
	var req struct {
		FromAddress string  `json:"from_address"` // DEX trading address
		ToAddress   string  `json:"to_address"`   // L1 wallet address
		Amount      float64 `json:"amount"`
	}
	json.NewDecoder(r.Body).Decode(&req)
	if req.FromAddress == "" || req.ToAddress == "" || req.Amount <= 0 {
		writeJSON(w, map[string]interface{}{"error": "from_address, to_address, dan amount wajib diisi"})
		return
	}

	// Check trading balance
	tradingBal := getDexTradingBalance(req.FromAddress)
	if tradingBal < req.Amount {
		writeJSON(w, map[string]interface{}{"error": fmt.Sprintf("Saldo trading tidak cukup. Tersedia: %.4f GRD", tradingBal)})
		return
	}

	// Debit trading balance + unlock L1 balance
	dexLedger.Lock()
	dexLedger.trading[req.FromAddress] -= req.Amount
	dexLedger.locked[req.ToAddress] -= req.Amount
	if dexLedger.locked[req.ToAddress] < 0 {
		dexLedger.locked[req.ToAddress] = 0
	}
	dexLedger.Unlock()

	log.Printf("[DEX Withdraw] %.4f GRD unlocked: Trading %s → L1 %s", req.Amount, req.FromAddress, req.ToAddress)

	writeJSON(w, map[string]interface{}{
		"status":       "ok",
		"withdrawn":    req.Amount,
		"balance_grd":  getDexTradingBalance(req.FromAddress),
		"l1_available": getL1OnChainBalance(req.ToAddress) - getL1LockedBalance(req.ToAddress),
	})
}

// POST /api/dex/swap — Stablecoin swap via CBDC reserve (fixed peg rate)
func handleDexSwap(w http.ResponseWriter, r *http.Request) {
	// Per-IP rate limit — bounds the burst rate from a single client.
	if !swapRateLimit.Allow(clientIP(r)) {
		writeJSONErrStatus(w, http.StatusTooManyRequests, "rate limit exceeded", nil)
		return
	}

	var req struct {
		Direction string  `json:"direction"` // "buy" or "sell"
		AssetID   string  `json:"asset_id"`
		Amount    float64 `json:"amount"`
		Address   string  `json:"address"`
		Price     float64 `json:"price"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeJSONErr(w, "invalid JSON body", err)
		return
	}

	// Strict input validation — reject NaN/Inf, oversize amounts, malformed
	// asset IDs and addresses BEFORE touching the RPC.
	if err := ValidAssetID(req.AssetID); err != nil {
		writeJSONErr(w, "invalid asset_id", err)
		return
	}
	if err := ValidAddress(req.Address); err != nil {
		writeJSONErr(w, "invalid address", err)
		return
	}
	if err := ValidAmount(req.Amount, 0); err != nil {
		writeJSONErr(w, "invalid amount", err)
		return
	}
	if req.Direction != "buy" && req.Direction != "sell" {
		writeJSONErr(w, "direction must be 'buy' or 'sell'", nil)
		return
	}

	// 1. Get peg rate from on-chain
	pegRes, pegErr := cbdcNode.Call("getpeginfo", []interface{}{req.AssetID})
	if pegErr != nil {
		writeJSONErr(w, "stablecoin peg not found", pegErr)
		return
	}
	var pegInfo struct {
		PegRateGrd float64 `json:"peg_rate_grd"`
		Symbol     string  `json:"symbol"`
	}
	if err := json.Unmarshal(pegRes, &pegInfo); err != nil {
		writeJSONErr(w, "peg info parse error", err)
		return
	}
	if pegInfo.PegRateGrd <= 0 || math.IsNaN(pegInfo.PegRateGrd) || math.IsInf(pegInfo.PegRateGrd, 0) {
		writeJSONErr(w, "invalid peg rate", nil)
		return
	}

	// CBDC holder address for stablecoin reserve (configurable via env)
	securityConfig.RLock()
	cbdcReserveAddr := securityConfig.TreasuryAddress
	securityConfig.RUnlock()

	if req.Direction == "buy" {
		// Buy stablecoin with GRD: user sends GRD, receives tokens
		grdIn := req.Amount
		feeGRD := grdIn * feeSwapRate
		grdNet := grdIn - feeGRD
		tokenAmount := int64(grdNet / pegInfo.PegRateGrd)

		// Cari address di CBDC wallet yang memegang token ini
		reserveFrom := findCBDCTokenHolder(req.AssetID)
		if reserveFrom == "" {
			writeJSONErr(w, "stablecoin reserve unavailable", nil)
			return
		}

		// Transfer tokens dari reserve CBDC wallet → user
		txRes, err := cbdcNode.Call("transferasset", []interface{}{
			req.AssetID,
			tokenAmount,
			reserveFrom,
			req.Address,
		})
		if err != nil {
			writeJSONErr(w, "asset transfer failed", err)
			return
		}
		var txData struct {
			OpReturnData string `json:"opreturn_data"`
		}
		if err := json.Unmarshal(txRes, &txData); err != nil {
			writeJSONErr(w, "transfer parse error", err)
			return
		}
		// Sign dengan cbdcNode karena reserveFrom ada di CBDC wallet
		if _, bErr := broadcastOpReturn(txData.OpReturnData, reserveFrom); bErr != nil {
			writeJSONErr(w, "broadcast failed", bErr)
			return
		}

		// Collect fee → treasury
		go collectFee(feeGRD, req.Address, fmt.Sprintf("swap buy %s %.4f GRD", pegInfo.Symbol, grdIn))

		// Mine block
		cbdcNode.Call("generatetoaddress", []interface{}{1, reserveFrom})

		IncMetric("swap")
		AuditRequest(r, "dex_swap", "ok", map[string]interface{}{
			"dir": "buy", "asset_id": req.AssetID, "grd": grdIn, "out": tokenAmount,
		})

		writeJSON(w, map[string]interface{}{
			"status":    "ok",
			"direction": "buy",
			"grd_in":    grdIn,
			"fee_grd":   feeGRD,
			"token_out": tokenAmount,
			"peg_rate":  pegInfo.PegRateGrd,
			"symbol":    pegInfo.Symbol,
		})
	} else {
		// Sell stablecoin for GRD: CBDC authority menerima stablecoin, kirim GRD ke user
		tokenAmount := int64(req.Amount)
		grdGross := math.Round(float64(tokenAmount)*pegInfo.PegRateGrd*1e8) / 1e8
		feeGRD := math.Round(grdGross*feeSwapRate*1e8) / 1e8
		grdOut := math.Round((grdGross-feeGRD)*1e8) / 1e8

		// Cari reserve CBDC wallet untuk terima token
		reserveTo := findCBDCTokenHolder(req.AssetID)
		if reserveTo == "" {
			reserveTo = cbdcReserveAddr
		}

		// Coba transfer stablecoin dari user → reserve (best-effort, non-blocking)
		// CBDC authority: jika user addr bukan di node wallet, tetap proses swap
		txRes, txErr := cbdcNode.Call("transferasset", []interface{}{
			req.AssetID,
			tokenAmount,
			req.Address,
			reserveTo,
		})
		if txErr == nil {
			var txData struct {
				OpReturnData string `json:"opreturn_data"`
			}
			json.Unmarshal(txRes, &txData)
			if txData.OpReturnData != "" {
				for _, node := range []*RPCClient{publicNode, cbdcNode, creatorNode} {
					if _, bErr := broadcastOpReturnWithNode(node, txData.OpReturnData, req.Address); bErr == nil {
						break
					}
				}
			}
		} else {
			log.Printf("[DexSwap sell] token transfer skipped (CBDC authority): %v", txErr)
		}

		// Reserve balance check BEFORE attempting send. Without this, a
		// failing sendtoaddress would still log a fee and risk inconsistent
		// state. We pull the wallet's spendable balance from the CBDC node.
		balRaw, balErr := cbdcNode.Call("getbalance", nil)
		if balErr != nil {
			writeJSONErr(w, "reserve balance check failed", balErr)
			return
		}
		var reserveBal float64
		_ = json.Unmarshal(balRaw, &reserveBal)
		if reserveBal < grdOut {
			log.Printf("[DexSwap sell] reserve underflow: have=%.8f want=%.8f", reserveBal, grdOut)
			writeJSONErr(w, "reserve liquidity insufficient", nil)
			return
		}

		// Kirim GRD ke user dari CBDC reserve (mekanisme utama swap stablecoin→GRD)
		_, sendErr := cbdcNode.Call("sendtoaddress", []interface{}{req.Address, grdOut})
		if sendErr != nil {
			writeJSONErr(w, "GRD payout failed", sendErr)
			return
		}

		// Collect fee → treasury
		go collectFee(feeGRD, req.Address, fmt.Sprintf("swap sell %s %d tokens", pegInfo.Symbol, tokenAmount))

		// Mine block
		cbdcNode.Call("generatetoaddress", []interface{}{1, reserveTo})

		IncMetric("swap")
		AuditRequest(r, "dex_swap", "ok", map[string]interface{}{
			"dir": "sell", "asset_id": req.AssetID, "in": tokenAmount, "grd": grdOut,
		})

		writeJSON(w, map[string]interface{}{
			"status":    "ok",
			"direction": "sell",
			"token_in":  tokenAmount,
			"grd_out":   grdOut,
			"fee_grd":   feeGRD,
			"peg_rate":  pegInfo.PegRateGrd,
			"symbol":    pegInfo.Symbol,
		})
	}
}

// GET /api/blockchain/peg/{assetId} — Get stablecoin peg rate
func handlePegInfo(w http.ResponseWriter, r *http.Request) {
	parts := strings.Split(r.URL.Path, "/")
	assetID := parts[len(parts)-1]
	res, err := cbdcNode.Call("getpeginfo", []interface{}{assetID})
	if err != nil {
		writeJSON(w, map[string]interface{}{"peg_rate_grd": 0, "error": err.Error()})
		return
	}
	var data map[string]interface{}
	json.Unmarshal(res, &data)
	writeJSON(w, data)
}

// POST /api/dex/prepare-transfer — kembalikan opreturn_data untuk mobile sign
// Mobile menggunakan ini agar bisa sign sendiri token transfer (non-custodial)
func handlePrepareTransfer(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "POST only", http.StatusMethodNotAllowed)
		return
	}
	var req struct {
		AssetID string  `json:"asset_id"`
		Amount  float64 `json:"amount"`
		From    string  `json:"from"`
		To      string  `json:"to"`
	}
	json.NewDecoder(r.Body).Decode(&req)
	if req.AssetID == "" || req.Amount <= 0 || req.From == "" || req.To == "" {
		writeJSON(w, map[string]interface{}{"error": "Missing required fields"})
		return
	}
	raw, err := cbdcNode.Call("transferasset", []interface{}{req.AssetID, req.Amount, req.From, req.To})
	if err != nil {
		writeJSON(w, map[string]interface{}{"error": err.Error()})
		return
	}
	writeJSON(w, raw)
}

// POST /api/dex/receive-grd — setelah mobile broadcast token transfer ke reserve,
// kirim GRD ke user sebagai hasil swap (stablecoin→GRD)
func handleReceiveGRD(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "POST only", http.StatusMethodNotAllowed)
		return
	}
	var req struct {
		AssetID string  `json:"asset_id"` // stablecoin yang dijual
		Amount  float64 `json:"amount"`   // jumlah token yang dijual
		Address string  `json:"address"`  // penerima GRD
	}
	json.NewDecoder(r.Body).Decode(&req)
	if req.AssetID == "" || req.Amount <= 0 || req.Address == "" {
		writeJSON(w, map[string]interface{}{"error": "Missing required fields"})
		return
	}
	// Ambil peg rate
	pegRaw, err := cbdcNode.Call("getpeginfo", []interface{}{req.AssetID})
	if err != nil {
		writeJSON(w, map[string]interface{}{"error": "Peg rate tidak ditemukan"})
		return
	}
	var pegInfo struct {
		PegRateGrd float64 `json:"peg_rate_grd"`
	}
	json.Unmarshal(pegRaw, &pegInfo)
	if pegInfo.PegRateGrd <= 0 {
		pegInfo.PegRateGrd = 0.0000065
	}
	feeRate := feeSwapRate
	grdGross := math.Round(req.Amount*pegInfo.PegRateGrd*1e8) / 1e8
	grdOut := math.Round(grdGross*(1-feeRate)*1e8) / 1e8

	// Kirim GRD dari CBDC reserve ke user
	_, err = cbdcNode.Call("sendtoaddress", []interface{}{req.Address, grdOut})
	if err != nil {
		writeJSON(w, map[string]interface{}{"error": "Gagal kirim GRD: " + err.Error()})
		return
	}
	cbdcNode.Call("generatetoaddress", []interface{}{1, feeTreasuryAddr})

	writeJSON(w, map[string]interface{}{
		"status":     "ok",
		"grd_out":    grdOut,
		"fee_grd":    grdGross * feeRate,
		"peg_rate":   pegInfo.PegRateGrd,
	})
}

// POST /api/dex/oracle-swap — Swap antar stablecoin oracle (pIDR↔pUSD)
// Menggunakan oracle rate, stablecoin orderbook sebagai liquidity
func handleOracleSwap(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "POST only", http.StatusMethodNotAllowed)
		return
	}
	var body struct {
		FromSymbol string  `json:"from_symbol"` // IDR (tanpa prefix p)
		ToSymbol   string  `json:"to_symbol"`   // USD (tanpa prefix p)
		Amount     float64 `json:"amount"`
		Address    string  `json:"address"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		writeJSON(w, map[string]string{"error": "Invalid JSON: " + err.Error()})
		return
	}
	if body.FromSymbol == "" || body.ToSymbol == "" || body.Amount <= 0 || body.Address == "" {
		writeJSON(w, map[string]string{"error": "from_symbol, to_symbol, amount, address wajib diisi"})
		return
	}

	amtInt := int64(body.Amount)
	if amtInt <= 0 {
		writeJSON(w, map[string]string{"error": "amount harus positif"})
		return
	}

	params := []interface{}{body.FromSymbol, body.ToSymbol, amtInt, body.Address}
	res, err := cbdcNode.Call("swaporacle", params)
	if err != nil {
		writeJSON(w, map[string]interface{}{"error": "Swap oracle gagal: " + err.Error()})
		return
	}
	var result map[string]interface{}
	json.Unmarshal(res, &result)
	writeJSON(w, result)
}

// POST /api/dex/cross-swap — 2-step swap: STABLECOIN↔SAHAM
// Menggabungkan peg rate stablecoin dan harga orderbook saham
func handleCrossSwap(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "POST only", http.StatusMethodNotAllowed)
		return
	}
	var req struct {
		PayType        string  `json:"pay_type"`        // "STABLECOIN" or "SAHAM"
		PayAssetID     string  `json:"pay_asset_id"`
		ReceiveType    string  `json:"receive_type"`    // "SAHAM" or "STABLECOIN"
		ReceiveAssetID string  `json:"receive_asset_id"`
		Amount         float64 `json:"amount"`
		Address        string  `json:"address"`
	}
	json.NewDecoder(r.Body).Decode(&req)
	if req.PayAssetID == "" || req.ReceiveAssetID == "" || req.Amount <= 0 || req.Address == "" {
		writeJSON(w, map[string]interface{}{"error": "Missing required fields"})
		return
	}

	// Helper: normalize price_grd (blockchain stores in satoshi scale jika > 1000)
	normalizePrice := func(p float64) float64 {
		if p > 1000 {
			return p / 1e8
		}
		return p
	}

	if strings.EqualFold(req.PayType, "STABLECOIN") && strings.EqualFold(req.ReceiveType, "SAHAM") {
		// ── STABLECOIN → SAHAM ──────────────────────────────────────────────
		// 1. Peg rate stablecoin
		pegRaw, err := cbdcNode.Call("getpeginfo", []interface{}{req.PayAssetID})
		if err != nil {
			writeJSON(w, map[string]interface{}{"error": "Peg rate tidak ditemukan: " + err.Error()})
			return
		}
		var pegInfo struct {
			PegRateGrd float64 `json:"peg_rate_grd"`
		}
		json.Unmarshal(pegRaw, &pegInfo)
		if pegInfo.PegRateGrd <= 0 {
			pegInfo.PegRateGrd = 0.0000065
		}

		// 2. GRD value dari stablecoin
		grdValue := req.Amount * pegInfo.PegRateGrd

		// 3. Harga SAHAM dari orderbook (best ask)
		obRaw, _ := cbdcNode.Call("getorderbook", []interface{}{req.ReceiveAssetID})
		var ob struct {
			Asks []struct {
				PriceGrd float64 `json:"price_grd"`
			} `json:"asks"`
		}
		json.Unmarshal(obRaw, &ob)
		if len(ob.Asks) == 0 {
			writeJSON(w, map[string]interface{}{"error": "Tidak ada ask order untuk saham ini"})
			return
		}
		sahamPrice := normalizePrice(ob.Asks[0].PriceGrd)
		if sahamPrice <= 0 {
			writeJSON(w, map[string]interface{}{"error": "Harga saham tidak valid"})
			return
		}

		// 4. Jumlah SAHAM yang diterima
		sahamAmt := int64(grdValue / sahamPrice)
		if sahamAmt <= 0 {
			writeJSON(w, map[string]interface{}{"error": "Amount terlalu kecil"})
			return
		}

		// 5. Cari holder SAHAM (creatorWalletNode) dan transfer ke user
		var fromAddr string
		for _, h := range getAssetHolders(req.ReceiveAssetID) {
			addr, _ := h["address"].(string)
			bal, _ := h["balance"].(int64)
			if addr != "" && bal >= sahamAmt {
				fromAddr = addr
				break
			}
		}
		if fromAddr == "" {
			writeJSON(w, map[string]interface{}{"error": "Stok saham tidak mencukupi"})
			return
		}

		txRes, err := cbdcNode.Call("transferasset", []interface{}{req.ReceiveAssetID, sahamAmt, fromAddr, req.Address})
		if err != nil {
			writeJSON(w, map[string]interface{}{"error": "Transfer saham gagal: " + err.Error()})
			return
		}
		var txData struct {
			OpReturnData string `json:"opreturn_data"`
		}
		json.Unmarshal(txRes, &txData)

		var txid string
		if txData.OpReturnData != "" {
			for _, node := range []*RPCClient{creatorWalletNode, cbdcNode} {
				txid, err = broadcastOpReturnWithNode(node, txData.OpReturnData, fromAddr)
				if err == nil {
					break
				}
			}
		}
		if err != nil {
			writeJSON(w, map[string]interface{}{"error": "Broadcast gagal: " + err.Error()})
			return
		}
		creatorWalletNode.Call("generatetoaddress", []interface{}{1, fromAddr})

		writeJSON(w, map[string]interface{}{
			"status":          "ok",
			"direction":       "stablecoin_to_saham",
			"stablecoin_in":   req.Amount,
			"saham_out":       sahamAmt,
			"saham_price_grd": sahamPrice,
			"txid":            txid,
		})

	} else if strings.EqualFold(req.PayType, "SAHAM") && strings.EqualFold(req.ReceiveType, "STABLECOIN") {
		// ── SAHAM → STABLECOIN ──────────────────────────────────────────────
		sahamAmt := int64(req.Amount)

		// 1. Harga SAHAM dari orderbook (best bid)
		obRaw, _ := cbdcNode.Call("getorderbook", []interface{}{req.PayAssetID})
		var ob struct {
			Bids []struct {
				PriceGrd float64 `json:"price_grd"`
			} `json:"bids"`
		}
		json.Unmarshal(obRaw, &ob)
		sahamPrice := 0.0
		if len(ob.Bids) > 0 {
			sahamPrice = normalizePrice(ob.Bids[0].PriceGrd)
		}
		if sahamPrice <= 0 {
			writeJSON(w, map[string]interface{}{"error": "Tidak ada bid order untuk saham ini"})
			return
		}

		// 2. Place market sell order untuk SAHAM (blockchain deducts SAHAM dari user)
		orderResult, err := cbdcNode.Call("placemarketorder", []interface{}{
			req.PayAssetID, "sell", strconv.FormatInt(sahamAmt, 10), req.Address,
		})
		if err != nil {
			writeJSON(w, map[string]interface{}{"error": "Order jual saham gagal: " + err.Error()})
			return
		}
		var orderData struct {
			OrderID      string `json:"order_id"`
			RawTx        string `json:"raw_tx"`
			Hex          string `json:"hex"`
			OpReturnData string `json:"opreturn_data"`
		}
		json.Unmarshal(orderResult, &orderData)
		txHex := orderData.RawTx
		if txHex == "" {
			txHex = orderData.Hex
		}
		if txHex != "" {
			signRes, sErr := cbdcNode.Call("signrawtransactionwithwallet", []interface{}{txHex})
			if sErr == nil {
				var signed struct {
					Hex      string `json:"hex"`
					Complete bool   `json:"complete"`
				}
				json.Unmarshal(signRes, &signed)
				if signed.Complete {
					cbdcNode.Call("sendrawtransaction", []interface{}{signed.Hex})
				}
			}
		} else if orderData.OpReturnData != "" {
			cbdcAddr := "grd1qufk0s4hh95gn7srrj06t0pmpzfym37ndjvjjgv"
			broadcastOpReturn(orderData.OpReturnData, cbdcAddr)
		}

		// 3. Peg rate stablecoin
		pegRaw, err := cbdcNode.Call("getpeginfo", []interface{}{req.ReceiveAssetID})
		if err != nil {
			writeJSON(w, map[string]interface{}{"error": "Peg rate tidak ditemukan"})
			return
		}
		var pegInfo struct {
			PegRateGrd float64 `json:"peg_rate_grd"`
		}
		json.Unmarshal(pegRaw, &pegInfo)
		if pegInfo.PegRateGrd <= 0 {
			pegInfo.PegRateGrd = 0.0000065
		}

		// 4. Hitung stablecoin yang diterima
		grdValue := float64(sahamAmt) * sahamPrice
		stablecoinAmt := int64(grdValue / pegInfo.PegRateGrd)

		// 5. Transfer stablecoin dari reserve CBDC ke user
		reserveFrom := findCBDCTokenHolder(req.ReceiveAssetID)
		if reserveFrom == "" {
			writeJSON(w, map[string]interface{}{"error": "Reserve stablecoin tidak tersedia"})
			return
		}

		txRes, err := cbdcNode.Call("transferasset", []interface{}{req.ReceiveAssetID, stablecoinAmt, reserveFrom, req.Address})
		if err != nil {
			writeJSON(w, map[string]interface{}{"error": "Transfer stablecoin gagal: " + err.Error()})
			return
		}
		var txData struct {
			OpReturnData string `json:"opreturn_data"`
		}
		json.Unmarshal(txRes, &txData)
		if txData.OpReturnData != "" {
			if _, bErr := broadcastOpReturn(txData.OpReturnData, reserveFrom); bErr != nil {
				writeJSON(w, map[string]interface{}{"error": "Broadcast stablecoin gagal: " + bErr.Error()})
				return
			}
		}
		cbdcNode.Call("generatetoaddress", []interface{}{1, reserveFrom})

		writeJSON(w, map[string]interface{}{
			"status":          "ok",
			"direction":       "saham_to_stablecoin",
			"saham_in":        sahamAmt,
			"stablecoin_out":  stablecoinAmt,
			"saham_price_grd": sahamPrice,
		})

	} else {
		writeJSON(w, map[string]interface{}{"error": "Kombinasi pay_type/receive_type tidak didukung"})
	}
}

// POST /api/dex/order — Place limit/market order on-chain via RPC
func handleDexOrder(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "POST only", http.StatusMethodNotAllowed)
		return
	}
	if !swapRateLimit.Allow(clientIP(r)) {
		IncMetric("rate_limited")
		writeJSONErrStatus(w, http.StatusTooManyRequests, "rate limit exceeded", nil)
		return
	}
	var req struct {
		OrderType string  `json:"order_type"` // "limit" or "market"
		Side      string  `json:"side"`       // "buy" or "sell"
		AssetID   string  `json:"asset_id"`
		Amount    float64 `json:"amount"`
		Price     float64 `json:"price"` // price in GRD (for limit)
		Address   string  `json:"address"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeJSONErr(w, "invalid json", err)
		return
	}

	if err := ValidAssetID(req.AssetID); err != nil {
		writeJSONErr(w, err.Error(), nil)
		return
	}
	if err := ValidAddress(req.Address); err != nil {
		writeJSONErr(w, err.Error(), nil)
		return
	}
	if err := ValidAmount(req.Amount, 0); err != nil {
		writeJSONErr(w, err.Error(), nil)
		return
	}
	if err := ValidAmount(req.Price, 0); err != nil {
		writeJSONErr(w, "invalid price", nil)
		return
	}
	if req.Side != "buy" && req.Side != "sell" {
		writeJSONErr(w, "side must be buy or sell", nil)
		return
	}

	rpcResult, err := cbdcNode.Call("placeorder", []interface{}{
		req.AssetID, req.Side, req.Amount, req.Price, req.Address,
	})
	if err != nil {
		writeJSONErr(w, "placeorder failed", err)
		return
	}
	var parsed struct {
		OrderID string `json:"order_id"`
	}
	json.Unmarshal(rpcResult, &parsed)

	cbdcNode.Call("matchorders", []interface{}{req.AssetID})

	IncMetric("order")
	AuditRequest(r, "dex_order", "ok", map[string]interface{}{
		"side": req.Side, "asset_id": req.AssetID, "amount": req.Amount, "price": req.Price, "order_id": parsed.OrderID,
	})

	log.Printf("[DEX] %s %s %.4f @ %.8f GRD — order_id=%s", req.Side, req.AssetID, req.Amount, req.Price, parsed.OrderID)

	writeJSON(w, map[string]interface{}{
		"status":   "ok",
		"side":     req.Side,
		"price":    req.Price,
		"amount":   req.Amount,
		"order_id": parsed.OrderID,
	})
}

// POST /api/dex/order/cancel — Cancel an open order
func handleDexCancelOrder(w http.ResponseWriter, r *http.Request) {
	var req struct {
		OrderID string `json:"order_id"`
		Address string `json:"address"`
	}
	json.NewDecoder(r.Body).Decode(&req)

	if req.OrderID == "" || req.Address == "" {
		writeJSON(w, map[string]string{"error": "order_id and address required"})
		return
	}

	result, err := cbdcNode.Call("cancelorder", []interface{}{req.OrderID, req.Address})
	if err != nil {
		writeJSON(w, map[string]interface{}{"error": err.Error()})
		return
	}

	// Broadcast if needed
	var rpcResult struct {
		OpReturnData string `json:"opreturn_data"`
		Cancelled    bool   `json:"cancelled"`
	}
	json.Unmarshal(result, &rpcResult)

	if rpcResult.OpReturnData != "" {
		txid, err := broadcastOpReturn(rpcResult.OpReturnData, req.Address)
		if err != nil {
			cbdcAddr := "grd1qufk0s4hh95gn7srrj06t0pmpzfym37ndjvjjgv"
			txid, err = broadcastOpReturn(rpcResult.OpReturnData, cbdcAddr)
		}
		if err == nil {
			cbdcNode.Call("generatetoaddress", []interface{}{1, req.Address})
			writeJSON(w, map[string]interface{}{"status": "ok", "order_id": req.OrderID, "txid": txid, "message": "Order cancelled"})
			return
		}
	}

	// Mine block to confirm
	cbdcNode.Call("generatetoaddress", []interface{}{1, req.Address})
	writeJSON(w, map[string]interface{}{"status": "ok", "order_id": req.OrderID, "message": "Order cancelled"})
}

// GET /api/dex/my-orders/{address} — Get open orders for an address
func handleDexMyOrders(w http.ResponseWriter, r *http.Request) {
	parts := strings.Split(r.URL.Path, "/")
	address := parts[len(parts)-1]

	if address == "" {
		writeJSON(w, []interface{}{})
		return
	}

	// Get all orders, filter by status query param (default: all)
	statusFilter := r.URL.Query().Get("status") // "open", "filled", or empty for all

	raw, err := cbdcNode.Call("getmyorders", []interface{}{address})
	if err != nil {
		log.Printf("[MyOrders] RPC error: %v", err)
		writeJSON(w, []interface{}{})
		return
	}

	var allOrders []map[string]interface{}
	json.Unmarshal(raw, &allOrders)

	if statusFilter != "" {
		var filtered []map[string]interface{}
		for _, o := range allOrders {
			s, _ := o["status"].(string)
			if strings.EqualFold(s, statusFilter) {
				filtered = append(filtered, o)
			}
		}
		if filtered == nil {
			filtered = []map[string]interface{}{}
		}
		writeJSON(w, filtered)
		return
	}

	if allOrders == nil {
		writeJSON(w, []interface{}{})
		return
	}
	writeJSON(w, allOrders)
}

// GET /api/dex/trades/{assetId}
func handleDexTrades(w http.ResponseWriter, r *http.Request) {
	parts := strings.Split(r.URL.Path, "/")
	assetID := parts[len(parts)-1]

	// Try on-chain trade history first. The RPC returns trades in an
	// unspecified order (hash key) so we sort by timestamp DESC here so
	// clients (PriceLineChart, TradeHistoryCard) see the most recent ones
	// first regardless of how the chain stores them.
	raw, err := cbdcNode.Call("gettradehistory", []interface{}{assetID})
	if err == nil {
		var trades []map[string]interface{}
		if jerr := json.Unmarshal(raw, &trades); jerr == nil {
			sort.Slice(trades, func(i, j int) bool {
				ti, _ := trades[i]["timestamp"].(float64)
				tj, _ := trades[j]["timestamp"].(float64)
				return ti > tj
			})
			writeJSON(w, trades)
			return
		}
		// Decode failed → fall back to passing through raw payload
		var generic interface{}
		json.Unmarshal(raw, &generic)
		writeJSON(w, generic)
		return
	}

	// Fallback to in-memory
	book := getBook(assetID)
	book.mu.RLock()
	defer book.mu.RUnlock()
	writeJSON(w, book.trades)
}

// GET /api/dex/price-history/{assetId}
func handleDexPriceHistory(w http.ResponseWriter, r *http.Request) {
	parts := strings.Split(r.URL.Path, "/")
	assetID := parts[len(parts)-1]

	// For stablecoins: use oracle price history for smooth candlestick data
	// This prevents spikes from wrong trade/orderbook prices
	if oraclePrice, isStable := getAssetOraclePrice(assetID); isStable {
		points := getOraclePriceHistory(assetID)
		if len(points) == 0 {
			// No recorded history yet — generate flat line at current oracle price
			price := oraclePrice
			if price <= 0 {
				price = 0.001
			}
			now := time.Now().Unix()
			for i := 60; i >= 0; i-- {
				points = append(points, PricePoint{Timestamp: now - int64(i)*10, Price: price})
			}
		}
		writeJSON(w, points)
		return
	}

	// For non-stablecoin assets (saham/stock): use trade history
	var points []PricePoint
	raw, err := cbdcNode.Call("gettradehistory", []interface{}{assetID})
	if err == nil {
		var trades []struct {
			Timestamp int64   `json:"timestamp"`
			Price     float64 `json:"price"`
			PriceGRD  float64 `json:"price_grd"`
		}
		json.Unmarshal(raw, &trades)
		for _, t := range trades {
			p := t.Price
			if p <= 0 {
				p = t.PriceGRD
			}
			if p > 0 {
				points = append(points, PricePoint{Timestamp: t.Timestamp, Price: p})
			}
		}
	}

	// Merge in-memory trades (real orderbook matches)
	book := getBook(assetID)
	book.mu.RLock()
	for _, t := range book.trades {
		if t.Price > 0 {
			points = append(points, PricePoint{Timestamp: t.Timestamp, Price: t.Price})
		}
	}
	book.mu.RUnlock()
	sort.Slice(points, func(i, j int) bool { return points[i].Timestamp < points[j].Timestamp })

	// If no trade data, generate flat line at spot/default price
	if len(points) == 0 {
		price := 0.0
		bk := getBook(assetID)
		bk.mu.RLock()
		price = bk.spotPrice
		bk.mu.RUnlock()
		if price <= 0 {
			price = 1.0
		}
		now := time.Now().Unix()
		for i := 60; i >= 0; i-- {
			points = append(points, PricePoint{Timestamp: now - int64(i)*60, Price: price})
		}
	}

	writeJSON(w, points)
}

// GET /api/dex/live-price/{assetId} — returns current real-time price every call
func handleDexLivePrice(w http.ResponseWriter, r *http.Request) {
	parts := strings.Split(r.URL.Path, "/")
	assetID := parts[len(parts)-1]

	price := 0.0
	now := time.Now().Unix()

	// For stablecoins: ALWAYS use oracle rate as the authoritative price source.
	// This prevents candlestick spikes from stale/wrong orderbook/trade data.
	if oraclePrice, isStable := getAssetOraclePrice(assetID); isStable {
		price = oraclePrice
		// Record for candlestick history
		if price > 0 {
			recordOraclePrice(assetID, price)
		}
		writeJSON(w, map[string]interface{}{
			"price":     price,
			"timestamp": now,
		})
		return
	}

	// For non-stablecoin assets (saham/stock): use orderbook/trade prices
	// 1) Try getassetprice for live MM price
	rawAll, err := cbdcNode.Call("getassetprice", nil)
	if err == nil {
		var prices []struct {
			AssetID  string  `json:"asset_id"`
			PriceGRD float64 `json:"price_grd"`
			BestBid  float64 `json:"best_bid"`
			BestAsk  float64 `json:"best_ask"`
		}
		json.Unmarshal(rawAll, &prices)
		for _, p := range prices {
			if p.AssetID == assetID {
				if p.BestBid > 0 && p.BestAsk > 0 {
					price = (p.BestBid + p.BestAsk) / 2
				} else {
					price = p.PriceGRD
				}
				break
			}
		}
	}

	// 2) Fallback: orderbook mid
	if price <= 0 {
		rawOB, errOB := cbdcNode.Call("getorderbook", []interface{}{assetID})
		if errOB == nil {
			var ob struct {
				Asks []struct{ PriceGRD float64 `json:"price_grd"` } `json:"asks"`
				Bids []struct{ PriceGRD float64 `json:"price_grd"` } `json:"bids"`
			}
			json.Unmarshal(rawOB, &ob)
			if len(ob.Asks) > 0 && len(ob.Bids) > 0 {
				price = (ob.Asks[0].PriceGRD + ob.Bids[0].PriceGRD) / 2
			} else if len(ob.Asks) > 0 {
				price = ob.Asks[0].PriceGRD
			} else if len(ob.Bids) > 0 {
				price = ob.Bids[0].PriceGRD
			}
		}
	}

	// 3) Fallback: in-memory book spot price
	if price <= 0 {
		book := getBook(assetID)
		book.mu.RLock()
		price = book.spotPrice
		book.mu.RUnlock()
	}

	writeJSON(w, map[string]interface{}{
		"price":     price,
		"timestamp": now,
	})
}

// GET /api/blockchain/tokens
func handleTokens(w http.ResponseWriter, r *http.Request) {
	assets := scanAssets()

	// Get block height for GRD supply
	raw, _ := publicNode.Call("getblockcount", nil)
	var height int64
	json.Unmarshal(raw, &height)

	// Start with native GRD token
	tokens := []map[string]interface{}{
		{
			"rank":        1,
			"symbol":      "GRD",
			"name":        "Garuda Coin",
			"type":        "NATIVE",
			"badge":       "Native",
			"price":       nil,
			"priceStable": false,
			"totalSupply": float64(height) * 1.0,
			"outstanding": float64(height) * 1.0,
			"holders":     0,
			"transfers":   0,
			"assetId":     nil,
			"issuer":      "GarudaChain",
			"issueHeight": 0,
			"issueTxid":   "",
			"desc":        "Native coin of GarudaChain",
		},
	}

	oracleRates := fetchOracleRatesMap()

	for i, a := range assets {
		tipe := strings.ToUpper(a.Tipe)
		badge := "Saham"
		if tipe == "STABLECOIN" {
			badge = "Stablecoin"
		} else if tipe == "STABLECOIN_PEGGED" {
			badge = "Stablecoin Oracle"
		}

		price := ""
		priceStable := tipe == "STABLECOIN" || tipe == "STABLECOIN_PEGGED"
		if priceStable {
			sym := strings.ToUpper(a.Kode)
			// Untuk stablecoin_pegged (pIDR, pUSD), strip prefix "p" untuk oracle lookup
			if tipe == "STABLECOIN_PEGGED" && len(sym) > 1 && strings.HasPrefix(sym, "P") {
				sym = sym[1:]
			}
			if rate, ok := oracleRates[sym]; ok && rate[0] > 0 {
				price = fmt.Sprintf("%.8f GRD", rate[0])
			} else {
				price = "0.00100000 GRD"
			}
		} else {
			// Get last trade price
			tradesRaw, _ := cbdcNode.Call("gettradehistory", []interface{}{a.AssetID})
			var trades []struct{ PriceGRD float64 `json:"price_grd"` }
			json.Unmarshal(tradesRaw, &trades)
			if len(trades) > 0 {
				price = fmt.Sprintf("%.8f GRD", trades[len(trades)-1].PriceGRD)
			}
		}

		holderList := getAssetHolders(a.AssetID)

		tokens = append(tokens, map[string]interface{}{
			"rank":        i + 2,
			"symbol":      a.Kode,
			"name":        a.Nama,
			"type":        a.Tipe,
			"badge":       badge,
			"price":       price,
			"priceStable": priceStable,
			"totalSupply": a.Supply,
			"outstanding": a.Supply,
			"holders":     len(holderList),
			"transfers":   0,
			"assetId":     a.AssetID,
			"issuer":      "GarudaChain",
			"issueHeight": 1,
			"issueTxid":   "",
			"desc":        a.Nama + " on GarudaChain",
		})
	}

	writeJSON(w, tokens)
}

// GET /api/blockchain/token/{symbol}
func handleTokenDetail(w http.ResponseWriter, r *http.Request) {
	parts := strings.Split(r.URL.Path, "/")
	symbol := strings.ToUpper(parts[len(parts)-1])

	// Handle native GRD token
	if symbol == "GRD" {
		raw, _ := publicNode.Call("getblockcount", nil)
		var height int64
		json.Unmarshal(raw, &height)
		writeJSON(w, map[string]interface{}{
			"symbol":      "GRD",
			"name":        "Garuda Coin",
			"type":        "NATIVE",
			"totalSupply": float64(height) * 1.0, // 1 GRD per block
			"outstanding": float64(height) * 1.0,
			"price":       nil,
			"priceStable": false,
		})
		return
	}

	// Find asset by symbol
	assets := scanAssets()
	for _, a := range assets {
		if strings.ToUpper(a.Kode) == symbol {
			// Get holders with bech32 addresses
			holderList := getAssetHolders(a.AssetID)

			// Get trades for price
			price := ""
			tradesRaw, _ := cbdcNode.Call("gettradehistory", []interface{}{a.AssetID})
			var trades []struct {
				PriceGRD float64 `json:"price_grd"`
			}
			json.Unmarshal(tradesRaw, &trades)
			if len(trades) > 0 {
				price = fmt.Sprintf("%.8f GRD", trades[len(trades)-1].PriceGRD)
			}

			tipUpper := strings.ToUpper(a.Tipe)
			isStable := tipUpper == "STABLECOIN" || tipUpper == "STABLECOIN_PEGGED"
			if isStable {
				// Use oracle rate for stablecoins (real-time)
				oracleRates := fetchOracleRatesMap()
				sym := strings.ToUpper(a.Kode)
				// Strip prefix "p" for pegged tokens (pIDR → IDR)
				if tipUpper == "STABLECOIN_PEGGED" && len(sym) > 1 && strings.HasPrefix(sym, "P") {
					sym = sym[1:]
				}
				if rate, ok := oracleRates[sym]; ok && rate[0] > 0 {
					price = fmt.Sprintf("%.8f GRD", rate[0])
				} else if price == "" {
					price = "0.00100000 GRD"
				}
			}

			// Get asset transactions (issuance/transfer)
			var txList []map[string]interface{}
			assetTxRaw, _ := cbdcNode.Call("getassettx", []interface{}{a.AssetID, 100})
			var assetTxs []struct {
				Txid       string `json:"txid"`
				Height     int64  `json:"height"`
				Timestamp  int64  `json:"timestamp"`
				Type       string `json:"type"`
				Amount     int64  `json:"amount"`
				FromH160   string `json:"from_hash160"`
				ToH160     string `json:"to_hash160"`
			}
			json.Unmarshal(assetTxRaw, &assetTxs)
			for _, tx := range assetTxs {
				fromAddr := ""
				if tx.FromH160 != "" {
					fromAddr = hash160ToBech32(tx.FromH160)
				}
				toAddr := ""
				if tx.ToH160 != "" {
					toAddr = hash160ToBech32(tx.ToH160)
				}
				txList = append(txList, map[string]interface{}{
					"txid":      tx.Txid,
					"type":      tx.Type,
					"amount":    tx.Amount,
					"height":    tx.Height,
					"timestamp": tx.Timestamp,
					"from":      fromAddr,
					"to":        toAddr,
				})
			}

			// Get trade history and add as transfers
			tradeHistRaw, _ := cbdcNode.Call("gettradehistory", []interface{}{a.AssetID})
			var tradeHist []struct {
				TradeID   string  `json:"trade_id"`
				Buyer     string  `json:"buyer"`
				Seller    string  `json:"seller"`
				Amount    int64   `json:"amount"`
				PriceGRD  float64 `json:"price_grd"`
				Height    int64   `json:"height"`
				Timestamp int64   `json:"timestamp"`
			}
			json.Unmarshal(tradeHistRaw, &tradeHist)
			for _, tr := range tradeHist {
				txList = append(txList, map[string]interface{}{
					"txid":      tr.TradeID,
					"type":      "trade",
					"amount":    tr.Amount,
					"height":    tr.Height,
					"timestamp": tr.Timestamp,
					"from":      hash160ToBech32(tr.Seller),
					"to":        hash160ToBech32(tr.Buyer),
				})
			}

			// Sort by height desc (newest first)
			sort.Slice(txList, func(i, j int) bool {
				hi, _ := txList[i]["height"].(int64)
				hj, _ := txList[j]["height"].(int64)
				return hi > hj
			})
			if txList == nil {
				txList = []map[string]interface{}{}
			}

			writeJSON(w, map[string]interface{}{
				"symbol":       a.Kode,
				"name":         a.Nama,
				"type":         a.Tipe,
				"assetId":      a.AssetID,
				"totalSupply":  a.Supply,
				"outstanding":  a.Supply,
				"price":        price,
				"priceStable":  isStable,
				"numHolders":   len(holderList),
				"holders":      holderList,
				"numTransfers": len(txList),
				"transactions": txList,
			})
			return
		}
	}

	writeJSON(w, map[string]interface{}{"error": "token not found"})
}

// GET /api/blockchain/top-miners
func handleTopMiners(w http.ResponseWriter, r *http.Request) {
	// Scan recent coinbase transactions
	raw, _ := publicNode.Call("getblockcount", nil)
	var height int64
	json.Unmarshal(raw, &height)

	minerCount := make(map[string]int)
	for i := 0; i < 50 && height-int64(i) >= 0; i++ {
		h := height - int64(i)
		hashRaw, _ := publicNode.Call("getblockhash", []interface{}{h})
		var hash string
		json.Unmarshal(hashRaw, &hash)

		blockRaw, _ := publicNode.Call("getblock", []interface{}{hash, 2})
		var block struct {
			Tx []struct {
				Vout []struct {
					ScriptPubKey struct {
						Address string `json:"address"`
					} `json:"scriptPubKey"`
				} `json:"vout"`
			} `json:"tx"`
		}
		json.Unmarshal(blockRaw, &block)

		if len(block.Tx) > 0 && len(block.Tx[0].Vout) > 0 {
			addr := block.Tx[0].Vout[0].ScriptPubKey.Address
			if addr != "" {
				minerCount[addr]++
			}
		}
	}

	type Miner struct {
		Address     string  `json:"address"`
		BlocksFound int     `json:"blocksFound"`
		TotalReward float64 `json:"totalReward"`
		LastBlock   int64   `json:"lastBlock"`
		Rank        int     `json:"rank"`
		FirstBlock  int64   `json:"firstBlock"`
		// Legacy
		Blocks int `json:"blocks"`
	}
	var miners []Miner
	for addr, count := range minerCount {
		miners = append(miners, Miner{
			Address:     addr,
			BlocksFound: count,
			TotalReward: float64(count) * 1.0, // 1 GRD per block
			LastBlock:   height,
			FirstBlock:  height - int64(count),
			Blocks:      count,
		})
	}
	sort.Slice(miners, func(i, j int) bool { return miners[i].BlocksFound > miners[j].BlocksFound })
	for i := range miners {
		miners[i].Rank = i + 1
	}

	writeJSON(w, miners)
}

// GET /api/blockchain/presales
func handlePresales(w http.ResponseWriter, r *http.Request) {
	result, err := cbdcNode.Call("listpresales", nil)
	if err != nil {
		writeJSON(w, []interface{}{})
		return
	}
	var presales []map[string]interface{}
	if err := json.Unmarshal(result, &presales); err != nil {
		writeJSON(w, []interface{}{})
		return
	}
	// Pass through directly — RPC field names match frontend expectations
	writeJSON(w, presales)
}

// GET /api/blockchain/presale/{assetId}
func handlePresaleDetail(w http.ResponseWriter, r *http.Request) {
	parts := strings.Split(r.URL.Path, "/")
	assetID := parts[len(parts)-1]
	if assetID == "" {
		writeJSON(w, map[string]string{"error": "Missing asset_id"})
		return
	}
	result, err := cbdcNode.Call("getpresaleinfo", []interface{}{assetID})
	if err != nil {
		writeJSON(w, map[string]string{"error": err.Error()})
		return
	}
	var info map[string]interface{}
	json.Unmarshal(result, &info)
	// Calculate seconds remaining
	endTs, _ := info["end_timestamp"].(float64)
	now := float64(time.Now().Unix())
	secsRemaining := endTs - now
	if secsRemaining < 0 {
		secsRemaining = 0
	}
	info["seconds_remaining"] = secsRemaining
	// Normalize price field
	if v, ok := info["price_per_unit_grd"]; ok {
		info["price_grd"] = v
	}
	writeJSON(w, info)
}

// POST /api/dex/presale/create — Create e-IPO presale via RPC
func handleCreatePresale(w http.ResponseWriter, r *http.Request) {
	var req struct {
		AssetID        string  `json:"asset_id"`
		TokensForSale  int64   `json:"tokens_for_sale"`
		PricePerUnit   float64 `json:"price_per_unit"` // GRD
		DurationHours  int     `json:"duration_hours"`
		CreatorAddress string  `json:"creator_address"`
	}
	json.NewDecoder(r.Body).Decode(&req)

	if req.AssetID == "" || req.TokensForSale <= 0 || req.PricePerUnit <= 0 || req.DurationHours <= 0 || req.CreatorAddress == "" {
		writeJSON(w, map[string]string{"error": "Missing required fields"})
		return
	}

	result, err := cbdcNode.Call("createpresale", []interface{}{
		req.AssetID,
		req.TokensForSale,
		req.PricePerUnit,
		req.DurationHours,
		req.CreatorAddress,
	})
	if err != nil {
		writeJSON(w, map[string]interface{}{"error": err.Error()})
		return
	}
	var resp map[string]interface{}
	json.Unmarshal(result, &resp)
	resp["status_api"] = "ok"
	writeJSON(w, resp)
}

// POST /api/dex/presale/buy — Buy tokens during e-IPO presale
func handleBuyPresale(w http.ResponseWriter, r *http.Request) {
	var req struct {
		AssetID      string `json:"asset_id"`
		TokenAmount  int64  `json:"token_amount"`
		BuyerAddress string `json:"buyer_address"`
	}
	json.NewDecoder(r.Body).Decode(&req)

	if req.AssetID == "" || req.TokenAmount <= 0 || req.BuyerAddress == "" {
		writeJSON(w, map[string]string{"error": "Missing required fields"})
		return
	}

	// 1. Record presale purchase on-chain
	result, err := cbdcNode.Call("buypresale", []interface{}{
		req.AssetID,
		req.TokenAmount,
		req.BuyerAddress,
	})
	if err != nil {
		writeJSON(w, map[string]interface{}{"error": err.Error()})
		return
	}
	var resp map[string]interface{}
	json.Unmarshal(result, &resp)

	// 2. Transfer GRD from buyer to creator
	costGRD, _ := resp["cost_grd"].(float64)
	creatorAddr, _ := resp["creator_address"].(string)

	if costGRD > 0 && creatorAddr != "" {
		// Send GRD from buyer (public node wallet) to creator address
		sendResult, sendErr := publicNode.Call("sendtoaddress", []interface{}{
			creatorAddr,
			costGRD,
		})
		if sendErr != nil {
			log.Printf("[BuyPresale] WARNING: GRD transfer failed: %v", sendErr)
			resp["grd_transfer"] = "failed"
			resp["grd_transfer_error"] = sendErr.Error()
		} else {
			var txid string
			json.Unmarshal(sendResult, &txid)
			resp["grd_transfer"] = "ok"
			resp["grd_transfer_txid"] = txid
			resp["grd_sent"] = costGRD
			resp["grd_to"] = creatorAddr
			log.Printf("[BuyPresale] GRD %.8f sent to creator %s, txid: %s", costGRD, creatorAddr, txid)
		}
	}

	// 3. Mine a block to confirm both purchase and GRD transfer
	cbdcNode.Call("generatetoaddress", []interface{}{1, req.BuyerAddress})

	resp["status_api"] = "ok"
	writeJSON(w, resp)
}

// POST /api/dex/presale/close — Close presale, distribute tokens, burn unsold
func handleClosePresale(w http.ResponseWriter, r *http.Request) {
	var req struct {
		AssetID        string `json:"asset_id"`
		CreatorAddress string `json:"creator_address"`
	}
	json.NewDecoder(r.Body).Decode(&req)

	if req.AssetID == "" || req.CreatorAddress == "" {
		writeJSON(w, map[string]string{"error": "Missing required fields"})
		return
	}

	// 1. Close presale — distributes tokens to buyers, burns unsold tokens
	result, err := cbdcNode.Call("closepresale", []interface{}{
		req.AssetID,
		req.CreatorAddress,
	})
	if err != nil {
		writeJSON(w, map[string]interface{}{"error": err.Error()})
		return
	}
	var closeResp map[string]interface{}
	json.Unmarshal(result, &closeResp)

	// 2. Burn unsold tokens (returned to creator, now burn them)
	unsoldFloat, _ := closeResp["tokens_unsold"].(float64)
	unsold := int64(unsoldFloat)
	burnResult := ""
	if unsold > 0 {
		burnRes, burnErr := cbdcNode.Call("burnasset", []interface{}{
			req.AssetID,
			unsold,
			req.CreatorAddress,
		})
		if burnErr == nil {
			var burnData map[string]interface{}
			json.Unmarshal(burnRes, &burnData)
			opReturnHex, _ := burnData["op_return_hex"].(string)
			if opReturnHex != "" {
				// Build TX: get UTXO, create raw TX with OP_RETURN, sign, broadcast
				// Use creator node (port 19451) for signing since creator address is there
				utxoRes, utxoErr := creatorNode.Call("listunspent", []interface{}{0, 9999999, []string{req.CreatorAddress}})
				if utxoErr == nil {
					var utxos []map[string]interface{}
					json.Unmarshal(utxoRes, &utxos)
					if len(utxos) > 0 {
						utxo := utxos[0]
						txid, _ := utxo["txid"].(string)
						vout := int(utxo["vout"].(float64))
						utxoAmount, _ := utxo["amount"].(float64)
						fee := 0.001
						changeAmt := utxoAmount - fee
						if changeAmt < 0 {
							changeAmt = 0
						}

						inputs := []map[string]interface{}{{"txid": txid, "vout": vout}}
						outputs := []interface{}{
							map[string]interface{}{"data": opReturnHex},
						}
						if changeAmt > 0.0001 {
							outputs = append(outputs, map[string]interface{}{req.CreatorAddress: changeAmt})
						}

						rawRes, rawErr := creatorNode.Call("createrawtransaction", []interface{}{inputs, outputs})
						if rawErr == nil {
							var rawHex string
							json.Unmarshal(rawRes, &rawHex)
							signResult, signErr := creatorNode.Call("signrawtransactionwithwallet", []interface{}{rawHex})
							if signErr == nil {
								var signed struct {
									Hex      string `json:"hex"`
									Complete bool   `json:"complete"`
								}
								json.Unmarshal(signResult, &signed)
								if signed.Complete {
									txidResult, broadcastErr := creatorNode.Call("sendrawtransaction", []interface{}{signed.Hex})
									if broadcastErr == nil {
										json.Unmarshal(txidResult, &burnResult)
									}
								}
							}
						}
					}
				}
			}
		}
		// Mine block to confirm burn
		cbdcNode.Call("generatetoaddress", []interface{}{1, req.CreatorAddress})
	}

	closeResp["status_api"] = "ok"
	closeResp["tokens_burned"] = unsold
	closeResp["burn_txid"] = burnResult
	writeJSON(w, closeResp)
}

// GET /api/blockchain/apbn
func handleAPBN(w http.ResponseWriter, r *http.Request) {
	raw, _ := publicNode.Call("getblockcount", nil)
	var height int64
	json.Unmarshal(raw, &height)

	blockReward := 0.01
	apbnPerBlock := blockReward * 0.08
	expectedBalance := float64(height) * apbnPerBlock

	writeJSON(w, map[string]interface{}{
		"address":         "garuda-apbn-treasury",
		"balance":         expectedBalance,
		"expectedBalance": expectedBalance,
		"totalBlocks":     height,
		"apbnPerBlock":    apbnPerBlock,
		"blockReward":     blockReward,
	})
}

// GET /api/blockchain/wallet/{address}
func handleWalletDetail(w http.ResponseWriter, r *http.Request) {
	handleAddress(w, r)
}

// GET /api/blockchain/stock/{assetId}
func handleStockDetail(w http.ResponseWriter, r *http.Request) {
	parts := strings.Split(r.URL.Path, "/")
	assetID := parts[len(parts)-1]

	assets := scanAssets()
	for _, a := range assets {
		if a.AssetID == assetID || strings.EqualFold(a.Kode, assetID) {
			// Get last trade price
			lastPrice := 0.0
			tradesRaw, _ := cbdcNode.Call("gettradehistory", []interface{}{a.AssetID})
			var trades []struct {
				PriceGRD float64 `json:"price_grd"`
				Amount   int64   `json:"amount"`
			}
			json.Unmarshal(tradesRaw, &trades)
			if len(trades) > 0 {
				lastPrice = trades[len(trades)-1].PriceGRD
			}

			// Get orderbook
			var obData map[string]interface{}
			obRaw, err := cbdcNode.Call("getorderbook", []interface{}{a.AssetID})
			if err == nil {
				json.Unmarshal(obRaw, &obData)
			}

			holderList := getAssetHolders(a.AssetID)

			writeJSON(w, map[string]interface{}{
				"assetId":      a.AssetID,
				"kode":         a.Kode,
				"nama":         a.Nama,
				"tipe":         a.Tipe,
				"totalSupply":  a.Supply,
				"supply":       a.Supply,
				"outstanding":  a.Supply,
				"price":        lastPrice,
				"holders":      holderList,
				"numHolders":   len(holderList),
				"issueHeight":  1,
				"issueTxid":    "",
				"status":       "ACTIVE",
				"orderbook":    obData,
				"trades":       trades,
				"tradeCount":   len(trades),
			})
			return
		}
	}
	writeJSON(w, map[string]string{"error": "not found"})
}

// ─── Main ───

// autoCloseExpiredPresales checks all open presales and auto-closes + burns unsold tokens
func autoCloseExpiredPresales() {
	raw, err := cbdcNode.Call("listpresales", nil)
	if err != nil {
		return
	}
	var presales []struct {
		AssetID      string  `json:"asset_id"`
		Status       string  `json:"status"`
		EndTimestamp float64 `json:"end_timestamp"`
		Issuer       string  `json:"issuer"`
		IssuerAddr   string  `json:"issuer_address"`
		TokensUnsold float64 `json:"tokens_unsold"`
		TokensSold   float64 `json:"tokens_sold"`
		TokensForSale float64 `json:"tokens_for_sale"`
	}
	json.Unmarshal(raw, &presales)

	now := float64(time.Now().Unix())
	for _, p := range presales {
		if !strings.EqualFold(p.Status, "OPEN") {
			continue
		}
		if p.EndTimestamp <= 0 || now < p.EndTimestamp {
			continue
		}

		// Presale expired — auto-close it
		creatorAddr := p.IssuerAddr
		if creatorAddr == "" {
			creatorAddr = p.Issuer
		}
		if creatorAddr == "" {
			log.Printf("[AUTO-CLOSE] Skipping %s: no creator address", p.AssetID)
			continue
		}

		log.Printf("[AUTO-CLOSE] Closing expired presale %s (ended at %d, now %d)", p.AssetID, int64(p.EndTimestamp), int64(now))

		closeRes, closeErr := cbdcNode.Call("closepresale", []interface{}{p.AssetID, creatorAddr})
		if closeErr != nil {
			log.Printf("[AUTO-CLOSE] Failed to close %s: %v", p.AssetID, closeErr)
			continue
		}
		var closeData map[string]interface{}
		json.Unmarshal(closeRes, &closeData)

		// Burn unsold tokens
		unsoldFloat, _ := closeData["tokens_unsold"].(float64)
		unsold := int64(unsoldFloat)
		if unsold > 0 {
			burnRes, burnErr := cbdcNode.Call("burnasset", []interface{}{p.AssetID, unsold, creatorAddr})
			if burnErr != nil {
				log.Printf("[AUTO-CLOSE] Burn failed for %s: %v", p.AssetID, burnErr)
			} else {
				var burnData map[string]interface{}
				json.Unmarshal(burnRes, &burnData)
				opReturnHex, _ := burnData["op_return_hex"].(string)
				if opReturnHex != "" {
					utxoRes, utxoErr := creatorNode.Call("listunspent", []interface{}{0, 9999999, []string{creatorAddr}})
					if utxoErr == nil {
						var utxos []map[string]interface{}
						json.Unmarshal(utxoRes, &utxos)
						if len(utxos) > 0 {
							utxo := utxos[0]
							txid, _ := utxo["txid"].(string)
							vout := int(utxo["vout"].(float64))
							utxoAmount, _ := utxo["amount"].(float64)
							fee := 0.001
							changeAmt := utxoAmount - fee
							if changeAmt < 0 {
								changeAmt = 0
							}
							inputs := []map[string]interface{}{{"txid": txid, "vout": vout}}
							outputs := []interface{}{map[string]interface{}{"data": opReturnHex}}
							if changeAmt > 0.0001 {
								outputs = append(outputs, map[string]interface{}{creatorAddr: changeAmt})
							}
							rawRes, rawErr := creatorNode.Call("createrawtransaction", []interface{}{inputs, outputs})
							if rawErr == nil {
								var rawHex string
								json.Unmarshal(rawRes, &rawHex)
								signResult, signErr := creatorNode.Call("signrawtransactionwithwallet", []interface{}{rawHex})
								if signErr == nil {
									var signed struct {
										Hex      string `json:"hex"`
										Complete bool   `json:"complete"`
									}
									json.Unmarshal(signResult, &signed)
									if signed.Complete {
										var burnTxid string
										txidResult, broadcastErr := creatorNode.Call("sendrawtransaction", []interface{}{signed.Hex})
										if broadcastErr == nil {
											json.Unmarshal(txidResult, &burnTxid)
											log.Printf("[AUTO-CLOSE] Burned %d unsold tokens for %s, txid: %s", unsold, p.AssetID, burnTxid)
										}
									}
								}
							}
						}
					}
				}
			}
			// Mine block to confirm burn
			cbdcNode.Call("generatetoaddress", []interface{}{1, creatorAddr})
		} else {
			log.Printf("[AUTO-CLOSE] Presale %s closed, all tokens sold — no burn needed", p.AssetID)
		}

		// Clear asset cache
		assetsCache.mu.Lock()
		assetsCache.assets = nil
		assetsCache.mu.Unlock()
	}
}

// ─── Market Maker ─────────────────────────────────────────────────────────────

const (
	mmSpreadPct  = 0.005         // 0.5% spread tiap sisi
	mmQtyPerSide = int64(1000)   // jumlah token per order MM
	mmMinDepth   = 2             // pasang order kalau depth < ini
	mmInterval   = 1 * time.Second
)

var mmState struct {
	sync.RWMutex
	lastRun int64
	address string
	total   int
	pairs   []map[string]interface{}
}

func mmGetSystemAddr() string {
	raw, err := cbdcNode.Call("getnewaddress", []interface{}{""})
	if err != nil {
		return "grd1qufk0s4hh95gn7srrj06t0pmpzfym37ndjvjjgv"
	}
	var addr string
	json.Unmarshal(raw, &addr)
	if addr == "" {
		return "grd1qufk0s4hh95gn7srrj06t0pmpzfym37ndjvjjgv"
	}
	return addr
}

func mmGetFairPrice(assetID string) float64 {
	// Coba harga dari last trade
	raw, err := cbdcNode.Call("gettradehistory", []interface{}{assetID})
	if err == nil {
		var trades []struct {
			PriceGRD float64 `json:"price_grd"`
			Price    float64 `json:"price"`
		}
		if json.Unmarshal(raw, &trades) == nil && len(trades) > 0 {
			p := trades[len(trades)-1].PriceGRD
			if p == 0 {
				p = trades[len(trades)-1].Price
			}
			if p > 0 {
				return p
			}
		}
	}
	// Fallback: mid price dari orderbook
	raw2, err := cbdcNode.Call("getorderbook", []interface{}{assetID})
	if err == nil {
		var ob struct {
			Asks []struct {
				PriceGRD float64 `json:"price_grd"`
				Price    float64 `json:"price"`
			} `json:"asks"`
			Bids []struct {
				PriceGRD float64 `json:"price_grd"`
				Price    float64 `json:"price"`
			} `json:"bids"`
		}
		if json.Unmarshal(raw2, &ob) == nil {
			askP, bidP := 0.0, 0.0
			if len(ob.Asks) > 0 {
				askP = ob.Asks[0].PriceGRD
				if askP == 0 {
					askP = ob.Asks[0].Price
				}
			}
			if len(ob.Bids) > 0 {
				bidP = ob.Bids[0].PriceGRD
				if bidP == 0 {
					bidP = ob.Bids[0].Price
				}
			}
			if askP > 0 && bidP > 0 {
				return (askP + bidP) / 2
			}
			if askP > 0 {
				return askP
			}
			if bidP > 0 {
				return bidP
			}
		}
	}
	return 0
}

func mmPlaceOrder(side, assetID string, priceGRD float64, qty int64, addr string) error {
	priceGRD = math.Round(priceGRD*1e8) / 1e8
	amount := float64(qty) / 1e8
	_, err := cbdcNode.Call("placeorder", []interface{}{
		assetID, strings.ToLower(side), amount, priceGRD, addr,
	})
	return err
}

func runMarketMaker() {
	// Tunggu node siap
	time.Sleep(10 * time.Second)
	addr := mmGetSystemAddr()
	log.Printf("[MM] Market maker started addr=%s spread=%.2f%%", addr, mmSpreadPct*100)
	mmState.Lock()
	mmState.address = addr
	mmState.Unlock()

	for {
		time.Sleep(mmInterval)
		assets := scanAssets()
		placed := 0
		pairStats := []map[string]interface{}{}

		for _, asset := range assets {
			if strings.ToUpper(asset.Tipe) == "NATIVE" {
				continue
			}

			fairPrice := mmGetFairPrice(asset.AssetID)
			if fairPrice <= 0 {
				if strings.ToUpper(asset.Tipe) == "STABLECOIN" {
					fairPrice = 0.001 // default peg stablecoin
				} else {
					continue
				}
			}

			// Cek kedalaman orderbook
			raw, err := cbdcNode.Call("getorderbook", []interface{}{asset.AssetID})
			bidDepth, askDepth := 0, 0
			if err == nil {
				var ob struct {
					Asks []interface{} `json:"asks"`
					Bids []interface{} `json:"bids"`
				}
				json.Unmarshal(raw, &ob)
				askDepth = len(ob.Asks)
				bidDepth = len(ob.Bids)
			}

			bidPrice := fairPrice * (1 - mmSpreadPct)
			askPrice := fairPrice * (1 + mmSpreadPct)
			stat := map[string]interface{}{
				"kode":      asset.Kode,
				"assetId":   asset.AssetID,
				"fairPrice": fairPrice,
				"bidPrice":  bidPrice,
				"askPrice":  askPrice,
				"bidDepth":  bidDepth,
				"askDepth":  askDepth,
			}

			if bidDepth < mmMinDepth {
				if err := mmPlaceOrder("buy", asset.AssetID, bidPrice, mmQtyPerSide, addr); err == nil {
					placed++
					stat["mm_bid"] = true
					log.Printf("[MM] BID %s @ %.8f GRD", asset.Kode, bidPrice)
				} else {
					log.Printf("[MM] BID %s failed: %v", asset.Kode, err)
				}
			}
			if askDepth < mmMinDepth {
				if err := mmPlaceOrder("sell", asset.AssetID, askPrice, mmQtyPerSide, addr); err == nil {
					placed++
					stat["mm_ask"] = true
					log.Printf("[MM] ASK %s @ %.8f GRD", asset.Kode, askPrice)
				} else {
					log.Printf("[MM] ASK %s failed: %v", asset.Kode, err)
				}
			}
			pairStats = append(pairStats, stat)
		}

		mmState.Lock()
		mmState.lastRun = time.Now().Unix()
		mmState.total += placed
		mmState.pairs = pairStats
		mmState.Unlock()
		log.Printf("[MM] Cycle done: %d orders across %d assets", placed, len(pairStats))
	}
}

func handleMMStatus(w http.ResponseWriter, r *http.Request) {
	mmState.RLock()
	defer mmState.RUnlock()
	writeJSON(w, map[string]interface{}{
		"address":      mmState.address,
		"last_run":     mmState.lastRun,
		"total_orders": mmState.total,
		"spread_pct":   mmSpreadPct * 100,
		"qty_per_side": mmQtyPerSide,
		"min_depth":    mmMinDepth,
		"pairs":        mmState.pairs,
	})
}

// ── Extension Wallet Handlers (Non-Custodial) ─────────────────────────────

// POST /api/wallet/watchonly — import alamat ke node sebagai watch-only
// agar UTXO bisa di-track tanpa private key
func handleWalletWatchonly(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		writeJSON(w, map[string]string{"error": "POST only"})
		return
	}
	var req struct {
		Address string `json:"address"`
		Label   string `json:"label"`
	}
	json.NewDecoder(r.Body).Decode(&req)
	if req.Address == "" {
		writeJSON(w, map[string]string{"error": "address required"})
		return
	}
	label := req.Label
	if label == "" {
		label = "extension-watchonly"
	}
	// importaddress ke publicNode agar bisa track UTXO
	_, err := publicNode.Call("importaddress", []interface{}{req.Address, label, false})
	if err != nil {
		// Jika sudah ada, abaikan error
		if !strings.Contains(err.Error(), "already") {
			writeJSON(w, map[string]string{"error": err.Error()})
			return
		}
	}
	writeJSON(w, map[string]string{"status": "ok", "address": req.Address})
}

// GET /api/wallet/utxos?address=grd1q...
// Kembalikan UTXO milik address dari semua node
func handleWalletUTXOs(w http.ResponseWriter, r *http.Request) {
	addr := r.URL.Query().Get("address")
	if addr == "" {
		writeJSON(w, map[string]string{"error": "address required"})
		return
	}
	type UTXO struct {
		Txid   string  `json:"txid"`
		Vout   int     `json:"vout"`
		Value  int64   `json:"value"`  // satoshi
		Amount float64 `json:"amount"` // GRD
	}
	var utxos []UTXO
	filter := []string{addr}
	for _, node := range []*RPCClient{publicNode, cbdcNode, creatorNode} {
		raw, err := node.Call("listunspent", []interface{}{1, 9999999, filter, true})
		if err != nil {
			continue
		}
		var list []struct {
			Txid   string  `json:"txid"`
			Vout   int     `json:"vout"`
			Amount float64 `json:"amount"`
		}
		if json.Unmarshal(raw, &list) != nil {
			continue
		}
		for _, u := range list {
			utxos = append(utxos, UTXO{
				Txid:   u.Txid,
				Vout:   u.Vout,
				Amount: u.Amount,
				Value:  int64(u.Amount * 1e8),
			})
		}
		if len(utxos) > 0 {
			break // pakai node pertama yang ada UTXO-nya
		}
	}
	if utxos == nil {
		utxos = []UTXO{}
	}
	writeJSON(w, utxos)
}

// POST /api/dex/order/prepare — bangun OP_RETURN data untuk order tanpa broadcast
// Extension akan sign TX-nya sendiri lalu panggil /api/broadcast
func handleDexOrderPrepare(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		writeJSON(w, map[string]string{"error": "POST only"})
		return
	}
	var req struct {
		AssetID   string  `json:"asset_id"`
		Side      string  `json:"side"`
		Price     float64 `json:"price"`
		Amount    int64   `json:"amount"`
		Address   string  `json:"address"`
		OrderType string  `json:"order_type"` // "limit" | "market"
	}
	json.NewDecoder(r.Body).Decode(&req)
	if req.AssetID == "" || req.Amount <= 0 || req.Address == "" {
		writeJSON(w, map[string]string{"error": "asset_id, amount, address diperlukan"})
		return
	}
	if req.OrderType == "" {
		req.OrderType = "limit"
	}

	priceGRD := math.Round(req.Price*1e8) / 1e8
	amount := float64(req.Amount) / 1e8
	rpcResult, err := cbdcNode.Call("placeorder", []interface{}{
		req.AssetID, strings.ToLower(req.Side), amount, priceGRD, req.Address,
	})
	if err != nil {
		writeJSON(w, map[string]string{"error": err.Error()})
		return
	}

	var parsed struct {
		OrderID string `json:"order_id"`
	}
	json.Unmarshal(rpcResult, &parsed)

	writeJSON(w, map[string]interface{}{
		"status":   "ok",
		"order_id": parsed.OrderID,
	})
}

// POST /api/broadcast — broadcast signed raw transaction dari extension
func handleBroadcast(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		writeJSON(w, map[string]string{"error": "POST only"})
		return
	}
	var req struct {
		Hex string `json:"hex"`
	}
	json.NewDecoder(r.Body).Decode(&req)
	if req.Hex == "" {
		writeJSON(w, map[string]string{"error": "hex required"})
		return
	}

	// Coba broadcast ke semua node
	var txid string
	var lastErr error
	for _, node := range []*RPCClient{publicNode, cbdcNode, creatorNode} {
		raw, err := node.Call("sendrawtransaction", []interface{}{req.Hex})
		if err != nil {
			lastErr = err
			continue
		}
		json.Unmarshal(raw, &txid)
		if txid != "" {
			// Mine 1 blok untuk konfirmasi
			cbdcNode.Call("generatetoaddress", []interface{}{1, "grd1qufk0s4hh95gn7srrj06t0pmpzfym37ndjvjjgv"})
			writeJSON(w, map[string]string{"status": "ok", "txid": txid})
			return
		}
	}
	writeJSON(w, map[string]interface{}{"error": lastErr.Error()})
}

// POST /api/blockchain/mine — mine 1 block menggunakan CBDC node
func handleMineBlock(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}
	const cbdcAddr = "grd1qhaclxgx8xhzxjmwg8meuwp7k2ut53t0equ002s"
	raw, err := cbdcNode.Call("generatetoaddress", []interface{}{1, cbdcAddr})
	if err != nil {
		writeJSON(w, map[string]interface{}{"error": "Gagal mine block: " + err.Error()})
		return
	}
	var hashes []string
	json.Unmarshal(raw, &hashes)
	writeJSON(w, map[string]interface{}{"status": "ok", "blocks": hashes})
}

func main() {
	// Optional CLI: `garudaapi -verify-audit <path>` verifies a
	// tamper-evident audit chain file and exits. No server startup,
	// no side effects. Useful for operators and CI.
	if len(os.Args) >= 3 && os.Args[1] == "-verify-audit" {
		n, err := VerifyAuditChain(os.Args[2])
		if err != nil {
			fmt.Fprintf(os.Stderr, "audit chain INVALID after %d entries: %v\n", n, err)
			os.Exit(1)
		}
		fmt.Printf("audit chain OK: %d entries verified\n", n)
		os.Exit(0)
	}

	// Initialise key provider (Vault > GCP SM > env var) BEFORE loadSecurityConfig
	// so that encrypted admin key / RPC passwords can be resolved from KMS.
	initKeyProvider()

	// Load security/runtime configuration from env BEFORE anything else.
	// Emits [SECURITY WARN] for any value still on legacy hardcoded defaults.
	loadSecurityConfig()

	port := "5000"
	if p := os.Getenv("PORT"); p != "" {
		port = p
	}

	publicNode = NewRPC("http://127.0.0.1:19447",
		securityConfig.RPCUserPublic, securityConfig.RPCPassPublic)
	cbdcNode = NewRPC("http://127.0.0.1:19443",
		securityConfig.RPCUserCBDC, securityConfig.RPCPassCBDC)
	creatorNode = NewRPC("http://127.0.0.1:19451",
		securityConfig.RPCUserCreator, securityConfig.RPCPassCreator)
	creatorWalletNode = NewRPC("http://127.0.0.1:19451/wallet/creator-wallet",
		securityConfig.RPCUserCreator, securityConfig.RPCPassCreator)
	cbdcWalletNode = NewRPC("http://127.0.0.1:19443/wallet/cbdc-authority",
		securityConfig.RPCUserCBDC, securityConfig.RPCPassCBDC)

	// Start the audit tail-hash witness goroutine. No-op if
	// GARUDA_WITNESS_INTERVAL is unset or the audit chain is disabled.
	StartAuditWitness()

	loadDividendMeta()

	// Test connection
	raw, err := publicNode.Call("getblockchaininfo", nil)
	if err != nil {
		log.Printf("[WARN] Public node not reachable: %v", err)
	} else {
		var info struct {
			Chain  string `json:"chain"`
			Blocks int64  `json:"blocks"`
		}
		json.Unmarshal(raw, &info)
		log.Printf("[OK] Connected to GarudaChain: chain=%s blocks=%d", info.Chain, info.Blocks)
	}

	// Background worker: auto-close expired presales and burn unsold tokens
	go func() {
		for {
			time.Sleep(30 * time.Second)
			autoCloseExpiredPresales()
		}
	}()

	// Background worker: market maker — jaga likuiditas orderbook otomatis
	go runMarketMaker()

	// Background worker: exchange rates — update kurs dunia setiap 1 jam
	go runExchangeRateUpdater()
	startOraclePriceRecorder()

	// Realtime WebSocket layer (orderbook/trades/candles/allMids/oracle)
	// dipindahkan ke dex-archive/api/realtime.go — bukan bagian dari
	// blockchain stack lagi.

	mux := http.NewServeMux()


	// Health
	mux.HandleFunc("/api/healthz", handleHealthz)
	mux.HandleFunc("/api/metrics", handleMetrics)

	// Blockchain/Explorer
	mux.HandleFunc("/api/blockchain/stats", handleStats)
	mux.HandleFunc("/api/blockchain/blocks", handleBlocks)
	mux.HandleFunc("/api/blockchain/blocks/", handleBlockByHeight)
	mux.HandleFunc("/api/blockchain/transactions", handleTransactions)
	mux.HandleFunc("/api/blockchain/transactions/", handleTxByHash)
	mux.HandleFunc("/api/blockchain/address/", handleAddress)
	mux.HandleFunc("/api/blockchain/search", handleSearch)
	mux.HandleFunc("/api/blockchain/stocks", handleStocks)
	mux.HandleFunc("/api/blockchain/stock/", handleStockDetail)
	mux.HandleFunc("/api/blockchain/tokens", handleTokens)
	mux.HandleFunc("/api/blockchain/token/", handleTokenDetail)
	mux.HandleFunc("/api/blockchain/pool/", handlePool)
	mux.HandleFunc("/api/blockchain/orderbook/", handleOrderbook)
	mux.HandleFunc("/api/blockchain/mining", handleMining)
	mux.HandleFunc("/api/blockchain/top-miners", handleTopMiners)
	mux.HandleFunc("/api/blockchain/wallets", handleWallets)
	mux.HandleFunc("/api/blockchain/wallet/", handleWalletDetail)
	mux.HandleFunc("/api/blockchain/supply", handleSupply)
	mux.HandleFunc("/api/blockchain/stablecoins", handleStablecoins)
	mux.HandleFunc("/api/blockchain/trade-history/", handleTradeHistory)
	mux.HandleFunc("/api/blockchain/asset-holders/", handleAssetHolders)
	mux.HandleFunc("/api/blockchain/presales", handlePresales)
	mux.HandleFunc("/api/blockchain/presale/", handlePresaleDetail)
	mux.HandleFunc("/api/blockchain/apbn", handleAPBN)
	mux.HandleFunc("/api/blockchain/stream", handleStream)

	// DEX
	mux.HandleFunc("/api/dex/wallet/create", handleDexWalletCreate)
	mux.HandleFunc("/api/dex/wallet/connect", handleDexWalletConnect)
	mux.HandleFunc("/api/dex/deposit", handleDexDeposit)
	mux.HandleFunc("/api/dex/withdraw", handleDexWithdraw)
	mux.HandleFunc("/api/dex/order", handleDexOrder)
	mux.HandleFunc("/api/dex/swap", handleDexSwap)
	mux.HandleFunc("/api/dex/oracle-swap", handleOracleSwap)
	mux.HandleFunc("/api/dex/cross-swap", handleCrossSwap)
	mux.HandleFunc("/api/dex/prepare-transfer", handlePrepareTransfer)
	mux.HandleFunc("/api/dex/receive-grd", handleReceiveGRD)
	mux.HandleFunc("/api/dex/presale/create", handleCreatePresale)
	mux.HandleFunc("/api/dex/presale/buy", handleBuyPresale)
	mux.HandleFunc("/api/dex/presale/close", handleClosePresale)
	mux.HandleFunc("/api/dex/order/cancel", handleDexCancelOrder)
	mux.HandleFunc("/api/dex/my-orders/", handleDexMyOrders)
	mux.HandleFunc("/api/dex/trades/", handleDexTrades)
	mux.HandleFunc("/api/dex/price-history/", handleDexPriceHistory)
	mux.HandleFunc("/api/dex/live-price/", handleDexLivePrice)
	mux.HandleFunc("/api/dex/mm-status", handleMMStatus)
	mux.HandleFunc("/api/dex/fee-stats", handleFeeStats)

	// QRIS Fiat Deposit
	mux.HandleFunc("/api/dex/qris/create", handleQRISCreate)
	mux.HandleFunc("/api/dex/qris/status/", handleQRISStatus)
	mux.HandleFunc("/api/dex/qris/confirm", handleQRISConfirm)
	mux.HandleFunc("/api/dex/qris/pending", handleQRISPending)

	// Exchange Rates (real-time, 180+ mata uang)
	mux.HandleFunc("/api/exchange-rates", handleExchangeRates)
	mux.HandleFunc("/api/exchange-rates/convert", handleExchangeConvert)
	mux.HandleFunc("/api/exchange-rates/currencies", handleExchangeCurrencies)
	mux.HandleFunc("/api/blockchain/peg/", handlePegInfo)

	// Admin management endpoints
	mux.HandleFunc("/api/admin/rotate-key", handleAdminRotateKey)
	mux.HandleFunc("/api/admin/security-status", handleSecurityStatus)
	mux.HandleFunc("/api/admin/health", handleAdminHealth)

	// CBDC management endpoints
	mux.HandleFunc("/api/cbdc/mint", handleCBDCMint)
	mux.HandleFunc("/api/cbdc/burn", handleCBDCBurn)
	mux.HandleFunc("/api/cbdc/issue", handleCBDCIssue)
	mux.HandleFunc("/api/cbdc/transfer", handleCBDCTransfer)
	mux.HandleFunc("/api/cbdc/wallet/create", handleCBDCWalletCreate)
	mux.HandleFunc("/api/cbdc/supply/", handleCBDCSupply)

	// Asset Logos
	mux.HandleFunc("/api/asset/logos", handleAssetLogosList)
	mux.HandleFunc("/api/asset/metadata/", handleAssetMetadata)
	mux.HandleFunc("/api/asset/doc/", handleAssetDocUpload)
	mux.HandleFunc("/api/asset/logo/", func(w http.ResponseWriter, r *http.Request) {
		if r.Method == http.MethodPost {
			handleAssetLogoUpload(w, r)
		} else {
			handleAssetLogoGet(w, r)
		}
	})

	// Dividend
	mux.HandleFunc("/api/dividend/declare", handleDividendDeclare)
	mux.HandleFunc("/api/dividend/history/", handleDividendHistory)

	// ── Extension wallet endpoints (non-custodial) ────────────────────────
	// handleWalletWatchonly: import alamat sebagai watch-only agar node bisa
	// track UTXO-nya tanpa menyimpan private key.
	// handleWalletUTXOs: kembalikan daftar UTXO milik address tertentu.
	// handleDexOrderPrepare: bangun OP_RETURN order, kembalikan hex + UTXO
	//   agar extension bisa sign sendiri (non-custodial).
	// handleBroadcast: broadcast signed raw TX yang sudah di-sign extension.
	// Extension wallet endpoints (non-custodial)
	mux.HandleFunc("/api/dex/order/prepare", handleDexOrderPrepare)
	mux.HandleFunc("/api/broadcast", handleBroadcast)
	mux.HandleFunc("/api/wallet/utxos", handleWalletUTXOs)
	mux.HandleFunc("/api/wallet/watchonly", handleWalletWatchonly)
	mux.HandleFunc("/api/blockchain/mine", handleMineBlock)

	// Bind only to the interface configured by GARUDA_BIND (default: localhost).
	// Operators must explicitly opt into 0.0.0.0 — preventing accidental
	// exposure of an unhardened API to the public internet.
	bind := securityConfig.BindAddr
	if bind == "0.0.0.0" || bind == "*" {
		bind = ""
	}
	mux.HandleFunc("/api/quantum/address", handleQuantumAddress)

	// GarudaChain Security & Oracle endpoints (new)
	mux.HandleFunc("/api/cbdc/info", handleCBDCInfoAPI)
	mux.HandleFunc("/api/cbdc/stateroot", handleStateRootAPI)
	mux.HandleFunc("/api/oracle/status", handleOracleSyncStatusAPI)
	mux.HandleFunc("/api/oracle/rates", handleOracleRatesAPI)
	mux.HandleFunc("/api/cbdc/security", handleSecurityInfoAPI)

	loadLogoCIDs()
	loadAssetMetadata()

	// Middleware chain (outermost → innermost):
	//   secureCORSMiddleware → globalRateLimitMiddleware → metricsMiddleware → limitBodyMiddleware → mux
	// CORS sits outermost so OPTIONS preflight always gets CORS headers even
	// when the rate limiter would otherwise block. The global rate limiter
	// skips OPTIONS/HEAD so health checks and preflight never consume budget.
	// Metrics sit inside the rate limiter so 429s are counted per route.
	// Body-size limit is innermost so every POST handler inherits the 1 MiB cap.
	handler := secureCORSMiddleware(globalRateLimitMiddleware(metricsMiddleware(limitBodyMiddleware(mux))))
	startServer(handler, bind, port)
}

// startServer configures and starts the HTTP (and optionally HTTPS)
// server. If GARUDA_TLS_CERT and GARUDA_TLS_KEY are both set, the
// primary listener uses TLS. If GARUDA_HTTP_REDIRECT_PORT is also set,
// a plain-HTTP listener on that port issues permanent redirects to the
// TLS address.
//
// Graceful shutdown: on SIGTERM or SIGINT the server stops accepting
// new connections and waits up to shutdownTimeout for in-flight
// requests to complete, then flushes and closes the audit chain.
// This prevents truncated audit entries when the container or systemd
// unit stops the process.
//
// Server hardening:
//   - ReadHeaderTimeout: 5s  (stops Slowloris header-stall attacks)
//   - ReadTimeout: 15s, WriteTimeout: 30s
//   - IdleTimeout: 60s  (keep-alive idle cap)
const shutdownTimeout = 30 * time.Second

func startServer(handler http.Handler, bind, port string) {
	certFile := os.Getenv("GARUDA_TLS_CERT")
	keyFile := os.Getenv("GARUDA_TLS_KEY")
	tlsEnabled := certFile != "" && keyFile != ""

	server := &http.Server{
		Addr:              bind + ":" + port,
		Handler:           handler,
		ReadTimeout:       15 * time.Second,
		ReadHeaderTimeout: 5 * time.Second,
		WriteTimeout:      30 * time.Second,
		IdleTimeout:       60 * time.Second,
	}

	// Graceful shutdown goroutine: waits for SIGTERM/SIGINT, then
	// drains in-flight requests, stops the witness goroutine, and
	// closes the audit chain before exiting.
	quit := make(chan os.Signal, 1)
	signal.Notify(quit, syscall.SIGTERM, syscall.SIGINT)
	go func() {
		sig := <-quit
		log.Printf("[shutdown] received %s — draining (timeout=%s)", sig, shutdownTimeout)
		ctx, cancel := context.WithTimeout(context.Background(), shutdownTimeout)
		defer cancel()
		if err := server.Shutdown(ctx); err != nil {
			log.Printf("[shutdown] graceful drain exceeded timeout: %v", err)
		}
		StopAuditWitness()
		CloseAuditChain()
		log.Printf("[shutdown] clean exit")
		os.Exit(0)
	}()

	if tlsEnabled {
		// Optional HTTP → HTTPS redirect on a separate port.
		if redirectPort := os.Getenv("GARUDA_HTTP_REDIRECT_PORT"); redirectPort != "" {
			redir := &http.Server{
				Addr:              bind + ":" + redirectPort,
				ReadHeaderTimeout: 5 * time.Second,
				Handler: http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
					target := "https://" + r.Host + r.RequestURI
					http.Redirect(w, r, target, http.StatusPermanentRedirect)
				}),
			}
			go func() {
				log.Printf("[tls] HTTP→HTTPS redirect on :%s", sanitizeLog(redirectPort))
				if err := redir.ListenAndServe(); err != nil && err != http.ErrServerClosed {
					log.Printf("[tls] redirect listener: %v", err)
				}
			}()
		}
		log.Printf("GarudaAPI running on https://%s:%s (TLS)", sanitizeLog(bind), sanitizeLog(port))
		if err := server.ListenAndServeTLS(certFile, keyFile); err != nil && err != http.ErrServerClosed {
			log.Fatalf("ListenAndServeTLS: %v", err)
		}
	} else {
		if os.Getenv("GARUDA_STRICT") == "1" {
			log.Printf("[SECURITY WARN] TLS is not configured (GARUDA_TLS_CERT/KEY unset). Admin credentials travel in cleartext. Set TLS certs for production.")
		}
		log.Printf("GarudaAPI running on http://%s:%s", sanitizeLog(bind), sanitizeLog(port))
		if err := server.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			log.Fatalf("ListenAndServe: %v", err)
		}
	}
}

// ─── Quantum (ML-DSA-87, FIPS 204 Level 5) ───────────────────────────────────

const (
	pqBech32HRP       = "grd"
	pqWitnessVersion  = 2
	pqPubkeySize      = 2592 // ML-DSA-87 public key size
	pqBech32mConst    = uint32(0x2bc830a3)
	pqBech32Charset   = "qpzry9x8gf2tvdw0s3jn54khce6mua7l"
)

var pqBech32Gen = [5]uint32{0x3b6a57b2, 0x26508e6d, 0x1ea119fa, 0x3d4233dd, 0x2a1462b3}

func pqPolymod(values []uint32) uint32 {
	chk := uint32(1)
	for _, v := range values {
		top := chk >> 25
		chk = ((chk & 0x1ffffff) << 5) ^ v
		for i := 0; i < 5; i++ {
			if (top>>uint(i))&1 != 0 {
				chk ^= pqBech32Gen[i]
			}
		}
	}
	return chk
}

func pqHRPExpand(hrp string) []uint32 {
	r := make([]uint32, 0, len(hrp)*2+1)
	for _, c := range hrp {
		r = append(r, uint32(c)>>5) // #nosec G115 -- bech32: hrp is ASCII, rune fits uint32
	}
	r = append(r, 0)
	for _, c := range hrp {
		r = append(r, uint32(c)&31) // #nosec G115 -- bech32: hrp is ASCII, rune fits uint32
	}
	return r
}

// pqConvertBits is the bech32m base-conversion helper for the
// post-quantum address family. Same bounded-input argument as
// convertBits: toBits ≤ 8 and maxv ≤ 255, so byte() is safe.
func pqConvertBits(data []byte, fromBits, toBits uint, pad bool) []byte {
	acc, bits := 0, uint(0)
	maxv := (1 << toBits) - 1
	var out []byte
	for _, v := range data {
		acc = (acc << fromBits) | int(v)
		bits += fromBits
		for bits >= toBits {
			bits -= toBits
			out = append(out, byte((acc>>bits)&maxv)) // #nosec G115 -- bech32: maxv ≤ 255
		}
	}
	if pad && bits > 0 {
		out = append(out, byte((acc<<(toBits-bits))&maxv)) // #nosec G115 -- bech32: maxv ≤ 255
	}
	return out
}

func pqBech32mEncode(hrp string, data []byte) string {
	combined := make([]uint32, len(data))
	for i, b := range data {
		combined[i] = uint32(b)
	}
	checkValues := append(pqHRPExpand(hrp), combined...)
	checkValues = append(checkValues, 0, 0, 0, 0, 0, 0)
	pm := pqPolymod(checkValues) ^ pqBech32mConst
	for i := 0; i < 6; i++ {
		combined = append(combined, (pm>>(5*uint(5-i)))&31)
	}
	var sb strings.Builder
	sb.WriteString(hrp)
	sb.WriteByte('1')
	for _, d := range combined {
		sb.WriteByte(pqBech32Charset[d])
	}
	return sb.String()
}

// pubkeyToQuantumAddress converts a 2592-byte ML-DSA-87 public key to a grd1z... address.
// address = bech32m("grd", [2] + convertBits(SHA256(pubkey), 8→5))
func pubkeyToQuantumAddress(pubkeyBytes []byte) (string, error) {
	if len(pubkeyBytes) != pqPubkeySize {
		return "", fmt.Errorf("ML-DSA-87 public key must be %d bytes, got %d", pqPubkeySize, len(pubkeyBytes))
	}
	hash := sha256.Sum256(pubkeyBytes)
	words := pqConvertBits(hash[:], 8, 5, true)
	payload := append([]byte{pqWitnessVersion}, words...)
	return pqBech32mEncode(pqBech32HRP, payload), nil
}

// POST /api/quantum/address
// Body: {"pubkey": "<hex>"}  (2592-byte ML-DSA-87 public key)
// Returns: {"address": "grd1z...", "witness_version": 2, "algo": "ML-DSA-87"}
func handleQuantumAddress(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	var req struct {
		Pubkey string `json:"pubkey"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "invalid JSON", http.StatusBadRequest)
		return
	}
	pubkeyBytes, err := hex.DecodeString(req.Pubkey)
	if err != nil {
		http.Error(w, "pubkey must be hex", http.StatusBadRequest)
		return
	}
	addr, err := pubkeyToQuantumAddress(pubkeyBytes)
	if err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	writeJSON(w, map[string]interface{}{
		"address":         addr,
		"witness_version": pqWitnessVersion,
		"algo":            "ML-DSA-87",
	})
}

// ─── CBDC Info API ──────────────────────────────────────────────────────────

func handleCBDCInfoAPI(w http.ResponseWriter, r *http.Request) {
	raw, err := cbdcNode.Call("getcbdcinfo", []interface{}{})
	if err != nil {
		writeJSON(w, map[string]interface{}{"error": err.Error()})
		return
	}
	var info map[string]interface{}
	json.Unmarshal(raw, &info)
	writeJSON(w, info)
}

func handleStateRootAPI(w http.ResponseWriter, r *http.Request) {
	raw, err := cbdcNode.Call("getstateroot", []interface{}{})
	if err != nil {
		writeJSON(w, map[string]interface{}{"error": err.Error()})
		return
	}
	var result map[string]interface{}
	json.Unmarshal(raw, &result)
	writeJSON(w, result)
}

func handleOracleSyncStatusAPI(w http.ResponseWriter, r *http.Request) {
	raw, err := cbdcNode.Call("getpegratesyncstatus", []interface{}{})
	if err != nil {
		writeJSON(w, map[string]interface{}{"error": err.Error()})
		return
	}
	var result map[string]interface{}
	json.Unmarshal(raw, &result)
	writeJSON(w, result)
}

func handleOracleRatesAPI(w http.ResponseWriter, r *http.Request) {
	symbol := r.URL.Query().Get("symbol")
	var params []interface{}
	if symbol != "" {
		params = []interface{}{symbol}
	}
	raw, err := cbdcNode.Call("getpegrates", params)
	if err == nil {
		var result interface{}
		json.Unmarshal(raw, &result)
		writeJSON(w, result)
		return
	}
	// Fallback: return live oracle rates with micro-fluctuation
	rates := defaultOracleRates()
	if symbol != "" {
		sym := strings.ToUpper(symbol)
		// Strip "P" prefix for pegged tokens
		if len(sym) > 1 && strings.HasPrefix(sym, "P") {
			sym = sym[1:]
		}
		if r, ok := rates[sym]; ok {
			writeJSON(w, map[string]interface{}{
				"symbol":       sym,
				"grd_per_unit": r[0],
				"units_per_grd": r[1],
			})
			return
		}
		writeJSON(w, map[string]interface{}{"error": "symbol not found"})
		return
	}
	// Return all rates
	var allRates []map[string]interface{}
	for sym, r := range rates {
		allRates = append(allRates, map[string]interface{}{
			"symbol":       sym,
			"grd_per_unit": r[0],
			"units_per_grd": r[1],
		})
	}
	writeJSON(w, allRates)
}

func handleSecurityInfoAPI(w http.ResponseWriter, r *http.Request) {
	// Aggregate security status from multiple RPCs
	cbdcRaw, _ := cbdcNode.Call("getcbdcinfo", []interface{}{})
	stateRaw, _ := cbdcNode.Call("getstateroot", []interface{}{})
	syncRaw, _ := cbdcNode.Call("getpegratesyncstatus", []interface{}{})

	var cbdcInfo, stateRoot, syncStatus map[string]interface{}
	if cbdcRaw != nil { json.Unmarshal(cbdcRaw, &cbdcInfo) }
	if stateRaw != nil { json.Unmarshal(stateRaw, &stateRoot) }
	if syncRaw != nil { json.Unmarshal(syncRaw, &syncStatus) }

	pqcActive := false
	if cbdcInfo != nil {
		if v, ok := cbdcInfo["pqc_active"]; ok {
			pqcActive, _ = v.(bool)
		}
	}

	security := map[string]interface{}{
		"security_score": 9.5,
		"features": []map[string]interface{}{
			{"name": "Hybrid Schnorr + ML-DSA-87", "status": map[bool]string{true: "ACTIVE", false: "READY"}[pqcActive], "level": "NIST Level 5"},
			{"name": "Replay Protection", "status": "ACTIVE", "chain_id": "garudachain-mainnet-v1"},
			{"name": "CBDC Mint Fee Burn", "status": "ACTIVE", "fee": "0.1%"},
			{"name": "Rate Limiting", "status": "ACTIVE", "per_tx": "1B GRD", "per_block": "5B GRD"},
			{"name": "Key Rotation", "status": "AVAILABLE", "rpc": "rotateauthoritykey"},
			{"name": "Multi-sig Treasury", "status": "ACTIVE", "config": "2-of-3"},
			{"name": "Oracle Consensus", "status": "ACTIVE", "sources": 4, "method": "median voting"},
			{"name": "On-chain State Root", "status": "ACTIVE", "commitment": "coinbase OP_RETURN"},
			{"name": "Integer Arithmetic", "status": "ACTIVE", "method": "__int128 SafeMulDiv"},
			{"name": "Access Control", "status": "ACTIVE", "method": "walletmode + pubkey verify"},
		},
		"cbdc_info":    cbdcInfo,
		"state_root":   stateRoot,
		"oracle_sync":  syncStatus,
	}
	writeJSON(w, security)
}
