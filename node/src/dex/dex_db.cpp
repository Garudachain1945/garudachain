// Copyright (c) 2026 GarudaChain developers
#include <dex/dex_db.h>

#include <assets/asset_db.h>
#include <assets/asset_types.h>
#include <crypto/sha256.h>
#include <logging.h>
#include <serialize.h>
#include <streams.h>
#include <util/time.h>

#include <algorithm>
#include <cassert>

namespace DEX {

// DB key prefixes
static constexpr uint8_t DB_ORDER   = 'O'; // 'O' + order_id -> Order
static constexpr uint8_t DB_TRADE   = 'T'; // 'T' + trade_id -> TradeResult
static constexpr uint8_t DB_MM      = 'M'; // 'M' + asset_id -> MarketMaker
static constexpr uint8_t DB_ORACLE  = 'R'; // 'R' + symbol -> OraclePegRate
static constexpr uint8_t DB_GRD_BAL = 'G'; // 'G' + address -> int64_t (virtual GRD satoshi)

// ---------------------------------------------------------------------------
// ComputeOrderId
// ---------------------------------------------------------------------------
uint256 ComputeOrderId(const uint256& asset_id, OrderSide side,
                       int64_t price, int64_t amount,
                       const std::string& owner, int64_t timestamp)
{
    CSHA256 hasher;
    hasher.Write(asset_id.data(), 32);
    uint8_t s = static_cast<uint8_t>(side);
    hasher.Write(&s, 1);
    hasher.Write(reinterpret_cast<const unsigned char*>(&price), sizeof(price));
    hasher.Write(reinterpret_cast<const unsigned char*>(&amount), sizeof(amount));
    hasher.Write(reinterpret_cast<const unsigned char*>(owner.data()), owner.size());
    hasher.Write(reinterpret_cast<const unsigned char*>(&timestamp), sizeof(timestamp));
    uint256 result;
    hasher.Finalize(result.data());
    return result;
}

// ---------------------------------------------------------------------------
// DexDB
// ---------------------------------------------------------------------------
DexDB::DexDB(const fs::path& path, size_t cache_size)
{
    DBParams params{
        .path = path,
        .cache_bytes = cache_size,
    };
    m_db = std::make_unique<CDBWrapper>(params);
    LogPrintf("DexDB opened at %s\n", fs::PathToString(path));
}

DexDB::~DexDB() = default;

bool DexDB::WriteOrder(const Order& order)
{
    auto key = std::make_pair(DB_ORDER, order.order_id);
    return m_db->Write(key, order);
}

bool DexDB::ReadOrder(const uint256& order_id, Order& order) const
{
    auto key = std::make_pair(DB_ORDER, order_id);
    return m_db->Read(key, order);
}

bool DexDB::EraseOrder(const uint256& order_id)
{
    auto key = std::make_pair(DB_ORDER, order_id);
    CDBBatch batch(*m_db);
    batch.Erase(key);
    return m_db->WriteBatch(batch);
}

std::vector<Order> DexDB::GetOrderBook(const uint256& asset_id,
                                        size_t max_count) const
{
    std::vector<Order> result;
    auto it = m_db->NewIterator();
    auto prefix = std::make_pair(DB_ORDER, uint256::ZERO);
    it->Seek(prefix);

    while (it->Valid() && result.size() < max_count) {
        std::pair<uint8_t, uint256> key;
        if (!it->GetKey(key) || key.first != DB_ORDER)
            break;
        Order order;
        if (it->GetValue(order)) {
            if (order.asset_id == asset_id && order.status == OrderStatus::OPEN) {
                result.push_back(std::move(order));
            }
        }
        it->Next();
    }
    // Sort: SELL ascending price, BUY descending price
    std::sort(result.begin(), result.end(), [](const Order& a, const Order& b) {
        if (a.side != b.side) return a.side < b.side; // BUY sebelum SELL
        if (a.side == OrderSide::BUY)  return a.price > b.price;  // BUY: harga tertinggi dulu
        return a.price < b.price; // SELL: harga terendah dulu
    });
    return result;
}

std::vector<Order> DexDB::GetOrdersByOwner(const std::string& owner,
                                            size_t max_count) const
{
    std::vector<Order> result;
    auto it = m_db->NewIterator();
    auto prefix = std::make_pair(DB_ORDER, uint256::ZERO);
    it->Seek(prefix);

    while (it->Valid() && result.size() < max_count) {
        std::pair<uint8_t, uint256> key;
        if (!it->GetKey(key) || key.first != DB_ORDER)
            break;
        Order order;
        if (it->GetValue(order)) {
            if (order.owner == owner) {
                result.push_back(std::move(order));
            }
        }
        it->Next();
    }
    return result;
}

bool DexDB::WriteTrade(const TradeResult& trade)
{
    auto key = std::make_pair(DB_TRADE, trade.trade_id);
    return m_db->Write(key, trade);
}

std::vector<TradeResult> DexDB::GetTradeHistory(const uint256& asset_id,
                                                 size_t max_count) const
{
    std::vector<TradeResult> result;
    auto it = m_db->NewIterator();
    auto prefix = std::make_pair(DB_TRADE, uint256::ZERO);
    it->Seek(prefix);

    while (it->Valid() && result.size() < max_count) {
        std::pair<uint8_t, uint256> key;
        if (!it->GetKey(key) || key.first != DB_TRADE)
            break;
        TradeResult trade;
        if (it->GetValue(trade)) {
            if (trade.asset_id == asset_id) {
                result.push_back(std::move(trade));
            }
        }
        it->Next();
    }
    return result;
}

std::vector<TradeResult> DexDB::MatchOrders(const uint256& asset_id)
{
    // Kumpulkan semua OPEN/PARTIAL orders untuk asset ini
    std::vector<Order> buys, sells;
    {
        auto it = m_db->NewIterator();
        auto prefix = std::make_pair(DB_ORDER, uint256::ZERO);
        it->Seek(prefix);
        while (it->Valid()) {
            std::pair<uint8_t, uint256> key;
            if (!it->GetKey(key) || key.first != DB_ORDER) break;
            Order order;
            if (it->GetValue(order) && order.asset_id == asset_id &&
                (order.status == OrderStatus::OPEN || order.status == OrderStatus::PARTIAL)) {
                if (order.side == OrderSide::BUY)  buys.push_back(order);
                else                                sells.push_back(order);
            }
            it->Next();
        }
    }

    // Sort: BUY descending price, SELL ascending price
    std::sort(buys.begin(), buys.end(),
              [](const Order& a, const Order& b) { return a.price > b.price; });
    std::sort(sells.begin(), sells.end(),
              [](const Order& a, const Order& b) { return a.price < b.price; });

    std::vector<TradeResult> trades;
    Assets::AssetDB& asset_db = Assets::GetAssetDB();
    size_t bi = 0, si = 0;

    while (bi < buys.size() && si < sells.size()) {
        Order& buy  = buys[bi];
        Order& sell = sells[si];

        // Match hanya jika harga BUY >= harga SELL
        if (buy.price < sell.price) break;

        int64_t buy_remaining  = buy.amount  - buy.filled;
        int64_t sell_remaining = sell.amount - sell.filled;
        int64_t trade_amount   = std::min(buy_remaining, sell_remaining);
        int64_t trade_price    = sell.price; // harga SELL (maker price)

        if (trade_amount <= 0) {
            if (buy_remaining <= 0) { ++bi; continue; }
            if (sell_remaining <= 0) { ++si; continue; }
        }

        // Hitung total GRD yang ditukar: trade_amount * trade_price (satoshi).
        // trade_price adalah GRD satoshi per unit asset (decimals=0).
        int64_t grd_total_sat = trade_amount * trade_price;

        // --- Settlement asset: credit buyer dari escrow SELL ---
        int64_t buyer_asset_bal = 0;
        asset_db.ReadBalance(asset_id, buy.owner, buyer_asset_bal);
        asset_db.WriteBalance(asset_id, buy.owner, buyer_asset_bal + trade_amount);
        // (seller sudah debit saat placeorder SELL, jadi tidak perlu debit lagi)

        // --- Settlement GRD: debit escrow BUY, credit seller ---
        // BUY sudah debit virtual GRD saat placeorder. Kredit ke seller virtual balance.
        int64_t seller_grd_bal = 0;
        ReadGrdBalance(sell.owner, seller_grd_bal);
        WriteGrdBalance(sell.owner, seller_grd_bal + grd_total_sat);

        // Kalau BUY masuk di harga lebih tinggi dari fill, selisih GRD di-refund ke buyer
        int64_t buyer_escrow_per_unit_diff = buy.price - trade_price;
        if (buyer_escrow_per_unit_diff > 0) {
            int64_t refund = trade_amount * buyer_escrow_per_unit_diff;
            int64_t buyer_grd_bal = 0;
            ReadGrdBalance(buy.owner, buyer_grd_bal);
            WriteGrdBalance(buy.owner, buyer_grd_bal + refund);
        }

        buy.filled  += trade_amount;
        sell.filled += trade_amount;

        if (buy.filled >= buy.amount)  buy.status = OrderStatus::FILLED;
        else                            buy.status = OrderStatus::PARTIAL;
        if (sell.filled >= sell.amount) sell.status = OrderStatus::FILLED;
        else                            sell.status = OrderStatus::PARTIAL;

        // Simpan order updates
        WriteOrder(buy);
        WriteOrder(sell);

        // Buat trade record
        int64_t now = TicksSinceEpoch<std::chrono::seconds>(SystemClock::now());
        CSHA256 hasher;
        hasher.Write(buy.order_id.data(), 32);
        hasher.Write(sell.order_id.data(), 32);
        hasher.Write(reinterpret_cast<const unsigned char*>(&now), sizeof(now));
        uint256 trade_id;
        hasher.Finalize(trade_id.data());

        TradeResult tr;
        tr.trade_id = trade_id;
        tr.buy_order_id = buy.order_id;
        tr.sell_order_id = sell.order_id;
        tr.asset_id = asset_id;
        tr.amount = trade_amount;
        tr.price = trade_price;
        tr.timestamp = now;
        WriteTrade(tr);
        trades.push_back(tr);

        LogPrintf("DEX MATCH: %s units of %s @ %d sat (buyer=%s seller=%s)\n",
                  std::to_string(trade_amount).c_str(),
                  asset_id.GetHex().substr(0, 8).c_str(),
                  (long long)trade_price,
                  buy.owner.c_str(), sell.owner.c_str());

        if (buy.filled >= buy.amount)  ++bi;
        if (sell.filled >= sell.amount) ++si;
    }

    return trades;
}

// --- Virtual GRD Balance ledger ---
bool DexDB::ReadGrdBalance(const std::string& address, int64_t& balance) const
{
    balance = 0;
    auto key = std::make_pair(DB_GRD_BAL, address);
    return m_db->Read(key, balance);
}

bool DexDB::WriteGrdBalance(const std::string& address, int64_t balance)
{
    auto key = std::make_pair(DB_GRD_BAL, address);
    return m_db->Write(key, balance);
}

std::vector<std::pair<std::string, int64_t>> DexDB::ListGrdBalances(size_t max_count) const
{
    std::vector<std::pair<std::string, int64_t>> result;
    auto it = m_db->NewIterator();
    auto prefix = std::make_pair(DB_GRD_BAL, std::string{});
    it->Seek(prefix);
    while (it->Valid() && result.size() < max_count) {
        std::pair<uint8_t, std::string> key;
        if (!it->GetKey(key) || key.first != DB_GRD_BAL) break;
        int64_t balance = 0;
        if (it->GetValue(balance)) {
            result.emplace_back(key.second, balance);
        }
        it->Next();
    }
    return result;
}

// --- Market Maker ---

bool DexDB::WriteMarketMaker(const MarketMaker& mm)
{
    auto key = std::make_pair(DB_MM, mm.asset_id);
    return m_db->Write(key, mm);
}

bool DexDB::ReadMarketMaker(const uint256& asset_id, MarketMaker& mm) const
{
    auto key = std::make_pair(DB_MM, asset_id);
    return m_db->Read(key, mm);
}

bool DexDB::EraseMarketMaker(const uint256& asset_id)
{
    auto key = std::make_pair(DB_MM, asset_id);
    CDBBatch batch(*m_db);
    batch.Erase(key);
    return m_db->WriteBatch(batch);
}

std::vector<MarketMaker> DexDB::ListMarketMakers(size_t max_count) const
{
    std::vector<MarketMaker> result;
    auto it = m_db->NewIterator();
    auto prefix = std::make_pair(DB_MM, uint256::ZERO);
    it->Seek(prefix);
    while (it->Valid() && result.size() < max_count) {
        std::pair<uint8_t, uint256> key;
        if (!it->GetKey(key) || key.first != DB_MM) break;
        MarketMaker mm;
        if (it->GetValue(mm)) {
            result.push_back(std::move(mm));
        }
        it->Next();
    }
    return result;
}

// ---------------------------------------------------------------------------
// Oracle Peg Rate
// ---------------------------------------------------------------------------
bool DexDB::WriteOraclePegRate(const OraclePegRate& rate)
{
    auto key = std::make_pair(DB_ORACLE, rate.symbol);
    return m_db->Write(key, rate);
}

bool DexDB::ReadOraclePegRate(const std::string& symbol, OraclePegRate& rate) const
{
    auto key = std::make_pair(DB_ORACLE, symbol);
    return m_db->Read(key, rate);
}

bool DexDB::EraseOraclePegRate(const std::string& symbol)
{
    auto key = std::make_pair(DB_ORACLE, symbol);
    return m_db->Erase(key);
}

std::vector<OraclePegRate> DexDB::ListOraclePegRates(size_t max_count) const
{
    std::vector<OraclePegRate> result;
    auto it = m_db->NewIterator();
    auto prefix = std::make_pair(DB_ORACLE, std::string(""));
    it->Seek(prefix);
    while (it->Valid() && result.size() < max_count) {
        std::pair<uint8_t, std::string> key;
        if (!it->GetKey(key) || key.first != DB_ORACLE) break;
        OraclePegRate rate;
        if (it->GetValue(rate)) {
            result.push_back(std::move(rate));
        }
        it->Next();
    }
    return result;
}

// ---------------------------------------------------------------------------
// Global instance
// ---------------------------------------------------------------------------
static std::unique_ptr<DexDB> g_dex_db;

DexDB& GetDexDB()
{
    assert(g_dex_db);
    return *g_dex_db;
}

void InitDexDB(const fs::path& datadir)
{
    g_dex_db = std::make_unique<DexDB>(datadir / "dex");
}

void ShutdownDexDB()
{
    g_dex_db.reset();
}

// ---- State Root: SHA256 hash of all DEX state for on-chain commitment ----
uint256 ComputeDexStateRoot()
{
    DexDB& db = GetDexDB();
    CSHA256 hasher;

    // Hash all oracle peg rates (sorted by symbol for determinism)
    auto rates = db.ListOraclePegRates(500);
    std::sort(rates.begin(), rates.end(),
              [](const OraclePegRate& a, const OraclePegRate& b) {
                  return a.symbol < b.symbol;
              });
    for (const auto& r : rates) {
        hasher.Write((const unsigned char*)r.symbol.data(), r.symbol.size());
        uint8_t buf[8];
        for (int i = 0; i < 8; i++) buf[i] = (uint8_t)(r.grd_per_unit >> (i * 8));
        hasher.Write(buf, 8);
        for (int i = 0; i < 8; i++) buf[i] = (uint8_t)(r.timestamp >> (i * 8));
        hasher.Write(buf, 8);
    }

    // Hash all market makers
    auto mms = db.ListMarketMakers(500);
    for (const auto& mm : mms) {
        hasher.Write(mm.asset_id.data(), 32);
        uint8_t buf[8];
        for (int i = 0; i < 8; i++) buf[i] = (uint8_t)(mm.base_price >> (i * 8));
        hasher.Write(buf, 8);
    }

    uint256 result;
    hasher.Finalize(result.begin());
    return result;
}

} // namespace DEX
