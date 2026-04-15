-- GarudaChain Indexer — PostgreSQL Schema
-- Designed for 100M+ users, high-throughput DEX

BEGIN;

-- ─── Blocks ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS blocks (
    height      BIGINT PRIMARY KEY,
    hash        TEXT NOT NULL UNIQUE,
    prev_hash   TEXT NOT NULL,
    timestamp   TIMESTAMPTZ NOT NULL,
    tx_count    INT NOT NULL DEFAULT 0,
    size_bytes  INT NOT NULL DEFAULT 0,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_blocks_hash ON blocks (hash);
CREATE INDEX idx_blocks_timestamp ON blocks (timestamp DESC);

-- ─── Transactions ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS transactions (
    txid        TEXT PRIMARY KEY,
    block_height BIGINT REFERENCES blocks(height),
    block_hash  TEXT,
    raw_hex     TEXT,
    fee_sat     BIGINT NOT NULL DEFAULT 0,
    size_bytes  INT NOT NULL DEFAULT 0,
    timestamp   TIMESTAMPTZ,
    tx_type     TEXT NOT NULL DEFAULT 'transfer', -- transfer, order, swap, mint, issue
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_tx_block ON transactions (block_height);
CREATE INDEX idx_tx_type ON transactions (tx_type);
CREATE INDEX idx_tx_timestamp ON transactions (timestamp DESC);

-- ─── Addresses ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS addresses (
    address     TEXT PRIMARY KEY,
    label       TEXT,
    balance_sat BIGINT NOT NULL DEFAULT 0,
    tx_count    BIGINT NOT NULL DEFAULT 0,
    first_seen  TIMESTAMPTZ,
    last_seen   TIMESTAMPTZ,
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_addr_balance ON addresses (balance_sat DESC);

-- ─── UTXOs (unspent) ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS utxos (
    txid        TEXT NOT NULL,
    vout        INT NOT NULL,
    address     TEXT NOT NULL REFERENCES addresses(address),
    value_sat   BIGINT NOT NULL,
    script_hex  TEXT,
    block_height BIGINT,
    spent       BOOLEAN NOT NULL DEFAULT FALSE,
    spent_txid  TEXT,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (txid, vout)
);

CREATE INDEX idx_utxo_address ON utxos (address) WHERE NOT spent;
CREATE INDEX idx_utxo_unspent ON utxos (spent, address);

-- ─── Assets (tokens, stablecoins, stocks) ───────────────────────────
CREATE TABLE IF NOT EXISTS assets (
    asset_id    TEXT PRIMARY KEY,
    symbol      TEXT NOT NULL,
    name        TEXT NOT NULL,
    tipe        TEXT NOT NULL, -- NATIVE, STABLECOIN, STABLECOIN_PEGGED, SAHAM
    total_supply NUMERIC NOT NULL DEFAULT 0,
    decimals    INT NOT NULL DEFAULT 8,
    issuer      TEXT,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX idx_asset_symbol ON assets (symbol);

-- ─── Asset Balances (per address) ───────────────────────────────────
CREATE TABLE IF NOT EXISTS asset_balances (
    address     TEXT NOT NULL REFERENCES addresses(address),
    asset_id    TEXT NOT NULL REFERENCES assets(asset_id),
    balance     NUMERIC NOT NULL DEFAULT 0,
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (address, asset_id)
);

CREATE INDEX idx_assetbal_asset ON asset_balances (asset_id);

-- ─── DEX Orders ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS dex_orders (
    order_id    TEXT PRIMARY KEY,
    txid        TEXT REFERENCES transactions(txid),
    address     TEXT NOT NULL,
    asset_id    TEXT NOT NULL REFERENCES assets(asset_id),
    side        TEXT NOT NULL CHECK (side IN ('buy', 'sell')),
    order_type  TEXT NOT NULL DEFAULT 'limit', -- limit, market
    price       NUMERIC NOT NULL,
    amount      NUMERIC NOT NULL,
    filled      NUMERIC NOT NULL DEFAULT 0,
    status      TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'partial', 'filled', 'cancelled')),
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_order_asset_side ON dex_orders (asset_id, side, status);
CREATE INDEX idx_order_address ON dex_orders (address, status);
CREATE INDEX idx_order_created ON dex_orders (created_at DESC);

-- ─── DEX Trades (matched orders) ───────────────────────────────────
CREATE TABLE IF NOT EXISTS dex_trades (
    trade_id    BIGSERIAL PRIMARY KEY,
    txid        TEXT REFERENCES transactions(txid),
    asset_id    TEXT NOT NULL REFERENCES assets(asset_id),
    buy_order   TEXT REFERENCES dex_orders(order_id),
    sell_order  TEXT REFERENCES dex_orders(order_id),
    buyer       TEXT NOT NULL,
    seller      TEXT NOT NULL,
    price       NUMERIC NOT NULL,
    amount      NUMERIC NOT NULL,
    total_grd   NUMERIC NOT NULL,
    traded_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_trade_asset ON dex_trades (asset_id, traded_at DESC);
CREATE INDEX idx_trade_buyer ON dex_trades (buyer, traded_at DESC);
CREATE INDEX idx_trade_seller ON dex_trades (seller, traded_at DESC);

-- ─── OHLCV Candles (aggregated for charts) ──────────────────────────
CREATE TABLE IF NOT EXISTS candles (
    asset_id    TEXT NOT NULL REFERENCES assets(asset_id),
    interval    TEXT NOT NULL, -- 1m, 5m, 15m, 1h, 4h, 1d
    open_time   TIMESTAMPTZ NOT NULL,
    open        NUMERIC NOT NULL,
    high        NUMERIC NOT NULL,
    low         NUMERIC NOT NULL,
    close       NUMERIC NOT NULL,
    volume      NUMERIC NOT NULL DEFAULT 0,
    trade_count INT NOT NULL DEFAULT 0,
    PRIMARY KEY (asset_id, interval, open_time)
);

CREATE INDEX idx_candle_time ON candles (asset_id, interval, open_time DESC);

-- ─── Trading Accounts (L1→Trading mapping) ─────────────────────────
CREATE TABLE IF NOT EXISTS trading_accounts (
    trading_address TEXT PRIMARY KEY,
    l1_address      TEXT NOT NULL,
    label           TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_trading_l1 ON trading_accounts (l1_address);

-- ─── Deposits / Withdrawals ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS transfers (
    id          BIGSERIAL PRIMARY KEY,
    txid        TEXT,
    from_addr   TEXT NOT NULL,
    to_addr     TEXT NOT NULL,
    amount_sat  BIGINT NOT NULL,
    kind        TEXT NOT NULL CHECK (kind IN ('deposit', 'withdraw', 'transfer')),
    status      TEXT NOT NULL DEFAULT 'confirmed',
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_transfer_from ON transfers (from_addr, created_at DESC);
CREATE INDEX idx_transfer_to ON transfers (to_addr, created_at DESC);

-- ─── e-IPO Presales ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS presales (
    presale_id  TEXT PRIMARY KEY,
    asset_id    TEXT NOT NULL REFERENCES assets(asset_id),
    symbol      TEXT NOT NULL,
    name        TEXT NOT NULL,
    price_grd   NUMERIC NOT NULL,
    total_supply NUMERIC NOT NULL,
    sold        NUMERIC NOT NULL DEFAULT 0,
    status      TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'closed', 'listed')),
    start_date  TIMESTAMPTZ,
    end_date    TIMESTAMPTZ,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─── Indexer State (bookkeeping) ────────────────────────────────────
CREATE TABLE IF NOT EXISTS indexer_state (
    key         TEXT PRIMARY KEY,
    value       TEXT NOT NULL,
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO indexer_state (key, value) VALUES ('last_indexed_height', '0')
ON CONFLICT (key) DO NOTHING;

COMMIT;
