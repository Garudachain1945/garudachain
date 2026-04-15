// Copyright (c) 2026 GarudaChain developers
// DEX orderbook — LevelDB backed
#pragma once

#include <dex/dex_types.h>
#include <dbwrapper.h>
#include <uint256.h>
#include <util/fs.h>

#include <memory>
#include <string>
#include <vector>

namespace DEX {

class DexDB {
public:
    explicit DexDB(const fs::path& path, size_t cache_size = (1 << 20));
    ~DexDB();

    // Order CRUD
    bool WriteOrder(const Order& order);
    bool ReadOrder(const uint256& order_id, Order& order) const;
    bool EraseOrder(const uint256& order_id);

    // Get orderbook untuk asset tertentu (hanya OPEN orders)
    std::vector<Order> GetOrderBook(const uint256& asset_id, size_t max_count = 100) const;

    // Get orders milik address tertentu
    std::vector<Order> GetOrdersByOwner(const std::string& owner, size_t max_count = 100) const;

    // Trade history
    bool WriteTrade(const TradeResult& trade);
    std::vector<TradeResult> GetTradeHistory(const uint256& asset_id, size_t max_count = 50) const;

    // Simple matching: cari order SELL terbaik (harga terendah) untuk BUY, dan sebaliknya.
    // Mentransfer asset dari escrow SELL ke buyer, dan virtual GRD dari escrow BUY ke seller.
    std::vector<TradeResult> MatchOrders(const uint256& asset_id);

    // Virtual GRD ledger untuk escrow BUY orders dan settlement
    bool ReadGrdBalance(const std::string& address, int64_t& balance) const;
    bool WriteGrdBalance(const std::string& address, int64_t balance);
    std::vector<std::pair<std::string, int64_t>> ListGrdBalances(size_t max_count = 500) const;

    // Market Maker CRUD
    bool WriteMarketMaker(const MarketMaker& mm);
    bool ReadMarketMaker(const uint256& asset_id, MarketMaker& mm) const;
    bool EraseMarketMaker(const uint256& asset_id);
    std::vector<MarketMaker> ListMarketMakers(size_t max_count = 200) const;

    // Oracle Peg Rate CRUD
    bool WriteOraclePegRate(const OraclePegRate& rate);
    bool ReadOraclePegRate(const std::string& symbol, OraclePegRate& rate) const;
    bool EraseOraclePegRate(const std::string& symbol);
    std::vector<OraclePegRate> ListOraclePegRates(size_t max_count = 200) const;

private:
    std::unique_ptr<CDBWrapper> m_db;
};

// Global instance
DexDB& GetDexDB();
void InitDexDB(const fs::path& datadir);
void ShutdownDexDB();

// ---- State root for on-chain commitment ----
// Computes SHA256 hash of all oracle peg rates + market maker state.
// This is embedded in block coinbase for auditability.
uint256 ComputeDexStateRoot();

} // namespace DEX
