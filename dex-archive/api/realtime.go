package main

// realtime.go — Phase 1 of the "smooth as Hyperliquid" overhaul.
//
// Provides:
//   1. WebSocket endpoint /ws with a topic-based pub/sub Hub.
//   2. In-memory L2 orderbook index keyed by assetId. Aggregates raw
//      individual orders into price levels (Hyperliquid-style L2 view).
//   3. Background syncer that refreshes only the assets with active
//      subscribers and broadcasts diffs (l2update), not full snapshots.
//
// Frontend protocol (JSON over WS):
//   client → server:
//     {"op": "subscribe",   "topic": "orderbook:<assetId>"}
//     {"op": "unsubscribe", "topic": "..."}
//     {"op": "ping"}
//   server → client:
//     {"channel": "orderbook:<id>", "type": "snapshot",
//      "data": {"asks": [[price,size],...], "bids": [[price,size],...]}}
//     {"channel": "orderbook:<id>", "type": "l2update",
//      "data": {"changes": [{"side":"ask","price":1.23,"size":0},...]}}
//     {"type": "pong"}
//     {"type": "error", "msg": "..."}
//
// Phase 2+ will add allMids, trades, candles channels into the same hub.

import (
	"encoding/json"
	"log"
	"net/http"
	"sort"
	"strings"
	"sync"
	"time"

	"github.com/gorilla/websocket"
)

// ─── L2 Orderbook State ──────────────────────────────────────────────

// L2Book holds the aggregated price-level view of one asset's orderbook.
// asks/bids map price → total size at that level. Sorted slices are
// produced on demand for snapshots.
type L2Book struct {
	mu   sync.RWMutex
	asks map[float64]float64
	bids map[float64]float64
}

func newL2Book() *L2Book {
	return &L2Book{
		asks: make(map[float64]float64),
		bids: make(map[float64]float64),
	}
}

// Snapshot returns sorted [[price,size],...] arrays.
// asks ascending, bids descending — same convention as the REST endpoint.
func (b *L2Book) Snapshot() (asks [][2]float64, bids [][2]float64) {
	b.mu.RLock()
	defer b.mu.RUnlock()
	for p, s := range b.asks {
		if s > 0 {
			asks = append(asks, [2]float64{p, s})
		}
	}
	for p, s := range b.bids {
		if s > 0 {
			bids = append(bids, [2]float64{p, s})
		}
	}
	sort.Slice(asks, func(i, j int) bool { return asks[i][0] < asks[j][0] })
	sort.Slice(bids, func(i, j int) bool { return bids[i][0] > bids[j][0] })
	return
}

// L2Change is one price level update. Size=0 means remove the level.
type L2Change struct {
	Side  string  `json:"side"` // "ask" or "bid"
	Price float64 `json:"price"`
	Size  float64 `json:"size"`
}

// ApplyFreshState replaces internal state with newAsks/newBids and
// returns the diff against the previous state.
func (b *L2Book) ApplyFreshState(newAsks, newBids map[float64]float64) []L2Change {
	b.mu.Lock()
	defer b.mu.Unlock()

	var changes []L2Change

	for p, s := range newAsks {
		if old, ok := b.asks[p]; !ok || old != s {
			changes = append(changes, L2Change{Side: "ask", Price: p, Size: s})
		}
	}
	for p := range b.asks {
		if _, ok := newAsks[p]; !ok {
			changes = append(changes, L2Change{Side: "ask", Price: p, Size: 0})
		}
	}
	for p, s := range newBids {
		if old, ok := b.bids[p]; !ok || old != s {
			changes = append(changes, L2Change{Side: "bid", Price: p, Size: s})
		}
	}
	for p := range b.bids {
		if _, ok := newBids[p]; !ok {
			changes = append(changes, L2Change{Side: "bid", Price: p, Size: 0})
		}
	}

	b.asks = newAsks
	b.bids = newBids
	return changes
}

// IsEmpty reports whether the book has any levels at all.
// Used to decide whether the first subscriber needs to trigger a fetch.
func (b *L2Book) IsEmpty() bool {
	b.mu.RLock()
	defer b.mu.RUnlock()
	return len(b.asks) == 0 && len(b.bids) == 0
}

// SetState overwrites internal state without computing a diff. Used
// when a new subscriber needs to seed an empty book before snapshot.
func (b *L2Book) SetState(asks, bids map[float64]float64) {
	b.mu.Lock()
	defer b.mu.Unlock()
	b.asks = asks
	b.bids = bids
}

// ─── Orderbook Index ────────────────────────────────────────────────

type OrderbookIndex struct {
	mu    sync.RWMutex
	books map[string]*L2Book
}

var orderbookIdx = &OrderbookIndex{books: make(map[string]*L2Book)}

func (idx *OrderbookIndex) Get(assetID string) *L2Book {
	idx.mu.RLock()
	b, ok := idx.books[assetID]
	idx.mu.RUnlock()
	if ok {
		return b
	}
	idx.mu.Lock()
	defer idx.mu.Unlock()
	if b, ok = idx.books[assetID]; ok {
		return b
	}
	b = newL2Book()
	idx.books[assetID] = b
	return b
}

// fetchOrderbookAggregated calls the cbdc node's getorderbook RPC and
// aggregates raw individual orders into price-level totals.
func fetchOrderbookAggregated(assetID string) (asks, bids map[float64]float64, err error) {
	raw, err := cbdcNode.Call("getorderbook", []interface{}{assetID})
	if err != nil {
		return nil, nil, err
	}
	var ob struct {
		Asks []struct {
			Price  float64 `json:"price"`
			Amount float64 `json:"amount"`
		} `json:"asks"`
		Bids []struct {
			Price  float64 `json:"price"`
			Amount float64 `json:"amount"`
		} `json:"bids"`
	}
	if err := json.Unmarshal(raw, &ob); err != nil {
		return nil, nil, err
	}
	asks = make(map[float64]float64)
	bids = make(map[float64]float64)
	for _, a := range ob.Asks {
		if a.Amount > 0 {
			asks[a.Price] += a.Amount
		}
	}
	for _, b := range ob.Bids {
		if b.Amount > 0 {
			bids[b.Price] += b.Amount
		}
	}
	return asks, bids, nil
}

// RefreshAndPublish re-fetches the orderbook for assetID, updates the
// in-memory state, and broadcasts an l2update with only the changed
// levels. Idempotent: if nothing changed, no message is sent.
func (idx *OrderbookIndex) RefreshAndPublish(assetID string) {
	newAsks, newBids, err := fetchOrderbookAggregated(assetID)
	if err != nil {
		return
	}
	book := idx.Get(assetID)
	changes := book.ApplyFreshState(newAsks, newBids)
	if len(changes) == 0 {
		return
	}
	topic := "orderbook:" + assetID
	hub.Publish(topic, OutMsg{
		Channel: topic,
		Type:    "l2update",
		Data:    map[string]interface{}{"changes": changes},
	})
}

// SnapshotMsg returns the full-state message for sending to a new subscriber.
func (idx *OrderbookIndex) SnapshotMsg(assetID string) OutMsg {
	book := idx.Get(assetID)
	asks, bids := book.Snapshot()
	return OutMsg{
		Channel: "orderbook:" + assetID,
		Type:    "snapshot",
		Data: map[string]interface{}{
			"asks": asks,
			"bids": bids,
		},
	}
}

// ─── Hub (WebSocket subscription manager) ──────────────────────────

type Client struct {
	conn   *websocket.Conn
	send   chan []byte
	topics map[string]bool
	mu     sync.Mutex
}

type OutMsg struct {
	Channel string      `json:"channel,omitempty"`
	Type    string      `json:"type"`
	Data    interface{} `json:"data,omitempty"`
	Msg     string      `json:"msg,omitempty"`
}

type InMsg struct {
	Op    string `json:"op"`
	Topic string `json:"topic"`
}

type Hub struct {
	mu      sync.RWMutex
	clients map[*Client]bool
	topics  map[string]map[*Client]bool
}

var hub = &Hub{
	clients: make(map[*Client]bool),
	topics:  make(map[string]map[*Client]bool),
}

func (h *Hub) Register(c *Client) int {
	h.mu.Lock()
	defer h.mu.Unlock()
	h.clients[c] = true
	return len(h.clients)
}

func (h *Hub) Unregister(c *Client) {
	h.mu.Lock()
	defer h.mu.Unlock()
	if _, ok := h.clients[c]; !ok {
		return
	}
	delete(h.clients, c)
	for t := range c.topics {
		if subs, ok := h.topics[t]; ok {
			delete(subs, c)
			if len(subs) == 0 {
				delete(h.topics, t)
			}
		}
	}
	close(c.send)
}

func (h *Hub) Subscribe(c *Client, topic string) {
	h.mu.Lock()
	defer h.mu.Unlock()
	subs, ok := h.topics[topic]
	if !ok {
		subs = make(map[*Client]bool)
		h.topics[topic] = subs
	}
	subs[c] = true
	c.mu.Lock()
	c.topics[topic] = true
	c.mu.Unlock()
}

func (h *Hub) Unsubscribe(c *Client, topic string) {
	h.mu.Lock()
	defer h.mu.Unlock()
	if subs, ok := h.topics[topic]; ok {
		delete(subs, c)
		if len(subs) == 0 {
			delete(h.topics, topic)
		}
	}
	c.mu.Lock()
	delete(c.topics, topic)
	c.mu.Unlock()
}

// Publish sends msg to all subscribers of topic. Slow clients have their
// message dropped (their writer goroutine will eventually disconnect them).
func (h *Hub) Publish(topic string, msg OutMsg) {
	h.mu.RLock()
	subs := h.topics[topic]
	if len(subs) == 0 {
		h.mu.RUnlock()
		return
	}
	clients := make([]*Client, 0, len(subs))
	for c := range subs {
		clients = append(clients, c)
	}
	h.mu.RUnlock()

	payload, _ := json.Marshal(msg)
	for _, c := range clients {
		select {
		case c.send <- payload:
		default:
			log.Printf("[ws] dropping message to slow client topic=%s", topic)
		}
	}
}

// ActiveOrderbookTopics returns assetIds with at least one subscriber.
func (h *Hub) ActiveOrderbookTopics() []string {
	return h.activeAssetsForPrefix("orderbook:")
}

// ActiveTradeTopics returns assetIds with at least one trade subscriber.
func (h *Hub) ActiveTradeTopics() []string {
	return h.activeAssetsForPrefix("trades:")
}

// ActiveCandleKeys returns "{assetId}:{interval}" for each candle topic
// with at least one subscriber.
func (h *Hub) ActiveCandleKeys() []string {
	return h.activeAssetsForPrefix("candles:")
}

func (h *Hub) activeAssetsForPrefix(prefix string) []string {
	h.mu.RLock()
	defer h.mu.RUnlock()
	out := make([]string, 0)
	for t := range h.topics {
		if strings.HasPrefix(t, prefix) {
			out = append(out, strings.TrimPrefix(t, prefix))
		}
	}
	return out
}

// HasTopic reports whether any client is subscribed to topic.
// Used to skip expensive background work when nobody is watching.
func (h *Hub) HasTopic(topic string) bool {
	h.mu.RLock()
	defer h.mu.RUnlock()
	return len(h.topics[topic]) > 0
}

func sendDirect(c *Client, msg OutMsg) {
	payload, _ := json.Marshal(msg)
	select {
	case c.send <- payload:
	default:
	}
}

func sendErr(c *Client, msg string) {
	sendDirect(c, OutMsg{Type: "error", Msg: msg})
}

// ─── WebSocket handler ─────────────────────────────────────────────

var upgrader = websocket.Upgrader{
	ReadBufferSize:  4096,
	WriteBufferSize: 4096,
	CheckOrigin: func(r *http.Request) bool {
		// DEX is on a private LAN/dev environment. Tighten when going public.
		return true
	},
}

func handleWS(w http.ResponseWriter, r *http.Request) {
	conn, err := upgrader.Upgrade(w, r, nil)
	if err != nil {
		log.Printf("[ws] upgrade fail: %v", err)
		return
	}
	client := &Client{
		conn:   conn,
		send:   make(chan []byte, 256),
		topics: make(map[string]bool),
	}
	total := hub.Register(client)
	log.Printf("[ws] client connected (total=%d)", total)

	go clientWriter(client)
	clientReader(client)
}

func clientReader(c *Client) {
	defer func() {
		hub.Unregister(c)
		c.conn.Close()
	}()
	c.conn.SetReadLimit(1 << 14) // 16 KB max msg
	c.conn.SetReadDeadline(time.Now().Add(60 * time.Second))
	c.conn.SetPongHandler(func(string) error {
		c.conn.SetReadDeadline(time.Now().Add(60 * time.Second))
		return nil
	})

	for {
		_, raw, err := c.conn.ReadMessage()
		if err != nil {
			return
		}
		var in InMsg
		if err := json.Unmarshal(raw, &in); err != nil {
			sendErr(c, "invalid json")
			continue
		}
		switch in.Op {
		case "subscribe":
			handleSubscribe(c, in.Topic)
		case "unsubscribe":
			if in.Topic != "" {
				hub.Unsubscribe(c, in.Topic)
			}
		case "ping":
			sendDirect(c, OutMsg{Type: "pong"})
		default:
			sendErr(c, "unknown op: "+in.Op)
		}
	}
}

func handleSubscribe(c *Client, topic string) {
	if topic == "" {
		sendErr(c, "topic required")
		return
	}
	hub.Subscribe(c, topic)

	// Orderbook topics: send a snapshot immediately so the client has
	// initial state. Subsequent updates arrive via the syncer as l2update.
	if strings.HasPrefix(topic, "orderbook:") {
		assetID := strings.TrimPrefix(topic, "orderbook:")
		book := orderbookIdx.Get(assetID)
		if book.IsEmpty() {
			// First time anyone has subscribed to this asset — fetch synchronously.
			newAsks, newBids, err := fetchOrderbookAggregated(assetID)
			if err == nil {
				book.SetState(newAsks, newBids)
			}
		}
		sendDirect(c, orderbookIdx.SnapshotMsg(assetID))
		return
	}

	// Trades topics: send a snapshot of the ring buffer. If empty (first
	// ever subscriber), do a one-shot fetch to seed it.
	if strings.HasPrefix(topic, "trades:") {
		assetID := strings.TrimPrefix(topic, "trades:")
		buf := tradeIdx.Get(assetID)
		if buf.IsEmpty() {
			if trades, err := fetchTrades(assetID); err == nil {
				buf.AddNew(trades)
			}
		}
		sendDirect(c, tradeIdx.SnapshotMsg(assetID))
		return
	}

	// allMids: send the full current price map as a snapshot.
	if topic == "allMids" {
		sendDirect(c, OutMsg{
			Channel: "allMids",
			Type:    "snapshot",
			Data:    map[string]interface{}{"prices": midPrices.SnapshotMap()},
		})
		return
	}

	// oracle: send the current oracle peg-rate map as a snapshot. Subsequent
	// updates arrive via the oracle updater (Phase 5.5) as deltas.
	if topic == "oracle" {
		sendDirect(c, OutMsg{
			Channel: "oracle",
			Type:    "snapshot",
			Data:    map[string]interface{}{"rates": oracleRates.SnapshotMap()},
		})
		return
	}

	// candles:{assetId}:{interval} — push candle updates for one bar size.
	// First subscriber for an (asset,interval) pair triggers an initial
	// build from the trade history; subsequent updates stream as deltas.
	if strings.HasPrefix(topic, "candles:") {
		key := strings.TrimPrefix(topic, "candles:")
		parts := strings.SplitN(key, ":", 2)
		if len(parts) != 2 {
			sendErr(c, "candles topic must be candles:{assetId}:{interval}")
			return
		}
		assetID, interval := parts[0], parts[1]
		series := candleIdx.Get(assetID, interval)
		if series.IsEmpty() {
			if err := series.SeedFromTrades(); err != nil {
				log.Printf("[ws] candles seed fail asset=%s interval=%s err=%v", assetID, interval, err)
			}
		}
		sendDirect(c, series.SnapshotMsg())
		return
	}
}

func clientWriter(c *Client) {
	ticker := time.NewTicker(30 * time.Second)
	defer func() {
		ticker.Stop()
		c.conn.Close()
	}()
	for {
		select {
		case msg, ok := <-c.send:
			c.conn.SetWriteDeadline(time.Now().Add(10 * time.Second))
			if !ok {
				c.conn.WriteMessage(websocket.CloseMessage, []byte{})
				return
			}
			if err := c.conn.WriteMessage(websocket.TextMessage, msg); err != nil {
				return
			}
		case <-ticker.C:
			c.conn.SetWriteDeadline(time.Now().Add(10 * time.Second))
			if err := c.conn.WriteMessage(websocket.PingMessage, nil); err != nil {
				return
			}
		}
	}
}

// ─── Trades Channel ────────────────────────────────────────────────
// trades:{assetId} — push only NEW trades since the last poll. Backend
// keeps a ring buffer of the last 100 trades per asset so new subscribers
// can be served a snapshot without an extra RPC.

type Trade struct {
	TradeID   string  `json:"trade_id"`
	Price     float64 `json:"price"`
	Amount    float64 `json:"amount"`
	Timestamp int64   `json:"timestamp"`
	BuyOrder  string  `json:"buy_order_id,omitempty"`
	SellOrder string  `json:"sell_order_id,omitempty"`
}

// TradeBuffer is a per-asset ring of recent trades, keyed by trade_id
// for O(1) duplicate detection. We keep insertion order via the trades
// slice so we can ship a chronologically-ordered snapshot.
type TradeBuffer struct {
	mu     sync.RWMutex
	seen   map[string]bool
	trades []Trade // newest last
	cap    int
}

func newTradeBuffer(cap int) *TradeBuffer {
	return &TradeBuffer{
		seen:   make(map[string]bool),
		trades: make([]Trade, 0, cap),
		cap:    cap,
	}
}

// AddNew returns the subset of input trades that were not already in the
// buffer (deduped by trade_id). Adds them to the buffer in arrival order
// and evicts oldest entries when over capacity.
func (b *TradeBuffer) AddNew(in []Trade) []Trade {
	b.mu.Lock()
	defer b.mu.Unlock()
	var fresh []Trade
	for _, t := range in {
		if t.TradeID == "" || b.seen[t.TradeID] {
			continue
		}
		b.seen[t.TradeID] = true
		b.trades = append(b.trades, t)
		fresh = append(fresh, t)
	}
	// Evict oldest if over capacity
	if len(b.trades) > b.cap {
		drop := len(b.trades) - b.cap
		for _, t := range b.trades[:drop] {
			delete(b.seen, t.TradeID)
		}
		b.trades = b.trades[drop:]
	}
	return fresh
}

// Snapshot returns a copy of the buffered trades, newest last.
func (b *TradeBuffer) Snapshot() []Trade {
	b.mu.RLock()
	defer b.mu.RUnlock()
	out := make([]Trade, len(b.trades))
	copy(out, b.trades)
	return out
}

// IsEmpty reports whether anything has been buffered yet.
func (b *TradeBuffer) IsEmpty() bool {
	b.mu.RLock()
	defer b.mu.RUnlock()
	return len(b.trades) == 0
}

type TradeIndex struct {
	mu      sync.RWMutex
	buffers map[string]*TradeBuffer
}

var tradeIdx = &TradeIndex{buffers: make(map[string]*TradeBuffer)}

func (idx *TradeIndex) Get(assetID string) *TradeBuffer {
	idx.mu.RLock()
	b, ok := idx.buffers[assetID]
	idx.mu.RUnlock()
	if ok {
		return b
	}
	idx.mu.Lock()
	defer idx.mu.Unlock()
	if b, ok = idx.buffers[assetID]; ok {
		return b
	}
	b = newTradeBuffer(100)
	idx.buffers[assetID] = b
	return b
}

// fetchTrades calls gettradehistory and parses into the local Trade type.
// The RPC returns up to 100 trades sorted newest-first.
func fetchTrades(assetID string) ([]Trade, error) {
	raw, err := cbdcNode.Call("gettradehistory", []interface{}{assetID})
	if err != nil {
		return nil, err
	}
	var rpc []struct {
		TradeID   string  `json:"trade_id"`
		Price     float64 `json:"price"`
		Amount    float64 `json:"amount"`
		Timestamp int64   `json:"timestamp"`
		BuyOrder  string  `json:"buy_order_id"`
		SellOrder string  `json:"sell_order_id"`
	}
	if err := json.Unmarshal(raw, &rpc); err != nil {
		return nil, err
	}
	// Reverse so AddNew sees them oldest-first → ring buffer order matches time order.
	out := make([]Trade, len(rpc))
	for i, t := range rpc {
		out[len(rpc)-1-i] = Trade{
			TradeID:   t.TradeID,
			Price:     t.Price,
			Amount:    t.Amount,
			Timestamp: t.Timestamp,
			BuyOrder:  t.BuyOrder,
			SellOrder: t.SellOrder,
		}
	}
	return out, nil
}

// RefreshAndPublishTrades fetches the latest trades for assetID, dedupes
// against the ring buffer, and broadcasts only NEW trades. Idempotent.
func (idx *TradeIndex) RefreshAndPublish(assetID string) {
	trades, err := fetchTrades(assetID)
	if err != nil {
		return
	}
	buf := idx.Get(assetID)
	fresh := buf.AddNew(trades)
	if len(fresh) == 0 {
		return
	}
	topic := "trades:" + assetID
	hub.Publish(topic, OutMsg{
		Channel: topic,
		Type:    "update",
		Data:    map[string]interface{}{"trades": fresh},
	})
}

// SnapshotMsg returns the buffered trades as a snapshot for a new subscriber.
func (idx *TradeIndex) SnapshotMsg(assetID string) OutMsg {
	return OutMsg{
		Channel: "trades:" + assetID,
		Type:    "snapshot",
		Data:    map[string]interface{}{"trades": idx.Get(assetID).Snapshot()},
	}
}

// ─── allMids Channel ───────────────────────────────────────────────
// Single global topic "allMids" carrying mid prices for every asset.
// This is what powers the market list / sidebar / asset table.
// Background updater computes the full map periodically and broadcasts
// only the diff (changed assets) — initial subscribers get a snapshot.

type MidPriceMap struct {
	mu     sync.RWMutex
	prices map[string]float64
}

var midPrices = &MidPriceMap{prices: make(map[string]float64)}

// SnapshotMap returns a copy of the current full price map.
func (m *MidPriceMap) SnapshotMap() map[string]float64 {
	m.mu.RLock()
	defer m.mu.RUnlock()
	out := make(map[string]float64, len(m.prices))
	for k, v := range m.prices {
		out[k] = v
	}
	return out
}

// computeMid returns the best mid price from an aggregated orderbook.
// Falls back to one-sided if only asks or only bids exist.
func computeMid(asks, bids map[float64]float64) float64 {
	var bestAsk, bestBid float64
	for p := range asks {
		if bestAsk == 0 || p < bestAsk {
			bestAsk = p
		}
	}
	for p := range bids {
		if p > bestBid {
			bestBid = p
		}
	}
	switch {
	case bestAsk > 0 && bestBid > 0:
		return (bestAsk + bestBid) / 2
	case bestAsk > 0:
		return bestAsk
	case bestBid > 0:
		return bestBid
	}
	return 0
}

// refreshAllMids re-fetches orderbooks for every asset (parallel), recomputes
// mid prices, and broadcasts the diff vs the previous map. Snapshot is the
// new map; diff is only the entries that changed.
func refreshAllMids() {
	assets := scanAssets()
	newPrices := make(map[string]float64, len(assets))
	var mu sync.Mutex

	var wg sync.WaitGroup
	sem := make(chan struct{}, 32)
	for _, a := range assets {
		wg.Add(1)
		go func(a AssetInfo) {
			defer wg.Done()
			sem <- struct{}{}
			defer func() { <-sem }()
			asks, bids, err := fetchOrderbookAggregated(a.AssetID)
			if err != nil {
				return
			}
			mid := computeMid(asks, bids)
			if mid <= 0 {
				return
			}
			mu.Lock()
			newPrices[a.AssetID] = mid
			mu.Unlock()
		}(a)
	}
	wg.Wait()

	midPrices.mu.Lock()
	old := midPrices.prices
	midPrices.prices = newPrices
	midPrices.mu.Unlock()

	// Compute diff: changed + added (size>0) and removed (size=0)
	diff := make(map[string]float64)
	for k, v := range newPrices {
		if old[k] != v {
			diff[k] = v
		}
	}
	for k := range old {
		if _, ok := newPrices[k]; !ok {
			diff[k] = 0
		}
	}
	if len(diff) == 0 {
		return
	}
	hub.Publish("allMids", OutMsg{
		Channel: "allMids",
		Type:    "update",
		Data:    map[string]interface{}{"prices": diff},
	})
}

// runAllMidsUpdater is the background loop that powers the allMids topic.
// It only does the expensive RPC fan-out when at least one client is
// subscribed to "allMids" — otherwise it idles.
func runAllMidsUpdater() {
	log.Printf("[ws] allMids updater started (tick=2s)")
	// Seed the map once at startup so the first subscriber gets a snapshot
	// instead of an empty map.
	refreshAllMids()
	ticker := time.NewTicker(2 * time.Second)
	defer ticker.Stop()
	for range ticker.C {
		if !hub.HasTopic("allMids") {
			continue
		}
		refreshAllMids()
	}
}

// ─── Realtime Syncer ───────────────────────────────────────────────
// Tick-based: every 750ms, refresh every orderbook topic that has at
// least one subscriber. Diffs are computed in ApplyFreshState and only
// changed levels are broadcast. Polling load is bounded by the number
// of *actively viewed* assets, not the total asset count.
//
// Why tick-based and not event-driven? The cbdc node has waitfornewblock
// for new-block events, but most orderbook activity happens in mempool
// before block confirmation. A 750ms tick covers both with predictable
// load. (A future Phase can add waitfornewblock as a wakeup nudge.)
func runRealtimeSyncer() {
	log.Printf("[ws] realtime syncer started (tick=750ms)")
	ticker := time.NewTicker(750 * time.Millisecond)
	defer ticker.Stop()
	for range ticker.C {
		obTopics := hub.ActiveOrderbookTopics()
		trTopics := hub.ActiveTradeTopics()
		if len(obTopics) == 0 && len(trTopics) == 0 {
			continue
		}
		var wg sync.WaitGroup
		sem := make(chan struct{}, 16)
		for _, assetID := range obTopics {
			wg.Add(1)
			go func(a string) {
				defer wg.Done()
				sem <- struct{}{}
				defer func() { <-sem }()
				orderbookIdx.RefreshAndPublish(a)
			}(assetID)
		}
		for _, assetID := range trTopics {
			wg.Add(1)
			go func(a string) {
				defer wg.Done()
				sem <- struct{}{}
				defer func() { <-sem }()
				tradeIdx.RefreshAndPublish(a)
			}(assetID)
		}
		// Candle topics piggyback on the same syncer tick. We push fresh
		// data straight from each asset's trade buffer (which the trades:
		// channel above just refreshed for active topics — for candle-only
		// subscribers, refresh that asset's buffer here too).
		for _, key := range hub.ActiveCandleKeys() {
			parts := strings.SplitN(key, ":", 2)
			if len(parts) != 2 {
				continue
			}
			assetID, interval := parts[0], parts[1]
			wg.Add(1)
			go func(assetID, interval string) {
				defer wg.Done()
				sem <- struct{}{}
				defer func() { <-sem }()
				candleIdx.RefreshAndPublish(assetID, interval)
			}(assetID, interval)
		}
		wg.Wait()
	}
}

// ─── Oracle Channel ────────────────────────────────────────────────
// Single global topic "oracle" carrying peg rates (GRD per unit) for every
// fiat / commodity / stablecoin tracked by the oracle. Used by the world
// stablecoin grid + ORACLE world price displays. Replaces the 1s
// /api/oracle/rates polling that previously hit every client every second.

type OracleRateMap struct {
	mu    sync.RWMutex
	rates map[string]float64 // symbol → grd_per_unit
}

var oracleRates = &OracleRateMap{rates: make(map[string]float64)}

// SnapshotMap returns a copy of the current full oracle map.
func (m *OracleRateMap) SnapshotMap() map[string]float64 {
	m.mu.RLock()
	defer m.mu.RUnlock()
	out := make(map[string]float64, len(m.rates))
	for k, v := range m.rates {
		out[k] = v
	}
	return out
}

// refreshOracle re-fetches every oracle peg rate, computes the diff vs the
// previous map, and broadcasts only the changed entries.
func refreshOracle() {
	src := fetchOracleRatesMap() // map[symbol] → [grd_per_unit, units_per_grd]
	newRates := make(map[string]float64, len(src))
	for sym, pair := range src {
		newRates[strings.ToUpper(sym)] = pair[0]
	}

	oracleRates.mu.Lock()
	old := oracleRates.rates
	oracleRates.rates = newRates
	oracleRates.mu.Unlock()

	diff := make(map[string]float64)
	for k, v := range newRates {
		if old[k] != v {
			diff[k] = v
		}
	}
	for k := range old {
		if _, ok := newRates[k]; !ok {
			diff[k] = 0
		}
	}
	if len(diff) == 0 {
		return
	}
	hub.Publish("oracle", OutMsg{
		Channel: "oracle",
		Type:    "update",
		Data:    map[string]interface{}{"rates": diff},
	})
}

// runOracleUpdater is the background loop powering the oracle topic.
// Idle when nobody is subscribed.
func runOracleUpdater() {
	log.Printf("[ws] oracle updater started (tick=2s)")
	refreshOracle()
	ticker := time.NewTicker(2 * time.Second)
	defer ticker.Stop()
	for range ticker.C {
		if !hub.HasTopic("oracle") {
			continue
		}
		refreshOracle()
	}
}

// ─── Candles Channel ───────────────────────────────────────────────
// candles:{assetId}:{interval} — push only the bars that changed since
// the last tick (typically: the current open bar's update + occasionally
// a brand-new bar). Built on top of the trade buffer; no extra RPCs
// when trades: is already subscribed for the same asset.

type Candle struct {
	Time   int64   `json:"time"`   // bar start (unix seconds, UTC)
	Open   float64 `json:"open"`
	High   float64 `json:"high"`
	Low    float64 `json:"low"`
	Close  float64 `json:"close"`
	Volume float64 `json:"volume"`
}

// intervalSeconds maps a TradingView-style interval label to seconds.
// Mirrors dex-next/src/components/dex/PriceChart.tsx CANDLE_INTERVALS.
func intervalSeconds(label string) int64 {
	switch label {
	case "1s":
		return 1
	case "30s":
		return 30
	case "1m":
		return 60
	case "5m":
		return 300
	case "10m":
		return 600
	case "15m":
		return 900
	case "30m":
		return 1800
	case "1h":
		return 3600
	case "2h":
		return 7200
	case "4h":
		return 14400
	case "6h":
		return 21600
	case "12h":
		return 43200
	case "24h", "1D":
		return 86400
	case "1W":
		return 604800
	case "1M":
		return 2592000
	case "1Y":
		return 31536000
	}
	return 60
}

type CandleSeries struct {
	mu       sync.RWMutex
	assetID  string
	interval string
	barSec   int64
	bars     map[int64]*Candle // bar start → candle
	order    []int64           // sorted bar starts (asc)
	cap      int
}

func newCandleSeries(assetID, interval string) *CandleSeries {
	return &CandleSeries{
		assetID:  assetID,
		interval: interval,
		barSec:   intervalSeconds(interval),
		bars:     make(map[int64]*Candle),
		cap:      1000, // keep at most 1000 bars per series
	}
}

func (s *CandleSeries) IsEmpty() bool {
	s.mu.RLock()
	defer s.mu.RUnlock()
	return len(s.bars) == 0
}

// addTick folds a single trade into the series. Returns the (possibly
// updated) bar so callers can broadcast deltas.
func (s *CandleSeries) addTick(ts int64, price, amount float64) *Candle {
	if price <= 0 {
		return nil
	}
	bucket := (ts / s.barSec) * s.barSec
	bar, ok := s.bars[bucket]
	if !ok {
		bar = &Candle{Time: bucket, Open: price, High: price, Low: price, Close: price, Volume: amount}
		s.bars[bucket] = bar
		// Insert in sort order — for typical workloads bars arrive in
		// chronological order, so this is O(1) amortized.
		if n := len(s.order); n == 0 || s.order[n-1] < bucket {
			s.order = append(s.order, bucket)
		} else {
			i := sort.Search(n, func(i int) bool { return s.order[i] >= bucket })
			s.order = append(s.order, 0)
			copy(s.order[i+1:], s.order[i:])
			s.order[i] = bucket
		}
		// Evict oldest if over capacity.
		if len(s.order) > s.cap {
			drop := len(s.order) - s.cap
			for _, b := range s.order[:drop] {
				delete(s.bars, b)
			}
			s.order = s.order[drop:]
		}
	} else {
		if price > bar.High {
			bar.High = price
		}
		if price < bar.Low {
			bar.Low = price
		}
		bar.Close = price
		bar.Volume += amount
	}
	return bar
}

// SeedFromTrades seeds the series with the on-chain trade history.
// Called the first time a candle topic gets a subscriber.
func (s *CandleSeries) SeedFromTrades() error {
	trades, err := fetchTrades(s.assetID)
	if err != nil {
		return err
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	for _, t := range trades {
		s.addTick(t.Timestamp, t.Price, t.Amount)
	}
	return nil
}

// Snapshot returns all current bars in chronological order.
func (s *CandleSeries) Snapshot() []Candle {
	s.mu.RLock()
	defer s.mu.RUnlock()
	out := make([]Candle, 0, len(s.order))
	for _, b := range s.order {
		if c, ok := s.bars[b]; ok {
			out = append(out, *c)
		}
	}
	return out
}

func (s *CandleSeries) SnapshotMsg() OutMsg {
	return OutMsg{
		Channel: "candles:" + s.assetID + ":" + s.interval,
		Type:    "snapshot",
		Data:    map[string]interface{}{"bars": s.Snapshot()},
	}
}

// applyTrades folds new trades into the series and returns the set of
// bars that changed (so we can broadcast just those).
func (s *CandleSeries) applyTrades(in []Trade) []Candle {
	if len(in) == 0 {
		return nil
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	dirty := make(map[int64]bool)
	for _, t := range in {
		bar := s.addTick(t.Timestamp, t.Price, t.Amount)
		if bar != nil {
			dirty[bar.Time] = true
		}
	}
	if len(dirty) == 0 {
		return nil
	}
	out := make([]Candle, 0, len(dirty))
	for b := range dirty {
		if c, ok := s.bars[b]; ok {
			out = append(out, *c)
		}
	}
	sort.Slice(out, func(i, j int) bool { return out[i].Time < out[j].Time })
	return out
}

type CandleIndex struct {
	mu     sync.RWMutex
	series map[string]*CandleSeries // key = "{assetId}:{interval}"
}

var candleIdx = &CandleIndex{series: make(map[string]*CandleSeries)}

func (idx *CandleIndex) Get(assetID, interval string) *CandleSeries {
	key := assetID + ":" + interval
	idx.mu.RLock()
	s, ok := idx.series[key]
	idx.mu.RUnlock()
	if ok {
		return s
	}
	idx.mu.Lock()
	defer idx.mu.Unlock()
	if s, ok = idx.series[key]; ok {
		return s
	}
	s = newCandleSeries(assetID, interval)
	idx.series[key] = s
	return s
}

// RefreshAndPublish reads the latest trades from the trade buffer
// (refreshing it first if no trades: subscriber currently does), folds
// new ticks into the series, and broadcasts the changed bars only.
func (idx *CandleIndex) RefreshAndPublish(assetID, interval string) {
	// Make sure the trade buffer is up to date. If a trades: topic is also
	// active, the syncer already refreshed it this tick — but calling again
	// is cheap (the AddNew dedupes via trade_id).
	if trades, err := fetchTrades(assetID); err == nil {
		tradeIdx.Get(assetID).AddNew(trades)
	}
	all := tradeIdx.Get(assetID).Snapshot()
	series := idx.Get(assetID, interval)

	// Determine which trades are *new* to this series. We track via the
	// timestamp of the last folded trade per series.
	series.mu.RLock()
	lastTs := int64(0)
	for _, b := range series.order {
		if c, ok := series.bars[b]; ok {
			if c.Time+series.barSec-1 > lastTs {
				lastTs = c.Time
			}
		}
	}
	series.mu.RUnlock()

	// First-fold path (empty series): apply everything.
	if lastTs == 0 {
		updated := series.applyTrades(all)
		if len(updated) == 0 {
			return
		}
		hub.Publish("candles:"+assetID+":"+interval, OutMsg{
			Channel: "candles:" + assetID + ":" + interval,
			Type:    "update",
			Data:    map[string]interface{}{"bars": updated},
		})
		return
	}

	// Incremental path: only fold trades whose timestamp falls in or
	// after the current open bar (which can still receive late-arriving
	// updates within the bar window).
	cutoff := (lastTs / series.barSec) * series.barSec
	fresh := make([]Trade, 0, len(all))
	for _, t := range all {
		if t.Timestamp >= cutoff {
			fresh = append(fresh, t)
		}
	}
	updated := series.applyTrades(fresh)
	if len(updated) == 0 {
		return
	}
	hub.Publish("candles:"+assetID+":"+interval, OutMsg{
		Channel: "candles:" + assetID + ":" + interval,
		Type:    "update",
		Data:    map[string]interface{}{"bars": updated},
	})
}
