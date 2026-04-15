package main

import (
	"testing"
)

func TestL2BookDiff(t *testing.T) {
	b := newL2Book()

	// Initial state — empty book → first state should produce add events
	c1 := b.ApplyFreshState(
		map[float64]float64{1.00: 100, 1.01: 200},
		map[float64]float64{0.99: 150, 0.98: 250},
	)
	if len(c1) != 4 {
		t.Fatalf("expected 4 changes (2 asks + 2 bids), got %d: %+v", len(c1), c1)
	}

	// Same state again — should produce zero changes
	c2 := b.ApplyFreshState(
		map[float64]float64{1.00: 100, 1.01: 200},
		map[float64]float64{0.99: 150, 0.98: 250},
	)
	if len(c2) != 0 {
		t.Fatalf("expected 0 changes for unchanged state, got %d: %+v", len(c2), c2)
	}

	// Mutate: change one ask size, add one bid, remove one ask
	c3 := b.ApplyFreshState(
		map[float64]float64{1.00: 100, 1.02: 50}, // 1.01 removed, 1.02 added
		map[float64]float64{0.99: 150, 0.98: 250, 0.97: 75}, // 0.97 added
	)
	// Expected diffs: ask 1.01→0 (remove), ask 1.02→50 (add), bid 0.97→75 (add)
	if len(c3) != 3 {
		t.Fatalf("expected 3 changes, got %d: %+v", len(c3), c3)
	}

	// Snapshot should be sorted: asks asc, bids desc
	asks, bids := b.Snapshot()
	if len(asks) != 2 || asks[0][0] != 1.00 || asks[1][0] != 1.02 {
		t.Fatalf("asks not sorted ascending: %+v", asks)
	}
	if len(bids) != 3 || bids[0][0] != 0.99 || bids[1][0] != 0.98 || bids[2][0] != 0.97 {
		t.Fatalf("bids not sorted descending: %+v", bids)
	}
}

func TestL2BookSizeUpdate(t *testing.T) {
	b := newL2Book()
	b.ApplyFreshState(
		map[float64]float64{1.00: 100},
		map[float64]float64{0.99: 100},
	)
	// Update size at same price level
	c := b.ApplyFreshState(
		map[float64]float64{1.00: 250},
		map[float64]float64{0.99: 50},
	)
	if len(c) != 2 {
		t.Fatalf("expected 2 changes (one ask, one bid), got %d: %+v", len(c), c)
	}
	for _, ch := range c {
		if ch.Side == "ask" && (ch.Price != 1.00 || ch.Size != 250) {
			t.Fatalf("ask change wrong: %+v", ch)
		}
		if ch.Side == "bid" && (ch.Price != 0.99 || ch.Size != 50) {
			t.Fatalf("bid change wrong: %+v", ch)
		}
	}
}

func TestHubSubscribeUnsubscribe(t *testing.T) {
	h := &Hub{
		clients: make(map[*Client]bool),
		topics:  make(map[string]map[*Client]bool),
	}
	c := &Client{send: make(chan []byte, 8), topics: make(map[string]bool)}
	h.Register(c)
	h.Subscribe(c, "orderbook:abc")
	h.Subscribe(c, "orderbook:def")

	if len(h.topics) != 2 {
		t.Fatalf("expected 2 topics, got %d", len(h.topics))
	}

	// Publish to a topic the client is subscribed to
	h.Publish("orderbook:abc", OutMsg{Type: "test"})
	select {
	case msg := <-c.send:
		if len(msg) == 0 {
			t.Fatal("empty message")
		}
	default:
		t.Fatal("expected message in client send channel")
	}

	// Unsubscribe one topic
	h.Unsubscribe(c, "orderbook:abc")
	if _, ok := h.topics["orderbook:abc"]; ok {
		t.Fatal("topic should be removed when last subscriber leaves")
	}

	// Publish to removed topic — should not error
	h.Publish("orderbook:abc", OutMsg{Type: "test2"})
	select {
	case msg := <-c.send:
		t.Fatalf("client should not receive message for unsubscribed topic: %s", msg)
	default:
	}

	// Unregister cleans up remaining topics
	h.Unregister(c)
	if len(h.topics) != 0 {
		t.Fatalf("expected 0 topics after unregister, got %d", len(h.topics))
	}
	if len(h.clients) != 0 {
		t.Fatalf("expected 0 clients after unregister, got %d", len(h.clients))
	}
}

func TestActiveOrderbookTopics(t *testing.T) {
	h := &Hub{
		clients: make(map[*Client]bool),
		topics:  make(map[string]map[*Client]bool),
	}
	c1 := &Client{send: make(chan []byte, 8), topics: make(map[string]bool)}
	c2 := &Client{send: make(chan []byte, 8), topics: make(map[string]bool)}
	h.Register(c1)
	h.Register(c2)
	h.Subscribe(c1, "orderbook:btc")
	h.Subscribe(c2, "orderbook:btc")
	h.Subscribe(c2, "orderbook:eth")
	h.Subscribe(c2, "trades:btc") // non-orderbook topic, should be filtered out

	topics := h.ActiveOrderbookTopics()
	if len(topics) != 2 {
		t.Fatalf("expected 2 active orderbook topics, got %d: %v", len(topics), topics)
	}
	seen := map[string]bool{}
	for _, t := range topics {
		seen[t] = true
	}
	if !seen["btc"] || !seen["eth"] {
		t.Fatalf("missing expected assets: %+v", seen)
	}
}
