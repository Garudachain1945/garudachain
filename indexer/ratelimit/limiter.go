package ratelimit

import (
	"net"
	"net/http"
	"sync"
	"time"
)

// TokenBucket rate limiter per IP address.
type Limiter struct {
	mu      sync.Mutex
	buckets map[string]*bucket
	rate    int           // tokens per interval
	burst   int           // max burst
	window  time.Duration // refill interval
}

type bucket struct {
	tokens    int
	lastRefill time.Time
}

func New(rate, burst int, window time.Duration) *Limiter {
	l := &Limiter{
		buckets: make(map[string]*bucket),
		rate:    rate,
		burst:   burst,
		window:  window,
	}
	// Cleanup stale entries every 5 minutes
	go func() {
		for {
			time.Sleep(5 * time.Minute)
			l.cleanup()
		}
	}()
	return l
}

func (l *Limiter) Allow(ip string) bool {
	l.mu.Lock()
	defer l.mu.Unlock()

	b, ok := l.buckets[ip]
	if !ok {
		b = &bucket{tokens: l.burst, lastRefill: time.Now()}
		l.buckets[ip] = b
	}

	// Refill tokens
	elapsed := time.Since(b.lastRefill)
	refill := int(elapsed / l.window) * l.rate
	if refill > 0 {
		b.tokens += refill
		if b.tokens > l.burst {
			b.tokens = l.burst
		}
		b.lastRefill = time.Now()
	}

	if b.tokens <= 0 {
		return false
	}
	b.tokens--
	return true
}

func (l *Limiter) cleanup() {
	l.mu.Lock()
	defer l.mu.Unlock()
	cutoff := time.Now().Add(-10 * time.Minute)
	for k, b := range l.buckets {
		if b.lastRefill.Before(cutoff) {
			delete(l.buckets, k)
		}
	}
}

// Middleware wraps an http.Handler with rate limiting.
func (l *Limiter) Middleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		ip := extractIP(r)
		if !l.Allow(ip) {
			w.Header().Set("Retry-After", "1")
			http.Error(w, `{"error":"rate_limit_exceeded","message":"Too many requests"}`, http.StatusTooManyRequests)
			return
		}
		next.ServeHTTP(w, r)
	})
}

func extractIP(r *http.Request) string {
	// Check X-Forwarded-For (behind load balancer)
	if xff := r.Header.Get("X-Forwarded-For"); xff != "" {
		// Take the first IP (client IP)
		for i := 0; i < len(xff); i++ {
			if xff[i] == ',' {
				return xff[:i]
			}
		}
		return xff
	}
	// Check X-Real-IP
	if xri := r.Header.Get("X-Real-IP"); xri != "" {
		return xri
	}
	// Fallback to remote address
	host, _, err := net.SplitHostPort(r.RemoteAddr)
	if err != nil {
		return r.RemoteAddr
	}
	return host
}
