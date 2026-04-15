// Copyright (c) 2026 GarudaChain developers
// DEX orderbook — data structures
#pragma once

#include <serialize.h>
#include <uint256.h>

#include <cstdint>
#include <string>

namespace DEX {

enum class OrderSide : uint8_t { BUY = 0, SELL = 1 };
enum class OrderStatus : uint8_t { OPEN = 0, FILLED = 1, CANCELLED = 2, PARTIAL = 3 };

struct Order {
    uint256 order_id;         // SHA256(asset_id + side + price + amount + owner + timestamp)
    uint256 asset_id;         // asset yang diperdagangkan
    OrderSide side;           // BUY atau SELL
    int64_t amount;           // jumlah asset (satoshi)
    int64_t filled;           // jumlah sudah terpenuhi
    int64_t price;            // harga per unit dalam GRD (satoshi)
    std::string owner;        // alamat pemilik order
    int64_t timestamp;        // unix timestamp
    OrderStatus status;

    template <typename Stream>
    void Serialize(Stream& s) const {
        ::Serialize(s, order_id);
        ::Serialize(s, asset_id);
        uint8_t s_val = static_cast<uint8_t>(side);
        ::Serialize(s, s_val);
        ::Serialize(s, amount);
        ::Serialize(s, filled);
        ::Serialize(s, price);
        ::Serialize(s, owner);
        ::Serialize(s, timestamp);
        uint8_t st_val = static_cast<uint8_t>(status);
        ::Serialize(s, st_val);
    }
    template <typename Stream>
    void Unserialize(Stream& s) {
        ::Unserialize(s, order_id);
        ::Unserialize(s, asset_id);
        uint8_t s_val;
        ::Unserialize(s, s_val);
        side = static_cast<OrderSide>(s_val);
        ::Unserialize(s, amount);
        ::Unserialize(s, filled);
        ::Unserialize(s, price);
        ::Unserialize(s, owner);
        ::Unserialize(s, timestamp);
        uint8_t st_val;
        ::Unserialize(s, st_val);
        status = static_cast<OrderStatus>(st_val);
    }
};

// Trade result dari matching
struct TradeResult {
    uint256 trade_id;
    uint256 buy_order_id;
    uint256 sell_order_id;
    uint256 asset_id;
    int64_t amount;
    int64_t price;
    int64_t timestamp;

    SERIALIZE_METHODS(TradeResult, obj) {
        READWRITE(obj.trade_id, obj.buy_order_id, obj.sell_order_id,
                  obj.asset_id, obj.amount, obj.price, obj.timestamp);
    }
};

// ---------------------------------------------------------------------------
// Market Maker config per asset pair
// ---------------------------------------------------------------------------
struct MarketMaker {
    uint256 asset_id;           // stablecoin yang di-market-make
    std::string mm_address;     // wallet address market maker (terima profit)
    int64_t spread_bps;         // spread dalam basis points (e.g., 50 = 0.5%)
    int64_t order_size;         // ukuran order per level (stablecoin units)
    int32_t num_levels;         // jumlah level bid/ask (e.g., 5)
    int64_t base_price;         // harga dasar 1 GRD = X stablecoin (satoshi)
    bool active;                // aktif atau tidak
    int64_t total_profit_grd;   // total profit GRD (satoshi)
    int64_t total_profit_stable;// total profit stablecoin
    int64_t timestamp;

    SERIALIZE_METHODS(MarketMaker, obj) {
        READWRITE(obj.asset_id, obj.mm_address, obj.spread_bps,
                  obj.order_size, obj.num_levels, obj.base_price,
                  obj.active, obj.total_profit_grd, obj.total_profit_stable,
                  obj.timestamp);
    }
};

// ---------------------------------------------------------------------------
// Oracle Peg Rate — harga dunia nyata untuk stablecoin pegged
// ---------------------------------------------------------------------------
struct OraclePegRate {
    std::string symbol;          // "IDR", "USD", "JPY", etc.
    int64_t rate_per_grd;        // berapa unit stablecoin per 1 GRD (satoshi precision)
                                 // e.g. IDR: 16000 * 1e8 = 1.6T sat = 16000 IDR/GRD
    int64_t grd_per_unit;        // berapa GRD (satoshi) per 1 unit stablecoin
                                 // e.g. IDR: 6250 sat = 0.0000625 GRD
    int64_t timestamp;           // kapan terakhir diupdate
    std::string source;          // sumber data ("CBDC_AUTHORITY", "ORACLE_FEED", etc.)

    SERIALIZE_METHODS(OraclePegRate, obj) {
        READWRITE(obj.symbol, obj.rate_per_grd, obj.grd_per_unit,
                  obj.timestamp, obj.source);
    }
};

// ---------------------------------------------------------------------------
// Oracle Consensus — multi-source rate with median aggregation
// ---------------------------------------------------------------------------
struct OracleSourceRate {
    std::string source_name;     // "fawazahmed0", "exchangerate-host", etc.
    int64_t grd_per_unit;        // rate from this source
    int64_t timestamp;           // when fetched
    bool valid;                  // did this source return data?
};

struct OracleConsensusResult {
    std::string symbol;
    int64_t median_grd_per_unit; // median of all valid source rates
    int sources_total;           // how many sources queried
    int sources_valid;           // how many returned valid data
    int64_t max_deviation_ppm;   // max deviation from median (PPM)
    bool consensus_ok;           // true if enough sources agree (>=2 valid, deviation < threshold)
};

// Compute order_id
uint256 ComputeOrderId(const uint256& asset_id, OrderSide side,
                       int64_t price, int64_t amount,
                       const std::string& owner, int64_t timestamp);

} // namespace DEX
