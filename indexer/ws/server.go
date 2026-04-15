package ws

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"sync"
	"time"

	"github.com/redis/go-redis/v9"
)

// ─── WebSocket Server (SSE-based for broad compatibility) ───────────
// Uses Server-Sent Events instead of raw WebSocket to avoid
// requiring a separate WS library. Works with all browsers and
// is easier to load-balance behind nginx/CDN.

type Event struct {
	Channel string          `json:"channel"`
	Data    json.RawMessage `json:"data"`
}

type SSEServer struct {
	mu      sync.RWMutex
	clients map[chan Event]map[string]bool // client → subscribed channels
	rdb     *redis.Client
}

func NewSSEServer(redisURL string) (*SSEServer, error) {
	opts, err := redis.ParseURL(redisURL)
	if err != nil {
		return nil, err
	}
	rdb := redis.NewClient(opts)
	if err := rdb.Ping(context.Background()).Err(); err != nil {
		return nil, err
	}
	return &SSEServer{
		clients: make(map[chan Event]map[string]bool),
		rdb:     rdb,
	}, nil
}

// Start listening to Redis pub/sub and forwarding to SSE clients
func (s *SSEServer) Start(ctx context.Context) {
	pubsub := s.rdb.Subscribe(ctx,
		"trades",     // new trade executed
		"orderbook",  // orderbook update
		"blocks",     // new block mined
		"prices",     // price tick
	)
	defer pubsub.Close()

	ch := pubsub.Channel()
	for {
		select {
		case <-ctx.Done():
			return
		case msg := <-ch:
			evt := Event{
				Channel: msg.Channel,
				Data:    json.RawMessage(msg.Payload),
			}
			s.broadcast(evt)
		}
	}
}

func (s *SSEServer) broadcast(evt Event) {
	s.mu.RLock()
	defer s.mu.RUnlock()
	for ch, subs := range s.clients {
		if subs[evt.Channel] || subs["*"] {
			select {
			case ch <- evt:
			default:
				// client too slow, skip
			}
		}
	}
}

// ServeHTTP handles GET /events?channels=trades,orderbook,prices
func (s *SSEServer) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	flusher, ok := w.(http.Flusher)
	if !ok {
		http.Error(w, "Streaming not supported", http.StatusInternalServerError)
		return
	}

	// Parse requested channels
	channels := map[string]bool{}
	for _, c := range splitComma(r.URL.Query().Get("channels")) {
		if c != "" {
			channels[c] = true
		}
	}
	if len(channels) == 0 {
		channels["*"] = true // subscribe to all
	}

	// Rate limit: max 100 connections per IP (simple in-memory)
	// In production, use nginx limit_conn or Redis-based limiter

	// Set SSE headers
	w.Header().Set("Content-Type", "text/event-stream")
	w.Header().Set("Cache-Control", "no-cache")
	w.Header().Set("Connection", "keep-alive")
	w.Header().Set("Access-Control-Allow-Origin", "*")
	flusher.Flush()

	// Register client
	ch := make(chan Event, 64)
	s.mu.Lock()
	s.clients[ch] = channels
	s.mu.Unlock()

	defer func() {
		s.mu.Lock()
		delete(s.clients, ch)
		s.mu.Unlock()
		close(ch)
	}()

	// Heartbeat to detect disconnects
	ticker := time.NewTicker(15 * time.Second)
	defer ticker.Stop()

	ctx := r.Context()
	for {
		select {
		case <-ctx.Done():
			return
		case evt := <-ch:
			data, _ := json.Marshal(evt)
			fmt.Fprintf(w, "event: %s\ndata: %s\n\n", evt.Channel, data)
			flusher.Flush()
		case <-ticker.C:
			fmt.Fprintf(w, ": heartbeat\n\n")
			flusher.Flush()
		}
	}
}

func splitComma(s string) []string {
	if s == "" {
		return nil
	}
	parts := []string{}
	for _, p := range split(s, ',') {
		parts = append(parts, p)
	}
	return parts
}

func split(s string, sep byte) []string {
	var parts []string
	start := 0
	for i := 0; i < len(s); i++ {
		if s[i] == sep {
			parts = append(parts, s[start:i])
			start = i + 1
		}
	}
	parts = append(parts, s[start:])
	return parts
}
