package cache

import (
	"context"
	"encoding/json"
	"fmt"
	"time"

	"github.com/redis/go-redis/v9"
)

// Cache wraps Redis with GarudaChain-specific helpers.
type Cache struct {
	rdb *redis.Client
	ctx context.Context
}

func New(redisURL string) (*Cache, error) {
	opts, err := redis.ParseURL(redisURL)
	if err != nil {
		return nil, err
	}
	rdb := redis.NewClient(opts)
	if err := rdb.Ping(context.Background()).Err(); err != nil {
		return nil, err
	}
	return &Cache{rdb: rdb, ctx: context.Background()}, nil
}

// ─── Balance Cache ──────────────────────────────────────────────────

func (c *Cache) GetBalance(addr string) (int64, bool) {
	val, err := c.rdb.Get(c.ctx, fmt.Sprintf("bal:%s", addr)).Int64()
	if err != nil {
		return 0, false
	}
	return val, true
}

func (c *Cache) SetBalance(addr string, satoshi int64, ttl time.Duration) {
	c.rdb.Set(c.ctx, fmt.Sprintf("bal:%s", addr), satoshi, ttl)
}

func (c *Cache) InvalidateBalance(addr string) {
	c.rdb.Del(c.ctx, fmt.Sprintf("bal:%s", addr))
}

// ─── Orderbook Cache ────────────────────────────────────────────────

type OrderbookEntry struct {
	Price  float64 `json:"price"`
	Amount float64 `json:"amount"`
	Count  int     `json:"count"`
}

type Orderbook struct {
	Bids []OrderbookEntry `json:"bids"`
	Asks []OrderbookEntry `json:"asks"`
}

func (c *Cache) GetOrderbook(assetID string) (*Orderbook, bool) {
	val, err := c.rdb.Get(c.ctx, fmt.Sprintf("ob:%s", assetID)).Bytes()
	if err != nil {
		return nil, false
	}
	var ob Orderbook
	if json.Unmarshal(val, &ob) != nil {
		return nil, false
	}
	return &ob, true
}

func (c *Cache) SetOrderbook(assetID string, ob *Orderbook, ttl time.Duration) {
	data, _ := json.Marshal(ob)
	c.rdb.Set(c.ctx, fmt.Sprintf("ob:%s", assetID), data, ttl)
}

// ─── Price Cache ────────────────────────────────────────────────────

func (c *Cache) GetPrice(assetID string) (float64, bool) {
	val, err := c.rdb.Get(c.ctx, fmt.Sprintf("price:%s", assetID)).Float64()
	if err != nil {
		return 0, false
	}
	return val, true
}

func (c *Cache) SetPrice(assetID string, price float64, ttl time.Duration) {
	c.rdb.Set(c.ctx, fmt.Sprintf("price:%s", assetID), price, ttl)
}

// ─── Generic JSON Cache ─────────────────────────────────────────────

func (c *Cache) GetJSON(key string, dest interface{}) bool {
	val, err := c.rdb.Get(c.ctx, key).Bytes()
	if err != nil {
		return false
	}
	return json.Unmarshal(val, dest) == nil
}

func (c *Cache) SetJSON(key string, val interface{}, ttl time.Duration) {
	data, _ := json.Marshal(val)
	c.rdb.Set(c.ctx, key, data, ttl)
}

// ─── Chain Info ─────────────────────────────────────────────────────

func (c *Cache) GetChainHeight() (int64, bool) {
	val, err := c.rdb.Get(c.ctx, "chain:height").Int64()
	if err != nil {
		return 0, false
	}
	return val, true
}

// ─── Pub/Sub for real-time events ───────────────────────────────────

func (c *Cache) Publish(channel string, msg interface{}) {
	data, _ := json.Marshal(msg)
	c.rdb.Publish(c.ctx, channel, data)
}

func (c *Cache) Subscribe(channels ...string) *redis.PubSub {
	return c.rdb.Subscribe(c.ctx, channels...)
}
