// rate_limit_global.go — global per-IP rate limiting middleware.
//
// All endpoints share a single per-IP token budget. This backstop catches
// any endpoint that does not have its own per-operation limiter and prevents
// credential-stuffing, scanner, and DoS traffic from exhausting the API.
//
// The limit (600 req/min = 10/s sustained) is intentionally generous for
// legitimate clients. Tighten via GARUDA_GLOBAL_RATE_LIMIT (integer
// requests per minute) for production deployments that know their expected
// traffic profile.
//
// OPTIONS and HEAD requests are never counted so that CORS preflight and
// monitoring health checks do not consume the budget.
//
// The 429 response includes a Retry-After: 60 header so HTTP clients and
// reverse proxies know when to retry.

package main

import (
	"net/http"
	"os"
	"strconv"
	"time"
)

// defaultGlobalRateLimit is requests per IP per minute.
const defaultGlobalRateLimit = 600

// globalIPRateLimit is the single shared limiter. Initialised at package
// init so tests can override it before the first request.
var globalIPRateLimit *rateLimiter

func init() {
	limit := defaultGlobalRateLimit
	if s := os.Getenv("GARUDA_GLOBAL_RATE_LIMIT"); s != "" {
		if n, err := strconv.Atoi(s); err == nil && n > 0 {
			limit = n
		}
	}
	globalIPRateLimit = newRateLimiter(limit, 1*time.Minute)
}

// globalRateLimitMiddleware enforces the per-IP global request budget.
// OPTIONS and HEAD bypass the limit (preflight + monitoring probes).
// On excess: responds 429 Too Many Requests with Retry-After: 60 and
// increments the garuda_rate_limited_total metric.
func globalRateLimitMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method == http.MethodOptions || r.Method == http.MethodHead {
			next.ServeHTTP(w, r)
			return
		}
		ip := clientIP(r)
		if !globalIPRateLimit.Allow(ip) {
			IncMetric("rate_limited")
			w.Header().Set("Retry-After", "60")
			writeJSONErrStatus(w, http.StatusTooManyRequests, "global rate limit exceeded — try again in 60s", nil)
			return
		}
		next.ServeHTTP(w, r)
	})
}

// ResetGlobalRateLimitForTest resets the global limiter to a clean state.
// Called in test setup to prevent cross-test interference.
func ResetGlobalRateLimitForTest() {
	globalIPRateLimit.mu.Lock()
	globalIPRateLimit.hits = make(map[string][]time.Time)
	globalIPRateLimit.mu.Unlock()
}
