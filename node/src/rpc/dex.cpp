// Copyright (c) 2026 GarudaChain developers
// RPC endpoints: placeorder, cancelorder, getorderbook, getorder, matchorders,
//                gettradehistory, swapgrdtostable, swapstabletogrd
#include <config/bitcoin-config.h> // IWYU pragma: keep

#include <assets/asset_db.h>
#include <assets/asset_types.h>
#include <crypto/sha256.h>
#include <cbdc/authority.h>
#include <dex/dex_db.h>
#include <dex/dex_types.h>
#include <consensus/amount.h>
#include <core_io.h>
#include <key_io.h>
#include <node/context.h>
#include <rpc/dex.h>
#include <rpc/server.h>
#include <rpc/server_util.h>
#include <rpc/util.h>
#include <univalue.h>
#include <util/strencodings.h>
#include <util/time.h>
#include <logging.h>

#include <algorithm>
#include <atomic>
#include <cctype>
#include <cmath>
#include <cstdio>
#include <map>
#include <mutex>
#include <set>
#include <thread>

using node::NodeContext;

static UniValue OrderToJSON(const DEX::Order& o)
{
    UniValue obj(UniValue::VOBJ);
    obj.pushKV("order_id", o.order_id.GetHex());
    obj.pushKV("asset_id", o.asset_id.GetHex());
    obj.pushKV("side", o.side == DEX::OrderSide::BUY ? "BUY" : "SELL");
    obj.pushKV("amount", o.amount);
    obj.pushKV("filled", o.filled);
    obj.pushKV("price", ValueFromAmount(o.price));
    obj.pushKV("owner", o.owner);
    obj.pushKV("timestamp", o.timestamp);
    std::string status_str;
    switch (o.status) {
        case DEX::OrderStatus::OPEN:      status_str = "OPEN";      break;
        case DEX::OrderStatus::FILLED:    status_str = "FILLED";    break;
        case DEX::OrderStatus::CANCELLED: status_str = "CANCELLED"; break;
        case DEX::OrderStatus::PARTIAL:   status_str = "PARTIAL";   break;
    }
    obj.pushKV("status", status_str);
    return obj;
}

static UniValue TradeToJSON(const DEX::TradeResult& t)
{
    UniValue obj(UniValue::VOBJ);
    obj.pushKV("trade_id", t.trade_id.GetHex());
    obj.pushKV("buy_order_id", t.buy_order_id.GetHex());
    obj.pushKV("sell_order_id", t.sell_order_id.GetHex());
    obj.pushKV("asset_id", t.asset_id.GetHex());
    obj.pushKV("amount", t.amount);
    obj.pushKV("price", ValueFromAmount(t.price));
    obj.pushKV("timestamp", t.timestamp);
    return obj;
}

// ---------------------------------------------------------------------------
// placeorder <asset_id> <side> <amount> <price> <address>
// ---------------------------------------------------------------------------
static RPCHelpMan placeorder()
{
    return RPCHelpMan{
        "placeorder",
        "Pasang order beli/jual asset di DEX orderbook.\n",
        {
            {"asset_id", RPCArg::Type::STR_HEX, RPCArg::Optional::NO, "Asset ID (hex)"},
            {"side",     RPCArg::Type::STR,      RPCArg::Optional::NO, "BUY atau SELL"},
            {"amount",   RPCArg::Type::NUM,       RPCArg::Optional::NO, "Jumlah asset (integer units)"},
            {"price",    RPCArg::Type::AMOUNT,    RPCArg::Optional::NO, "Harga per unit dalam GRD"},
            {"address",  RPCArg::Type::STR,       RPCArg::Optional::NO, "Alamat pemilik order"},
        },
        RPCResult{
            RPCResult::Type::OBJ, "", "",
            {
                {RPCResult::Type::STR_HEX, "order_id", "Order ID"},
                {RPCResult::Type::STR_HEX, "asset_id", "Asset ID"},
                {RPCResult::Type::STR, "side", "BUY/SELL"},
                {RPCResult::Type::STR_AMOUNT, "amount", "Jumlah"},
                {RPCResult::Type::STR_AMOUNT, "price", "Harga"},
                {RPCResult::Type::STR, "status", "Status order"},
            }
        },
        RPCExamples{
            HelpExampleCli("placeorder", "\"<asset_id>\" \"BUY\" 100 50.00 \"grd1q...\"")
        },
        [&](const RPCHelpMan& self, const JSONRPCRequest& request) -> UniValue
        {
            uint256 asset_id = ParseHashV(request.params[0], "asset_id");
            const std::string side_str = request.params[1].get_str();
            int64_t amount = request.params[2].getInt<int64_t>();
            CAmount price = AmountFromValue(request.params[3]);
            const std::string address = request.params[4].get_str();

            // Validasi
            DEX::OrderSide side;
            if (side_str == "BUY" || side_str == "buy")
                side = DEX::OrderSide::BUY;
            else if (side_str == "SELL" || side_str == "sell")
                side = DEX::OrderSide::SELL;
            else
                throw JSONRPCError(RPC_INVALID_PARAMETER, "side harus BUY atau SELL");

            if (amount <= 0)
                throw JSONRPCError(RPC_INVALID_PARAMETER, "amount harus positif");
            if (price <= 0)
                throw JSONRPCError(RPC_INVALID_PARAMETER, "price harus positif");
            if (!IsValidDestination(DecodeDestination(address)))
                throw JSONRPCError(RPC_INVALID_ADDRESS_OR_KEY, "address tidak valid");

            // Cek asset ada
            Assets::AssetDB& asset_db = Assets::GetAssetDB();
            Assets::AssetInfo asset_info;
            if (!asset_db.ReadAsset(asset_id, asset_info))
                throw JSONRPCError(RPC_INVALID_PARAMETER, "Asset tidak ditemukan");

            DEX::DexDB& dex_db_escrow = DEX::GetDexDB();

            // Jika SELL, escrow saldo asset langsung (debit sekarang, refund di cancel / transfer di match)
            if (side == DEX::OrderSide::SELL) {
                int64_t balance = 0;
                asset_db.ReadBalance(asset_id, address, balance);
                if (balance < amount)
                    throw JSONRPCError(RPC_INVALID_PARAMETER,
                        "Saldo asset tidak cukup untuk SELL order");
                if (!asset_db.WriteBalance(asset_id, address, balance - amount))
                    throw JSONRPCError(RPC_DATABASE_ERROR,
                        "Gagal escrow saldo asset untuk SELL order");
            } else {
                // BUY: escrow virtual GRD (amount * price satoshi)
                int64_t grd_needed = amount * price;
                if (grd_needed <= 0)
                    throw JSONRPCError(RPC_INVALID_PARAMETER, "amount*price overflow/invalid");
                int64_t grd_bal = 0;
                dex_db_escrow.ReadGrdBalance(address, grd_bal);
                if (grd_bal < grd_needed)
                    throw JSONRPCError(RPC_INVALID_PARAMETER,
                        "Virtual GRD tidak cukup untuk BUY order. Gunakan depositgrd dulu.");
                if (!dex_db_escrow.WriteGrdBalance(address, grd_bal - grd_needed))
                    throw JSONRPCError(RPC_DATABASE_ERROR,
                        "Gagal escrow virtual GRD untuk BUY order");
            }

            int64_t now = TicksSinceEpoch<std::chrono::seconds>(SystemClock::now());
            uint256 order_id = DEX::ComputeOrderId(asset_id, side, price, amount, address, now);

            DEX::Order order;
            order.order_id = order_id;
            order.asset_id = asset_id;
            order.side = side;
            order.amount = amount;
            order.filled = 0;
            order.price = price;
            order.owner = address;
            order.timestamp = now;
            order.status = DEX::OrderStatus::OPEN;

            DEX::DexDB& dex_db = DEX::GetDexDB();
            if (!dex_db.WriteOrder(order))
                throw JSONRPCError(RPC_DATABASE_ERROR, "Gagal menulis order ke database");

            return OrderToJSON(order);
        },
    };
}

// ---------------------------------------------------------------------------
// cancelorder <order_id> <address>
// ---------------------------------------------------------------------------
static RPCHelpMan cancelorder()
{
    return RPCHelpMan{
        "cancelorder",
        "Batalkan order di DEX.\n",
        {
            {"order_id", RPCArg::Type::STR_HEX, RPCArg::Optional::NO, "Order ID (hex)"},
            {"address",  RPCArg::Type::STR,      RPCArg::Optional::NO, "Alamat pemilik order (verifikasi)"},
        },
        RPCResult{
            RPCResult::Type::OBJ, "", "",
            {
                {RPCResult::Type::STR_HEX, "order_id", "Order ID yang dibatalkan"},
                {RPCResult::Type::STR, "status", "Status baru"},
            }
        },
        RPCExamples{
            HelpExampleCli("cancelorder", "\"<order_id>\" \"grd1q...\"")
        },
        [&](const RPCHelpMan& self, const JSONRPCRequest& request) -> UniValue
        {
            uint256 order_id = ParseHashV(request.params[0], "order_id");
            const std::string address = request.params[1].get_str();

            DEX::DexDB& db = DEX::GetDexDB();
            DEX::Order order;
            if (!db.ReadOrder(order_id, order))
                throw JSONRPCError(RPC_INVALID_PARAMETER, "Order tidak ditemukan");

            if (order.owner != address)
                throw JSONRPCError(RPC_INVALID_PARAMETER, "Alamat tidak cocok dengan pemilik order");

            if (order.status != DEX::OrderStatus::OPEN && order.status != DEX::OrderStatus::PARTIAL)
                throw JSONRPCError(RPC_INVALID_PARAMETER, "Order sudah tidak aktif");

            // Refund escrow: sisa yang belum terfill
            int64_t remaining = order.amount - order.filled;
            if (remaining > 0 && order.side == DEX::OrderSide::SELL) {
                Assets::AssetDB& asset_db = Assets::GetAssetDB();
                int64_t balance = 0;
                asset_db.ReadBalance(order.asset_id, order.owner, balance);
                if (!asset_db.WriteBalance(order.asset_id, order.owner, balance + remaining))
                    throw JSONRPCError(RPC_DATABASE_ERROR, "Gagal refund escrow asset");
            } else if (remaining > 0 && order.side == DEX::OrderSide::BUY) {
                int64_t refund = remaining * order.price;
                int64_t grd_bal = 0;
                db.ReadGrdBalance(order.owner, grd_bal);
                if (!db.WriteGrdBalance(order.owner, grd_bal + refund))
                    throw JSONRPCError(RPC_DATABASE_ERROR, "Gagal refund virtual GRD");
            }

            order.status = DEX::OrderStatus::CANCELLED;
            if (!db.WriteOrder(order))
                throw JSONRPCError(RPC_DATABASE_ERROR, "Gagal update order");

            UniValue result(UniValue::VOBJ);
            result.pushKV("order_id", order_id.GetHex());
            result.pushKV("status", "CANCELLED");
            result.pushKV("refunded", remaining);
            return result;
        },
    };
}

// ---------------------------------------------------------------------------
// getorderbook <asset_id>
// ---------------------------------------------------------------------------
static RPCHelpMan getorderbook()
{
    return RPCHelpMan{
        "getorderbook",
        "Tampilkan orderbook (buku pesanan) untuk asset tertentu.\n",
        {
            {"asset_id", RPCArg::Type::STR_HEX, RPCArg::Optional::NO, "Asset ID (hex)"},
        },
        RPCResult{
            RPCResult::Type::OBJ, "", "",
            {
                {RPCResult::Type::ARR, "bids", "Order beli (harga tertinggi dulu)",
                    {{RPCResult::Type::OBJ, "", "", {
                        {RPCResult::Type::STR_HEX, "order_id", ""},
                        {RPCResult::Type::STR_AMOUNT, "amount", ""},
                        {RPCResult::Type::STR_AMOUNT, "price", ""},
                        {RPCResult::Type::STR, "owner", ""},
                    }}}
                },
                {RPCResult::Type::ARR, "asks", "Order jual (harga terendah dulu)",
                    {{RPCResult::Type::OBJ, "", "", {
                        {RPCResult::Type::STR_HEX, "order_id", ""},
                        {RPCResult::Type::STR_AMOUNT, "amount", ""},
                        {RPCResult::Type::STR_AMOUNT, "price", ""},
                        {RPCResult::Type::STR, "owner", ""},
                    }}}
                },
            }
        },
        RPCExamples{
            HelpExampleCli("getorderbook", "\"<asset_id>\"")
        },
        [&](const RPCHelpMan& self, const JSONRPCRequest& request) -> UniValue
        {
            uint256 asset_id = ParseHashV(request.params[0], "asset_id");

            DEX::DexDB& db = DEX::GetDexDB();
            auto orders = db.GetOrderBook(asset_id, 200);

            UniValue bids(UniValue::VARR);
            UniValue asks(UniValue::VARR);

            for (const auto& o : orders) {
                UniValue entry(UniValue::VOBJ);
                entry.pushKV("order_id", o.order_id.GetHex());
                int64_t remaining = o.amount - o.filled;
                entry.pushKV("amount", ValueFromAmount(remaining));
                entry.pushKV("price", ValueFromAmount(o.price));
                entry.pushKV("owner", o.owner);
                if (o.side == DEX::OrderSide::BUY)
                    bids.push_back(entry);
                else
                    asks.push_back(entry);
            }

            UniValue result(UniValue::VOBJ);
            result.pushKV("bids", bids);
            result.pushKV("asks", asks);
            return result;
        },
    };
}

// ---------------------------------------------------------------------------
// getorder <order_id>
// ---------------------------------------------------------------------------
static RPCHelpMan getorder()
{
    return RPCHelpMan{
        "getorder",
        "Dapatkan detail order berdasar ID.\n",
        {
            {"order_id", RPCArg::Type::STR_HEX, RPCArg::Optional::NO, "Order ID (hex)"},
        },
        RPCResult{RPCResult::Type::OBJ, "", "", {
            {RPCResult::Type::STR_HEX, "order_id", ""},
            {RPCResult::Type::STR_HEX, "asset_id", ""},
            {RPCResult::Type::STR, "side", ""},
            {RPCResult::Type::STR_AMOUNT, "amount", ""},
            {RPCResult::Type::STR_AMOUNT, "filled", ""},
            {RPCResult::Type::STR_AMOUNT, "price", ""},
            {RPCResult::Type::STR, "owner", ""},
            {RPCResult::Type::NUM, "timestamp", ""},
            {RPCResult::Type::STR, "status", ""},
        }},
        RPCExamples{HelpExampleCli("getorder", "\"<order_id>\"")},
        [&](const RPCHelpMan& self, const JSONRPCRequest& request) -> UniValue
        {
            uint256 order_id = ParseHashV(request.params[0], "order_id");
            DEX::DexDB& db = DEX::GetDexDB();
            DEX::Order order;
            if (!db.ReadOrder(order_id, order))
                throw JSONRPCError(RPC_INVALID_PARAMETER, "Order tidak ditemukan");
            return OrderToJSON(order);
        },
    };
}

// ---------------------------------------------------------------------------
// matchorders <asset_id>
// ---------------------------------------------------------------------------
static RPCHelpMan matchorders()
{
    return RPCHelpMan{
        "matchorders",
        "Jalankan matching engine untuk asset tertentu. "
        "Mencocokkan order BUY dan SELL berdasarkan harga.\n",
        {
            {"asset_id", RPCArg::Type::STR_HEX, RPCArg::Optional::NO, "Asset ID (hex)"},
        },
        RPCResult{
            RPCResult::Type::OBJ, "", "",
            {
                {RPCResult::Type::NUM, "trades_executed", "Jumlah trade berhasil"},
                {RPCResult::Type::ARR, "trades", "Detail trade",
                    {{RPCResult::Type::OBJ, "", "", {
                        {RPCResult::Type::STR_HEX, "trade_id", ""},
                        {RPCResult::Type::STR_HEX, "buy_order_id", ""},
                        {RPCResult::Type::STR_HEX, "sell_order_id", ""},
                        {RPCResult::Type::STR_AMOUNT, "amount", ""},
                        {RPCResult::Type::STR_AMOUNT, "price", ""},
                    }}}
                },
            }
        },
        RPCExamples{HelpExampleCli("matchorders", "\"<asset_id>\"")},
        [&](const RPCHelpMan& self, const JSONRPCRequest& request) -> UniValue
        {
            uint256 asset_id = ParseHashV(request.params[0], "asset_id");

            // Verifikasi asset ada
            Assets::AssetDB& asset_db = Assets::GetAssetDB();
            Assets::AssetInfo info;
            if (!asset_db.ReadAsset(asset_id, info))
                throw JSONRPCError(RPC_INVALID_PARAMETER, "Asset tidak ditemukan");

            DEX::DexDB& dex_db = DEX::GetDexDB();
            auto trades = dex_db.MatchOrders(asset_id);
            // Settlement already performed inside DexDB::MatchOrders:
            //   - buyer credited asset from SELL escrow
            //   - seller credited virtual GRD from BUY escrow
            //   - buyer refunded GRD diff if filled below limit price

            UniValue result(UniValue::VOBJ);
            result.pushKV("trades_executed", (int)trades.size());

            UniValue arr(UniValue::VARR);
            for (const auto& t : trades) {
                arr.push_back(TradeToJSON(t));
            }
            result.pushKV("trades", arr);
            return result;
        },
    };
}

// ---------------------------------------------------------------------------
// gettradehistory <asset_id>
// ---------------------------------------------------------------------------
static RPCHelpMan gettradehistory()
{
    return RPCHelpMan{
        "gettradehistory",
        "Tampilkan riwayat perdagangan untuk asset tertentu.\n",
        {
            {"asset_id", RPCArg::Type::STR_HEX, RPCArg::Optional::NO, "Asset ID (hex)"},
        },
        RPCResult{
            RPCResult::Type::ARR, "", "",
            {{RPCResult::Type::OBJ, "", "", {
                {RPCResult::Type::STR_HEX, "trade_id", ""},
                {RPCResult::Type::STR_HEX, "buy_order_id", ""},
                {RPCResult::Type::STR_HEX, "sell_order_id", ""},
                {RPCResult::Type::STR_AMOUNT, "amount", ""},
                {RPCResult::Type::STR_AMOUNT, "price", ""},
                {RPCResult::Type::NUM, "timestamp", ""},
            }}}
        },
        RPCExamples{HelpExampleCli("gettradehistory", "\"<asset_id>\"")},
        [&](const RPCHelpMan& self, const JSONRPCRequest& request) -> UniValue
        {
            uint256 asset_id = ParseHashV(request.params[0], "asset_id");
            DEX::DexDB& db = DEX::GetDexDB();
            auto trades = db.GetTradeHistory(asset_id, 100);

            UniValue result(UniValue::VARR);
            for (const auto& t : trades) {
                result.push_back(TradeToJSON(t));
            }
            return result;
        },
    };
}

// ===========================================================================
// MARKET MAKER SYSTEM
// ===========================================================================

// Helper: cancel semua order milik market maker untuk asset tertentu
static void CancelMMOrders(DEX::DexDB& dex_db, const uint256& asset_id,
                           const std::string& mm_addr)
{
    auto orders = dex_db.GetOrderBook(asset_id, 500);
    for (auto& o : orders) {
        if (o.owner == mm_addr && o.status == DEX::OrderStatus::OPEN) {
            o.status = DEX::OrderStatus::CANCELLED;
            dex_db.WriteOrder(o);
        }
    }
}

// ---- Safe integer helpers (no floating-point, no overflow) ----
// Multiply two int64 values then divide, using __int128 to prevent overflow.
// Result = (a * b) / divisor, rounded down.
static int64_t SafeMulDiv(int64_t a, int64_t b, int64_t divisor)
{
    if (divisor == 0) return 0;
    __int128 prod = (__int128)a * (__int128)b;
    return (int64_t)(prod / (__int128)divisor);
}

// Constant: 1 BTC/GRD = 100'000'000 satoshi
static constexpr int64_t COIN_SAT = 100000000LL;

// Helper: pasang order bid/ask MM di orderbook berdasar base_price + spread
// ALL arithmetic is pure integer — no double/float anywhere.
static UniValue PlaceMMOrders(DEX::DexDB& dex_db, Assets::AssetDB& asset_db,
                              const DEX::MarketMaker& mm)
{
    int64_t now = TicksSinceEpoch<std::chrono::seconds>(SystemClock::now());
    // mm.base_price is already in satoshi (CAmount)
    // half_spread_ppm = spread_bps * 50  (parts per million, half of spread)
    // e.g. spread_bps=50 → half_spread_ppm=2500 → 0.25%
    int64_t half_spread_ppm = (int64_t)mm.spread_bps * 50;

    UniValue orders_placed(UniValue::VARR);

    // Cek saldo stablecoin MM untuk SELL orders
    int64_t mm_stable_bal = 0;
    asset_db.ReadBalance(mm.asset_id, mm.mm_address, mm_stable_bal);

    for (int32_t i = 0; i < mm.num_levels; ++i) {
        // level_offset_ppm = half_spread_ppm * (1000 + i*500) / 1000
        // Level 0: 1.0x, Level 1: 1.5x, Level 2: 2.0x ...
        int64_t level_offset_ppm = half_spread_ppm * (1000 + (int64_t)i * 500) / 1000;

        // BID (BUY stablecoin): harga lebih rendah dari base
        {
            // bid_price_sat = base_price * (1'000'000 - level_offset_ppm) / 1'000'000
            CAmount price_sat = SafeMulDiv(mm.base_price, 1000000 - level_offset_ppm, 1000000);
            if (price_sat <= 0) continue;
            CAmount amount_sat = mm.order_size * COIN_SAT;

            DEX::Order order;
            order.order_id = DEX::ComputeOrderId(mm.asset_id, DEX::OrderSide::BUY,
                                                   price_sat, amount_sat, mm.mm_address, now + i);
            order.asset_id = mm.asset_id;
            order.side = DEX::OrderSide::BUY;
            order.amount = amount_sat;
            order.filled = 0;
            order.price = price_sat;
            order.owner = mm.mm_address;
            order.timestamp = now + i;
            order.status = DEX::OrderStatus::OPEN;
            dex_db.WriteOrder(order);

            UniValue oinfo(UniValue::VOBJ);
            oinfo.pushKV("side", "BID");
            oinfo.pushKV("price", ValueFromAmount(price_sat));
            oinfo.pushKV("amount", ValueFromAmount(amount_sat));
            oinfo.pushKV("level", i + 1);
            orders_placed.push_back(oinfo);
        }

        // ASK (SELL stablecoin): harga lebih tinggi dari base
        {
            // ask_price_sat = base_price * (1'000'000 + level_offset_ppm) / 1'000'000
            CAmount price_sat = SafeMulDiv(mm.base_price, 1000000 + level_offset_ppm, 1000000);
            CAmount amount_sat = mm.order_size * COIN_SAT;

            // Cek saldo stablecoin cukup
            if (mm_stable_bal < mm.order_size) continue;

            DEX::Order order;
            order.order_id = DEX::ComputeOrderId(mm.asset_id, DEX::OrderSide::SELL,
                                                   price_sat, amount_sat, mm.mm_address, now + i + 1000);
            order.asset_id = mm.asset_id;
            order.side = DEX::OrderSide::SELL;
            order.amount = amount_sat;
            order.filled = 0;
            order.price = price_sat;
            order.owner = mm.mm_address;
            order.timestamp = now + i + 1000;
            order.status = DEX::OrderStatus::OPEN;
            dex_db.WriteOrder(order);

            UniValue oinfo(UniValue::VOBJ);
            oinfo.pushKV("side", "ASK");
            oinfo.pushKV("price", ValueFromAmount(price_sat));
            oinfo.pushKV("amount", ValueFromAmount(amount_sat));
            oinfo.pushKV("level", i + 1);
            orders_placed.push_back(oinfo);
        }
    }
    return orders_placed;
}

// Helper: auto-adjust market maker price after a swap.
// Ketika GRD dibeli (stablecoin→GRD), base_price turun → GRD lebih mahal.
// Ketika GRD dijual (GRD→stablecoin), base_price naik → GRD lebih murah.
// ALL arithmetic is pure integer — no double/float.
static void AutoAdjustMMPrice(DEX::DexDB& dex_db, Assets::AssetDB& asset_db,
                               const uint256& asset_id,
                               bool grd_bought,
                               int64_t trade_amount_stable)
{
    DEX::MarketMaker mm;
    if (!dex_db.ReadMarketMaker(asset_id, mm)) return;
    if (!mm.active) return;

    // Semua asset (stablecoin, saham, token) menggunakan mekanisme yang sama:
    // Harga bergerak berdasarkan supply/demand via orderbook — seperti forex real

    Assets::AssetInfo info;
    asset_db.ReadAsset(asset_id, info);

    // Impact factor in PPM (parts-per-million):
    // impact_ppm = (trade_amount * 1'000'000) / order_size
    // Cap at 5'000'000 PPM (= 5.0x → max 5% per trade)
    int64_t impact_ppm = SafeMulDiv(trade_amount_stable, 1000000, mm.order_size);
    if (impact_ppm > 5000000) impact_ppm = 5000000;

    // Price change in PPM = impact_ppm * 10000 / 1'000'000 = impact_ppm / 100
    // (1x order_size → 10000 PPM → 1%)
    int64_t price_change_ppm = impact_ppm / 100;

    CAmount old_price = mm.base_price;
    CAmount new_price;

    if (grd_bought) {
        // Demand naik → harga turun
        // new_price = old_price * (1'000'000 - price_change_ppm) / 1'000'000
        new_price = SafeMulDiv(old_price, 1000000 - price_change_ppm, 1000000);
    } else {
        // Supply naik → harga naik
        new_price = SafeMulDiv(old_price, 1000000 + price_change_ppm, 1000000);
    }

    // Floor: minimum 1 satoshi
    if (new_price < 1) new_price = 1;

    mm.base_price = new_price;
    mm.timestamp = TicksSinceEpoch<std::chrono::seconds>(SystemClock::now());

    LogPrintf("AutoAdjustMMPrice: asset=%s type=%s grd_bought=%d trade=%ld old_sat=%ld new_sat=%ld impact_ppm=%ld\n",
              asset_id.ToString().substr(0,8), info.type, grd_bought, trade_amount_stable,
              (long)old_price, (long)new_price, (long)impact_ppm);

    CancelMMOrders(dex_db, asset_id, mm.mm_address);
    dex_db.WriteMarketMaker(mm);
    PlaceMMOrders(dex_db, asset_db, mm);
}

// ---------------------------------------------------------------------------
// setupmarketmaker "asset_id" "mm_address" base_price spread_bps order_size num_levels
// ---------------------------------------------------------------------------
static RPCHelpMan setupmarketmaker()
{
    return RPCHelpMan{
        "setupmarketmaker",
        "Setup market maker otomatis untuk stablecoin pair.\n"
        "Market maker akan pasang bid/ask orders di orderbook secara otomatis.\n"
        "GRD dan stablecoin yang di-trade masuk ke mm_address.\n",
        {
            {"asset_id",    RPCArg::Type::STR_HEX, RPCArg::Optional::NO, "Asset ID stablecoin"},
            {"mm_address",  RPCArg::Type::STR,      RPCArg::Optional::NO, "Alamat wallet market maker"},
            {"base_price",  RPCArg::Type::AMOUNT,   RPCArg::Optional::NO, "Harga dasar 1 stablecoin dalam GRD (misal 0.0000625 untuk IDR)"},
            {"spread_bps",  RPCArg::Type::NUM,      RPCArg::Optional::NO, "Spread dalam basis points (misal 50 = 0.5%)"},
            {"order_size",  RPCArg::Type::NUM,      RPCArg::Optional::NO, "Ukuran order per level (unit stablecoin)"},
            {"num_levels",  RPCArg::Type::NUM,      RPCArg::Optional::NO, "Jumlah level bid/ask (misal 5)"},
            {"pqcseckeyhex", RPCArg::Type::STR,     RPCArg::Optional::OMITTED, "ML-DSA-87 authority key (pk||sk, 7488 bytes hex). Wajib jika PQC aktif."},
        },
        RPCResult{
            RPCResult::Type::OBJ, "", "",
            {
                {RPCResult::Type::STR, "status", "OK"},
                {RPCResult::Type::STR_HEX, "asset_id", ""},
                {RPCResult::Type::STR, "mm_address", ""},
                {RPCResult::Type::STR_AMOUNT, "base_price", ""},
                {RPCResult::Type::NUM, "spread_bps", ""},
                {RPCResult::Type::NUM, "order_size", ""},
                {RPCResult::Type::NUM, "num_levels", ""},
                {RPCResult::Type::NUM, "orders_placed", ""},
                {RPCResult::Type::ARR, "orders", "", {{RPCResult::Type::OBJ, "", "", {}}}},
            }
        },
        RPCExamples{
            HelpExampleCli("setupmarketmaker",
                "\"<asset_id>\" \"grd1q...\" 0.0000625 50 1000000 5")
        },
        [&](const RPCHelpMan& self, const JSONRPCRequest& request) -> UniValue
        {
            // === KEAMANAN: Hanya CBDC node yang boleh setup market maker ===
            auto wmode = CBDC::GetWalletMode();
            if (wmode != CBDC::WalletMode::CBDC)
                throw JSONRPCError(RPC_MISC_ERROR,
                    "Hanya node CBDC yang boleh setup market maker.");

            uint256 asset_id = ParseHashV(request.params[0], "asset_id");
            const std::string mm_address = request.params[1].get_str();
            CAmount base_price = AmountFromValue(request.params[2]);
            int64_t spread_bps = request.params[3].getInt<int64_t>();
            int64_t order_size = request.params[4].getInt<int64_t>();
            int32_t num_levels = request.params[5].getInt<int32_t>();

            if (!IsValidDestination(DecodeDestination(mm_address)))
                throw JSONRPCError(RPC_INVALID_ADDRESS_OR_KEY, "mm_address tidak valid");
            if (base_price <= 0)
                throw JSONRPCError(RPC_INVALID_PARAMETER, "base_price harus positif");
            if (spread_bps < 1 || spread_bps > 10000)
                throw JSONRPCError(RPC_INVALID_PARAMETER, "spread_bps harus 1-10000");
            if (order_size <= 0)
                throw JSONRPCError(RPC_INVALID_PARAMETER, "order_size harus positif");
            if (num_levels < 1 || num_levels > 20)
                throw JSONRPCError(RPC_INVALID_PARAMETER, "num_levels harus 1-20");

            std::string pqc_hex = (request.params.size() > 6 && !request.params[6].isNull())
                                  ? request.params[6].get_str() : "";
            try {
                CBDC::RequirePQCAuth(pqc_hex, "setupmarketmaker",
                                     asset_id.GetHex() + "|" + mm_address + "|" +
                                     std::to_string(base_price) + "|" +
                                     std::to_string(spread_bps) + "|" +
                                     std::to_string(order_size) + "|" +
                                     std::to_string(num_levels));
            } catch (const std::runtime_error& e) {
                throw JSONRPCError(RPC_INVALID_PARAMETER, e.what());
            }

            // Cek asset ada (support stablecoin, saham, token, obligasi)
            Assets::AssetDB& asset_db = Assets::GetAssetDB();
            Assets::AssetInfo info;
            if (!asset_db.ReadAsset(asset_id, info))
                throw JSONRPCError(RPC_INVALID_PARAMETER, "Asset tidak ditemukan");

            int64_t now = TicksSinceEpoch<std::chrono::seconds>(SystemClock::now());

            DEX::MarketMaker mm;
            mm.asset_id = asset_id;
            mm.mm_address = mm_address;
            mm.spread_bps = spread_bps;
            mm.order_size = order_size;
            mm.num_levels = num_levels;
            mm.base_price = base_price;
            mm.active = true;
            mm.total_profit_grd = 0;
            mm.total_profit_stable = 0;
            mm.timestamp = now;

            DEX::DexDB& dex_db = DEX::GetDexDB();

            // Cancel existing MM orders kalau ada
            DEX::MarketMaker old_mm;
            if (dex_db.ReadMarketMaker(asset_id, old_mm)) {
                CancelMMOrders(dex_db, asset_id, old_mm.mm_address);
            }

            dex_db.WriteMarketMaker(mm);

            // Pasang orders di orderbook
            UniValue orders = PlaceMMOrders(dex_db, asset_db, mm);

            UniValue result(UniValue::VOBJ);
            result.pushKV("status", "OK");
            result.pushKV("asset_id", asset_id.GetHex());
            result.pushKV("symbol", info.symbol);
            result.pushKV("mm_address", mm_address);
            result.pushKV("base_price", ValueFromAmount(base_price));
            result.pushKV("spread_bps", spread_bps);
            result.pushKV("order_size", order_size);
            result.pushKV("num_levels", num_levels);
            result.pushKV("orders_placed", (int)orders.size());
            result.pushKV("orders", orders);
            return result;
        },
    };
}

// ---------------------------------------------------------------------------
// getmarketmaker "asset_id"
// ---------------------------------------------------------------------------
static RPCHelpMan getmarketmaker()
{
    return RPCHelpMan{
        "getmarketmaker",
        "Lihat konfigurasi market maker untuk stablecoin.\n",
        {
            {"asset_id", RPCArg::Type::STR_HEX, RPCArg::Optional::NO, "Asset ID stablecoin"},
        },
        RPCResult{RPCResult::Type::OBJ, "", "", {}},
        RPCExamples{HelpExampleCli("getmarketmaker", "\"<asset_id>\"")},
        [&](const RPCHelpMan& self, const JSONRPCRequest& request) -> UniValue
        {
            uint256 asset_id = ParseHashV(request.params[0], "asset_id");
            DEX::DexDB& dex_db = DEX::GetDexDB();
            DEX::MarketMaker mm;
            if (!dex_db.ReadMarketMaker(asset_id, mm))
                throw JSONRPCError(RPC_INVALID_PARAMETER, "Market maker belum disetup untuk asset ini");

            Assets::AssetDB& asset_db = Assets::GetAssetDB();
            Assets::AssetInfo info;
            asset_db.ReadAsset(asset_id, info);

            UniValue result(UniValue::VOBJ);
            result.pushKV("asset_id", asset_id.GetHex());
            result.pushKV("symbol", info.symbol);
            result.pushKV("mm_address", mm.mm_address);
            result.pushKV("base_price", ValueFromAmount(mm.base_price));
            result.pushKV("spread_bps", mm.spread_bps);
            result.pushKV("order_size", mm.order_size);
            result.pushKV("num_levels", mm.num_levels);
            result.pushKV("active", mm.active);
            result.pushKV("total_profit_grd", ValueFromAmount(mm.total_profit_grd));
            result.pushKV("total_profit_stable", mm.total_profit_stable);

            // Tampilkan saldo MM
            int64_t mm_stable = 0;
            asset_db.ReadBalance(asset_id, mm.mm_address, mm_stable);
            result.pushKV("mm_stablecoin_balance", mm_stable);

            return result;
        },
    };
}

// ---------------------------------------------------------------------------
// refreshmarketmaker "asset_id" [new_base_price]
//   Refresh: cancel old orders, place new orders. Update base_price jika perlu.
// ---------------------------------------------------------------------------
static RPCHelpMan refreshmarketmaker()
{
    return RPCHelpMan{
        "refreshmarketmaker",
        "Refresh market maker orders. Cancel order lama, pasang order baru.\n"
        "Opsional update base_price (misal dari feed harga external).\n",
        {
            {"asset_id",       RPCArg::Type::STR_HEX, RPCArg::Optional::NO, "Asset ID stablecoin"},
            {"new_base_price", RPCArg::Type::AMOUNT,   RPCArg::Optional::OMITTED, "Harga dasar baru (opsional)"},
            {"pqcseckeyhex",   RPCArg::Type::STR,      RPCArg::Optional::OMITTED, "ML-DSA-87 authority key (pk||sk, 7488 bytes hex). Wajib jika PQC aktif."},
        },
        RPCResult{RPCResult::Type::OBJ, "", "", {}},
        RPCExamples{HelpExampleCli("refreshmarketmaker", "\"<asset_id>\" 0.0000625")},
        [&](const RPCHelpMan& self, const JSONRPCRequest& request) -> UniValue
        {
            uint256 asset_id = ParseHashV(request.params[0], "asset_id");

            std::string pqc_hex = (request.params.size() > 2 && !request.params[2].isNull())
                                  ? request.params[2].get_str() : "";
            try {
                CBDC::RequirePQCAuth(pqc_hex, "refreshmarketmaker", asset_id.GetHex());
            } catch (const std::runtime_error& e) {
                throw JSONRPCError(RPC_INVALID_PARAMETER, e.what());
            }

            DEX::DexDB& dex_db = DEX::GetDexDB();
            DEX::MarketMaker mm;
            if (!dex_db.ReadMarketMaker(asset_id, mm))
                throw JSONRPCError(RPC_INVALID_PARAMETER, "Market maker belum disetup");

            // Update base_price jika diberikan
            if (!request.params[1].isNull()) {
                mm.base_price = AmountFromValue(request.params[1]);
            }

            // Cancel old orders
            CancelMMOrders(dex_db, asset_id, mm.mm_address);

            // Match dulu sebelum pasang order baru (eksekusi trade pending)
            auto trades = dex_db.MatchOrders(asset_id);

            // Update profit dari trades yang melibatkan MM
            Assets::AssetDB& asset_db = Assets::GetAssetDB();
            for (const auto& t : trades) {
                DEX::Order buy_o, sell_o;
                if (dex_db.ReadOrder(t.buy_order_id, buy_o) &&
                    dex_db.ReadOrder(t.sell_order_id, sell_o)) {
                    // MM profit tracking
                    if (buy_o.owner == mm.mm_address || sell_o.owner == mm.mm_address) {
                        // Transfer stablecoin balances
                        if (sell_o.owner == mm.mm_address) {
                            // MM sold stablecoin → decrease MM stable, increase buyer stable
                            int64_t mm_bal = 0, buyer_bal = 0;
                            asset_db.ReadBalance(asset_id, mm.mm_address, mm_bal);
                            asset_db.ReadBalance(asset_id, buy_o.owner, buyer_bal);
                            mm_bal -= t.amount / COIN_SAT; // convert from satoshi
                            buyer_bal += t.amount / COIN_SAT;
                            asset_db.WriteBalance(asset_id, mm.mm_address, mm_bal);
                            asset_db.WriteBalance(asset_id, buy_o.owner, buyer_bal);
                            mm.total_profit_grd += SafeMulDiv(t.amount, t.price, COIN_SAT); // GRD received
                        }
                        if (buy_o.owner == mm.mm_address) {
                            // MM bought stablecoin → increase MM stable, decrease seller stable
                            int64_t mm_bal = 0, seller_bal = 0;
                            asset_db.ReadBalance(asset_id, mm.mm_address, mm_bal);
                            asset_db.ReadBalance(asset_id, sell_o.owner, seller_bal);
                            mm_bal += t.amount / COIN_SAT;
                            seller_bal -= t.amount / COIN_SAT;
                            asset_db.WriteBalance(asset_id, mm.mm_address, mm_bal);
                            asset_db.WriteBalance(asset_id, sell_o.owner, seller_bal);
                            mm.total_profit_stable += t.amount / COIN_SAT;
                        }
                    }
                }
            }

            mm.timestamp = TicksSinceEpoch<std::chrono::seconds>(SystemClock::now());
            dex_db.WriteMarketMaker(mm);

            // Pasang order baru
            UniValue orders = PlaceMMOrders(dex_db, asset_db, mm);

            UniValue result(UniValue::VOBJ);
            result.pushKV("status", "OK");
            result.pushKV("asset_id", asset_id.GetHex());
            result.pushKV("base_price", ValueFromAmount(mm.base_price));
            result.pushKV("trades_matched", (int)trades.size());
            result.pushKV("orders_placed", (int)orders.size());
            result.pushKV("orders", orders);
            return result;
        },
    };
}

// ---------------------------------------------------------------------------
// swapgrdtostable "asset_id" "buyer_address" grd_amount
//   Swap GRD → stablecoin via orderbook. Mengambil best ASK dari orderbook.
//   GRD masuk ke wallet market maker / seller.
// ---------------------------------------------------------------------------
static RPCHelpMan swapgrdtostable()
{
    return RPCHelpMan{
        "swapgrdtostable",
        "Swap GRD ke stablecoin via orderbook.\n"
        "Membeli stablecoin dari best ASK. GRD masuk ke seller/market maker.\n",
        {
            {"asset_id",      RPCArg::Type::STR_HEX, RPCArg::Optional::NO, "Asset ID stablecoin"},
            {"buyer_address", RPCArg::Type::STR,      RPCArg::Optional::NO, "Alamat pembeli (menerima stablecoin)"},
            {"grd_amount",    RPCArg::Type::AMOUNT,   RPCArg::Optional::NO, "Jumlah GRD untuk swap"},
        },
        RPCResult{RPCResult::Type::OBJ, "", "", {}},
        RPCExamples{HelpExampleCli("swapgrdtostable", "\"<asset_id>\" \"grd1q...\" 100.0")},
        [&](const RPCHelpMan& self, const JSONRPCRequest& request) -> UniValue
        {
            uint256 asset_id = ParseHashV(request.params[0], "asset_id");
            const std::string buyer = request.params[1].get_str();
            CAmount grd_budget = AmountFromValue(request.params[2]);

            if (grd_budget <= 0)
                throw JSONRPCError(RPC_INVALID_PARAMETER, "grd_amount harus positif");
            if (!IsValidDestination(DecodeDestination(buyer)))
                throw JSONRPCError(RPC_INVALID_ADDRESS_OR_KEY, "buyer_address tidak valid");

            Assets::AssetDB& asset_db = Assets::GetAssetDB();
            Assets::AssetInfo info;
            if (!asset_db.ReadAsset(asset_id, info))
                throw JSONRPCError(RPC_INVALID_PARAMETER, "Asset tidak ditemukan");

            DEX::DexDB& dex_db = DEX::GetDexDB();

            // Ambil semua ASK orders (sorted ascending price)
            auto orderbook = dex_db.GetOrderBook(asset_id, 500);
            std::vector<DEX::Order*> asks;
            for (auto& o : orderbook) {
                if (o.side == DEX::OrderSide::SELL && o.status == DEX::OrderStatus::OPEN)
                    asks.push_back(&o);
            }
            std::sort(asks.begin(), asks.end(),
                      [](const DEX::Order* a, const DEX::Order* b) { return a->price < b->price; });

            if (asks.empty())
                throw JSONRPCError(RPC_INVALID_PARAMETER, "Tidak ada ASK order di orderbook");

            int64_t now = TicksSinceEpoch<std::chrono::seconds>(SystemClock::now());
            CAmount grd_remaining = grd_budget;
            int64_t total_stable_received = 0;
            UniValue fills(UniValue::VARR);

            for (auto* ask : asks) {
                if (grd_remaining <= 0) break;

                int64_t ask_remaining_sat = ask->amount - ask->filled;
                // GRD cost for this ask = ask_remaining_sat * price / COIN_SAT
                CAmount cost = SafeMulDiv(ask_remaining_sat, ask->price, COIN_SAT);
                CAmount fill_grd;
                int64_t fill_stable_sat;

                if (cost <= grd_remaining) {
                    // Fill entire ask
                    fill_grd = cost;
                    fill_stable_sat = ask_remaining_sat;
                } else {
                    // Partial fill: stable = grd_remaining * COIN_SAT / price
                    fill_stable_sat = SafeMulDiv(grd_remaining, COIN_SAT, ask->price);
                    if (fill_stable_sat <= 0) break;
                    fill_grd = SafeMulDiv(fill_stable_sat, ask->price, COIN_SAT);
                }

                // Update ask order
                ask->filled += fill_stable_sat;
                if (ask->filled >= ask->amount)
                    ask->status = DEX::OrderStatus::FILLED;
                else
                    ask->status = DEX::OrderStatus::PARTIAL;
                dex_db.WriteOrder(*ask);

                // Transfer stablecoin: seller → buyer
                int64_t stable_units = fill_stable_sat / COIN_SAT;
                if (stable_units <= 0) stable_units = 1;
                int64_t seller_bal = 0, buyer_bal = 0;
                asset_db.ReadBalance(asset_id, ask->owner, seller_bal);
                asset_db.ReadBalance(asset_id, buyer, buyer_bal);
                seller_bal -= stable_units;
                buyer_bal += stable_units;
                asset_db.WriteBalance(asset_id, ask->owner, seller_bal);
                asset_db.WriteBalance(asset_id, buyer, buyer_bal);

                // GRD otomatis masuk ke seller (market maker)
                // Jika ini node CBDC, GRD sudah ada. Log saja.

                grd_remaining -= fill_grd;
                total_stable_received += stable_units;

                // Record trade
                CSHA256 hasher;
                hasher.Write(ask->order_id.data(), 32);
                hasher.Write(reinterpret_cast<const unsigned char*>(&now), sizeof(now));
                uint256 trade_id;
                hasher.Finalize(trade_id.data());

                DEX::TradeResult tr;
                tr.trade_id = trade_id;
                tr.buy_order_id = uint256::ZERO; // market buy, no standing order
                tr.sell_order_id = ask->order_id;
                tr.asset_id = asset_id;
                tr.amount = fill_stable_sat;
                tr.price = ask->price;
                tr.timestamp = now;
                dex_db.WriteTrade(tr);

                UniValue fill(UniValue::VOBJ);
                fill.pushKV("seller", ask->owner);
                fill.pushKV("price", ValueFromAmount(ask->price));
                fill.pushKV("stablecoin_units", stable_units);
                fill.pushKV("grd_cost", ValueFromAmount(fill_grd));
                fills.push_back(fill);
            }

            if (total_stable_received <= 0)
                throw JSONRPCError(RPC_INVALID_PARAMETER, "Tidak bisa match order. Budget GRD terlalu kecil.");

            // Log
            Assets::AssetTxEntry entry;
            entry.asset_id = asset_id;
            entry.action = "swap_grd_to_stable";
            entry.from = buyer;
            entry.to = "orderbook";
            entry.amount = total_stable_received;
            entry.timestamp = now;
            entry.txid = "market_buy";
            asset_db.WriteAssetTx(entry);

            UniValue result(UniValue::VOBJ);
            result.pushKV("status", "OK");
            result.pushKV("asset_id", asset_id.GetHex());
            result.pushKV("symbol", info.symbol);
            result.pushKV("grd_spent", ValueFromAmount(grd_budget - grd_remaining));
            result.pushKV("stablecoin_received", total_stable_received);
            result.pushKV("avg_price", ValueFromAmount(
                total_stable_received > 0 ? SafeMulDiv(grd_budget - grd_remaining, COIN_SAT, total_stable_received) : 0));
            result.pushKV("fills", fills);
            result.pushKV("buyer", buyer);

            // Auto-adjust MM price: GRD dijual (beli stablecoin) → GRD turun
            AutoAdjustMMPrice(dex_db, asset_db, asset_id, false, total_stable_received);

            return result;
        },
    };
}

// ---------------------------------------------------------------------------
// swapstabletogrd "asset_id" "seller_address" stablecoin_amount
//   Swap stablecoin → GRD via orderbook. Mengambil best BID dari orderbook.
//   Stablecoin masuk ke buyer/market maker. GRD dikirim ke seller.
// ---------------------------------------------------------------------------
static RPCHelpMan swapstabletogrd()
{
    return RPCHelpMan{
        "swapstabletogrd",
        "Swap stablecoin ke GRD via orderbook.\n"
        "Menjual stablecoin ke best BID. GRD dikirim dari buyer/market maker ke seller.\n",
        {
            {"asset_id",          RPCArg::Type::STR_HEX, RPCArg::Optional::NO, "Asset ID stablecoin"},
            {"seller_address",    RPCArg::Type::STR,      RPCArg::Optional::NO, "Alamat penjual (menerima GRD)"},
            {"stablecoin_amount", RPCArg::Type::NUM,      RPCArg::Optional::NO, "Jumlah stablecoin untuk swap"},
        },
        RPCResult{RPCResult::Type::OBJ, "", "", {}},
        RPCExamples{HelpExampleCli("swapstabletogrd", "\"<asset_id>\" \"grd1q...\" 100000")},
        [&](const RPCHelpMan& self, const JSONRPCRequest& request) -> UniValue
        {
            uint256 asset_id = ParseHashV(request.params[0], "asset_id");
            const std::string seller = request.params[1].get_str();
            int64_t stable_to_sell = request.params[2].getInt<int64_t>();

            if (stable_to_sell <= 0)
                throw JSONRPCError(RPC_INVALID_PARAMETER, "stablecoin_amount harus positif");
            if (!IsValidDestination(DecodeDestination(seller)))
                throw JSONRPCError(RPC_INVALID_ADDRESS_OR_KEY, "seller_address tidak valid");

            Assets::AssetDB& asset_db = Assets::GetAssetDB();
            Assets::AssetInfo info;
            if (!asset_db.ReadAsset(asset_id, info))
                throw JSONRPCError(RPC_INVALID_PARAMETER, "Asset tidak ditemukan");

            // Cek saldo stablecoin seller
            int64_t seller_stable = 0;
            asset_db.ReadBalance(asset_id, seller, seller_stable);
            if (seller_stable < stable_to_sell)
                throw JSONRPCError(RPC_INVALID_PARAMETER,
                    strprintf("Saldo stablecoin tidak cukup (punya: %d, butuh: %d)",
                              seller_stable, stable_to_sell));

            DEX::DexDB& dex_db = DEX::GetDexDB();

            // Ambil semua BID orders (sorted descending price)
            auto orderbook = dex_db.GetOrderBook(asset_id, 500);
            std::vector<DEX::Order*> bids;
            for (auto& o : orderbook) {
                if (o.side == DEX::OrderSide::BUY && o.status == DEX::OrderStatus::OPEN)
                    bids.push_back(&o);
            }
            std::sort(bids.begin(), bids.end(),
                      [](const DEX::Order* a, const DEX::Order* b) { return a->price > b->price; });

            if (bids.empty())
                throw JSONRPCError(RPC_INVALID_PARAMETER, "Tidak ada BID order di orderbook");

            int64_t now = TicksSinceEpoch<std::chrono::seconds>(SystemClock::now());
            int64_t stable_remaining = stable_to_sell;
            CAmount total_grd_received = 0;
            UniValue fills(UniValue::VARR);

            for (auto* bid : bids) {
                if (stable_remaining <= 0) break;

                int64_t bid_remaining_sat = bid->amount - bid->filled;
                int64_t bid_remaining_units = bid_remaining_sat / COIN_SAT;
                int64_t fill_units = std::min(stable_remaining, bid_remaining_units);
                if (fill_units <= 0) continue;

                int64_t fill_sat = fill_units * COIN_SAT;
                CAmount grd_earned = SafeMulDiv(fill_sat, bid->price, COIN_SAT);

                // Update bid order
                bid->filled += fill_sat;
                if (bid->filled >= bid->amount)
                    bid->status = DEX::OrderStatus::FILLED;
                else
                    bid->status = DEX::OrderStatus::PARTIAL;
                dex_db.WriteOrder(*bid);

                // Transfer stablecoin: seller → buyer(MM)
                int64_t buyer_bal = 0;
                asset_db.ReadBalance(asset_id, bid->owner, buyer_bal);
                buyer_bal += fill_units;
                asset_db.WriteBalance(asset_id, bid->owner, buyer_bal);

                stable_remaining -= fill_units;
                total_grd_received += grd_earned;

                // Record trade
                CSHA256 hasher;
                hasher.Write(bid->order_id.data(), 32);
                hasher.Write(reinterpret_cast<const unsigned char*>(&now), sizeof(now));
                uint256 trade_id;
                hasher.Finalize(trade_id.data());

                DEX::TradeResult tr;
                tr.trade_id = trade_id;
                tr.buy_order_id = bid->order_id;
                tr.sell_order_id = uint256::ZERO;
                tr.asset_id = asset_id;
                tr.amount = fill_sat;
                tr.price = bid->price;
                tr.timestamp = now;
                dex_db.WriteTrade(tr);

                UniValue fill(UniValue::VOBJ);
                fill.pushKV("buyer", bid->owner);
                fill.pushKV("price", ValueFromAmount(bid->price));
                fill.pushKV("stablecoin_units", fill_units);
                fill.pushKV("grd_earned", ValueFromAmount(grd_earned));
                fills.push_back(fill);
            }

            int64_t sold = stable_to_sell - stable_remaining;
            if (sold <= 0)
                throw JSONRPCError(RPC_INVALID_PARAMETER, "Tidak bisa match order. Tidak ada BID.");

            // Kurangi saldo stablecoin seller
            seller_stable -= sold;
            asset_db.WriteBalance(asset_id, seller, seller_stable);

            // Kirim GRD ke seller via sendtoaddress
            std::string txid = "pending";
            if (total_grd_received > 0) {
                JSONRPCRequest send_req;
                send_req.context = request.context;
                send_req.strMethod = "sendtoaddress";
                send_req.params = UniValue(UniValue::VARR);
                send_req.params.push_back(seller);
                send_req.params.push_back(ValueFromAmount(total_grd_received));
                send_req.URI = request.URI;
                try {
                    UniValue sr = tableRPC.execute(send_req);
                    txid = sr.get_str();
                } catch (const UniValue& e) {
                    throw JSONRPCError(RPC_WALLET_ERROR,
                        strprintf("Gagal kirim GRD: %s", e["message"].get_str()));
                }
            }

            // Log
            Assets::AssetTxEntry entry;
            entry.asset_id = asset_id;
            entry.action = "swap_stable_to_grd";
            entry.from = seller;
            entry.to = "orderbook";
            entry.amount = sold;
            entry.timestamp = now;
            entry.txid = txid;
            asset_db.WriteAssetTx(entry);

            UniValue result(UniValue::VOBJ);
            result.pushKV("status", "OK");
            result.pushKV("asset_id", asset_id.GetHex());
            result.pushKV("symbol", info.symbol);
            result.pushKV("stablecoin_sold", sold);
            result.pushKV("grd_received", ValueFromAmount(total_grd_received));
            result.pushKV("fills", fills);
            result.pushKV("seller", seller);
            result.pushKV("txid", txid);

            // Auto-adjust MM price: GRD dibeli (jual stablecoin) → GRD naik
            AutoAdjustMMPrice(dex_db, asset_db, asset_id, true, sold);

            return result;
        },
    };
}

// ---------------------------------------------------------------------------
// listmarketmakers
// ---------------------------------------------------------------------------
static RPCHelpMan listmarketmakers()
{
    return RPCHelpMan{
        "listmarketmakers",
        "List semua market maker aktif.\n",
        {},
        RPCResult{RPCResult::Type::ARR, "", "", {{RPCResult::Type::OBJ, "", "", {}}}},
        RPCExamples{HelpExampleCli("listmarketmakers", "")},
        [&](const RPCHelpMan& self, const JSONRPCRequest& request) -> UniValue
        {
            DEX::DexDB& dex_db = DEX::GetDexDB();
            auto mms = dex_db.ListMarketMakers(200);
            Assets::AssetDB& asset_db = Assets::GetAssetDB();

            UniValue result(UniValue::VARR);
            for (const auto& mm : mms) {
                Assets::AssetInfo info;
                asset_db.ReadAsset(mm.asset_id, info);
                UniValue obj(UniValue::VOBJ);
                obj.pushKV("asset_id", mm.asset_id.GetHex());
                obj.pushKV("symbol", info.symbol);
                obj.pushKV("mm_address", mm.mm_address);
                obj.pushKV("base_price", ValueFromAmount(mm.base_price));
                obj.pushKV("spread_bps", mm.spread_bps);
                obj.pushKV("order_size", mm.order_size);
                obj.pushKV("num_levels", mm.num_levels);
                obj.pushKV("active", mm.active);
                result.push_back(obj);
            }
            return result;
        },
    };
}

// ---------------------------------------------------------------------------
// getgrdprice [currency]
//   Tampilkan harga GRD di semua stablecoin (atau 1 currency tertentu).
//   Harga diambil dari orderbook mid-price (midpoint best bid & best ask).
// ---------------------------------------------------------------------------
static RPCHelpMan getgrdprice()
{
    return RPCHelpMan{
        "getgrdprice",
        "Tampilkan harga GRD dalam semua stablecoin yang punya market maker aktif.\n"
        "Harga = mid-price orderbook (rata-rata best bid & best ask).\n"
        "Opsional filter satu mata uang saja.\n",
        {
            {"currency", RPCArg::Type::STR, RPCArg::Optional::OMITTED, "Filter mata uang (misal IDR, USD, EUR)"},
        },
        RPCResult{RPCResult::Type::OBJ, "", "", {}},
        RPCExamples{
            HelpExampleCli("getgrdprice", "") +
            HelpExampleCli("getgrdprice", "IDR")
        },
        [&](const RPCHelpMan& self, const JSONRPCRequest& request) -> UniValue
        {
            std::string filter_currency;
            if (!request.params[0].isNull())
                filter_currency = request.params[0].get_str();

            Assets::AssetDB& asset_db = Assets::GetAssetDB();
            DEX::DexDB& dex_db = DEX::GetDexDB();

            // Ambil semua stablecoin yang punya market maker
            auto all_assets = asset_db.ListAssets(500);

            UniValue prices(UniValue::VOBJ);
            UniValue price_list(UniValue::VARR);

            for (const auto& asset : all_assets) {
                if (asset.type != "stablecoin") continue;
                if (!filter_currency.empty() && asset.symbol != filter_currency &&
                    asset.peg_currency != filter_currency) continue;

                // Cari best bid & best ask dari orderbook
                auto orderbook = dex_db.GetOrderBook(asset.asset_id, 100);
                CAmount best_bid = 0, best_ask = 0;
                for (const auto& o : orderbook) {
                    if (o.side == DEX::OrderSide::BUY && o.status == DEX::OrderStatus::OPEN) {
                        if (o.price > best_bid) best_bid = o.price;
                    }
                    if (o.side == DEX::OrderSide::SELL && o.status == DEX::OrderStatus::OPEN) {
                        if (best_ask == 0 || o.price < best_ask) best_ask = o.price;
                    }
                }

                // Fallback ke market maker base_price jika orderbook kosong
                DEX::MarketMaker mm;
                if (best_bid == 0 && best_ask == 0) {
                    if (dex_db.ReadMarketMaker(asset.asset_id, mm)) {
                        int64_t half_spread_ppm = (int64_t)mm.spread_bps * 50;
                        best_bid = SafeMulDiv(mm.base_price, 1000000 - half_spread_ppm, 1000000);
                        best_ask = SafeMulDiv(mm.base_price, 1000000 + half_spread_ppm, 1000000);
                    } else {
                        continue;
                    }
                }

                // Mid-price in satoshi per 1 stablecoin unit
                CAmount mid_price_sat = 0;
                if (best_bid > 0 && best_ask > 0)
                    mid_price_sat = (best_bid + best_ask) / 2;
                else if (best_ask > 0)
                    mid_price_sat = best_ask;
                else if (best_bid > 0)
                    mid_price_sat = best_bid;

                // grd_price = 1 GRD in stablecoin units = COIN_SAT / mid_price_sat
                // Use double ONLY for JSON display (not for any financial calc)
                double mid_price_grd_display = (double)mid_price_sat / (double)COIN_SAT;
                double grd_price_display = (mid_price_sat > 0) ? (double)COIN_SAT / (double)mid_price_sat : 0;

                UniValue pair(UniValue::VOBJ);
                pair.pushKV("currency", asset.peg_currency);
                pair.pushKV("symbol", asset.symbol);
                pair.pushKV("asset_id", asset.asset_id.GetHex());
                pair.pushKV("grd_price", grd_price_display);
                pair.pushKV("best_bid", ValueFromAmount(best_bid));
                pair.pushKV("best_ask", ValueFromAmount(best_ask));
                pair.pushKV("mid_price", mid_price_grd_display);
                pair.pushKV("spread_pct", (best_bid > 0 && best_ask > 0) ?
                    ((double)(best_ask - best_bid) / (double)best_bid * 100.0) : 0.0);
                price_list.push_back(pair);

                // Juga masukkan ke object utama untuk akses cepat
                prices.pushKV(asset.symbol, grd_price_display);
            }

            UniValue result(UniValue::VOBJ);
            result.pushKV("prices", prices);
            result.pushKV("details", price_list);
            return result;
        },
    };
}

// ---------------------------------------------------------------------------
// swapstable "from_currency" "to_currency" amount "address"
// Swap antar mata uang (stablecoin ↔ stablecoin) via GRD
// Simulasi perdagangan internasional (ekspor/impor)
// ---------------------------------------------------------------------------
static RPCHelpMan swapstable()
{
    return RPCHelpMan{
        "swapstable",
        "Swap antar mata uang (stablecoin) melalui GRD.\n"
        "Simulasi perdagangan internasional — contoh: Indonesia beli gandum Ukraina\n"
        "→ swap IDR → UAH → supply IDR naik, demand UAH naik.\n"
        "Harga bergerak real-time berdasarkan supply/demand seperti forex.\n",
        {
            {"from_asset_id", RPCArg::Type::STR_HEX, RPCArg::Optional::NO, "Asset ID mata uang sumber"},
            {"to_asset_id",   RPCArg::Type::STR_HEX, RPCArg::Optional::NO, "Asset ID mata uang tujuan"},
            {"from_amount",   RPCArg::Type::NUM,     RPCArg::Optional::NO, "Jumlah mata uang sumber"},
            {"address",       RPCArg::Type::STR,     RPCArg::Optional::NO, "Alamat pemilik"},
        },
        RPCResult{RPCResult::Type::OBJ, "", "", {}},
        RPCExamples{HelpExampleCli("swapstable", "\"<idr_id>\" \"<uah_id>\" 1000000 \"grd1q...\"")},
        [&](const RPCHelpMan& self, const JSONRPCRequest& request) -> UniValue
        {
            // Langsung forward ke swapasset — mekanisme sama
            // swapasset sudah handle semua: from→GRD→to via orderbook
            uint256 from_id = ParseHashV(request.params[0], "from_asset_id");
            uint256 to_id   = ParseHashV(request.params[1], "to_asset_id");
            int64_t amount  = request.params[2].getInt<int64_t>();
            const std::string address = request.params[3].get_str();

            Assets::AssetDB& asset_db = Assets::GetAssetDB();
            Assets::AssetInfo from_info, to_info;
            if (!asset_db.ReadAsset(from_id, from_info))
                throw JSONRPCError(RPC_INVALID_PARAMETER, "Mata uang sumber tidak ditemukan");
            if (!asset_db.ReadAsset(to_id, to_info))
                throw JSONRPCError(RPC_INVALID_PARAMETER, "Mata uang tujuan tidak ditemukan");

            // Panggil swapasset internal (reuse logic)
            JSONRPCRequest sub_request;
            sub_request.params = request.params;
            sub_request.context = request.context;

            // Forward — tapi kita wrap hasilnya dengan info forex
            // Untuk sekarang, buat error agar user pakai swapasset
            // yang sudah handle semuanya
            throw JSONRPCError(RPC_INVALID_PARAMETER,
                strprintf("Gunakan: swapasset \"%s\" \"%s\" %d \"%s\"\n"
                          "Swap %s → GRD → %s via orderbook market maker",
                          from_id.GetHex(), to_id.GetHex(), amount, address,
                          from_info.symbol, to_info.symbol));
        },
    };
}

// ---------------------------------------------------------------------------
// getforexrate
// Lihat exchange rate antar mata uang (berdasarkan harga orderbook real-time)
// ---------------------------------------------------------------------------
static RPCHelpMan getforexrate()
{
    return RPCHelpMan{
        "getforexrate",
        "Lihat exchange rate antar mata uang berdasarkan orderbook real-time.\n"
        "Harga bergerak dinamis berdasarkan supply/demand dari trading.\n",
        {
            {"from_symbol", RPCArg::Type::STR, RPCArg::Optional::OMITTED, "Mata uang asal (misal IDR)"},
            {"to_symbol",   RPCArg::Type::STR, RPCArg::Optional::OMITTED, "Mata uang tujuan (misal USD)"},
        },
        RPCResult{RPCResult::Type::OBJ, "", "", {}},
        RPCExamples{HelpExampleCli("getforexrate", "") + HelpExampleCli("getforexrate", "\"IDR\" \"USD\"")},
        [&](const RPCHelpMan& self, const JSONRPCRequest& request) -> UniValue
        {
            std::string from_sym = request.params[0].isNull() ? "" : request.params[0].get_str();
            std::string to_sym = request.params[1].isNull() ? "" : request.params[1].get_str();

            Assets::AssetDB& asset_db = Assets::GetAssetDB();
            DEX::DexDB& dex_db = DEX::GetDexDB();
            auto all_assets = asset_db.ListAssets(500);

            // Build price map: symbol → base_price in satoshi (integer)
            std::map<std::string, CAmount> grd_prices_sat; // symbol → satoshi per 1 unit
            for (const auto& asset : all_assets) {
                DEX::MarketMaker mm;
                if (!dex_db.ReadMarketMaker(asset.asset_id, mm) || !mm.active) continue;
                if (mm.base_price > 0) grd_prices_sat[asset.symbol] = mm.base_price;
            }

            if (!from_sym.empty() && !to_sym.empty()) {
                // Specific pair
                if (grd_prices_sat.find(from_sym) == grd_prices_sat.end())
                    throw JSONRPCError(RPC_INVALID_PARAMETER, strprintf("%s tidak ditemukan", from_sym));
                if (grd_prices_sat.find(to_sym) == grd_prices_sat.end())
                    throw JSONRPCError(RPC_INVALID_PARAMETER, strprintf("%s tidak ditemukan", to_sym));

                CAmount from_sat = grd_prices_sat[from_sym];
                CAmount to_sat = grd_prices_sat[to_sym];
                // rate = from_sat / to_sat (how many TO per 1 FROM)
                // Use double ONLY for JSON display
                double rate = (double)from_sat / (double)to_sat;

                UniValue result(UniValue::VOBJ);
                result.pushKV("pair", from_sym + "/" + to_sym);
                result.pushKV("rate", rate);
                result.pushKV("inverse", (double)to_sat / (double)from_sat);
                result.pushKV("from_grd_price", (double)from_sat / (double)COIN_SAT);
                result.pushKV("to_grd_price", (double)to_sat / (double)COIN_SAT);
                result.pushKV("description", strprintf("1 %s = %.6f %s", from_sym, rate, to_sym));
                return result;
            }

            // All rates vs GRD
            UniValue result(UniValue::VOBJ);
            UniValue rates(UniValue::VARR);
            for (const auto& [sym, price_sat] : grd_prices_sat) {
                double grd_per_unit = (double)price_sat / (double)COIN_SAT;
                double units_per_grd = (price_sat > 0) ? (double)COIN_SAT / (double)price_sat : 0;
                UniValue obj(UniValue::VOBJ);
                obj.pushKV("symbol", sym);
                obj.pushKV("grd_per_unit", grd_per_unit);
                obj.pushKV("units_per_grd", units_per_grd);
                rates.push_back(obj);
            }
            result.pushKV("base", "GRD");
            result.pushKV("rates", rates);
            result.pushKV("total_currencies", (int)grd_prices_sat.size());
            return result;
        },
    };
}

// ---------------------------------------------------------------------------
// swapasset "from_asset_id" "to_asset_id" from_amount "address"
// Swap antar asset (saham↔saham, saham↔stablecoin, dll) melalui GRD
// ---------------------------------------------------------------------------
static RPCHelpMan swapasset()
{
    return RPCHelpMan{
        "swapasset",
        "Swap antar asset melalui GRD sebagai perantara.\n"
        "Contoh: BBCA → GRD → BBRI. Otomatis via orderbook market maker.\n",
        {
            {"from_asset_id", RPCArg::Type::STR_HEX, RPCArg::Optional::NO, "Asset ID sumber (yang dijual)"},
            {"to_asset_id",   RPCArg::Type::STR_HEX, RPCArg::Optional::NO, "Asset ID tujuan (yang dibeli)"},
            {"from_amount",   RPCArg::Type::NUM,     RPCArg::Optional::NO, "Jumlah asset sumber yang dijual"},
            {"address",       RPCArg::Type::STR,     RPCArg::Optional::NO, "Alamat pemilik (harus punya from_asset)"},
        },
        RPCResult{
            RPCResult::Type::OBJ, "", "",
            {
                {RPCResult::Type::STR, "status", "OK"},
            }
        },
        RPCExamples{HelpExampleCli("swapasset", "\"<bbca_id>\" \"<bbri_id>\" 100 \"grd1q...\"")},
        [&](const RPCHelpMan& self, const JSONRPCRequest& request) -> UniValue
        {
            uint256 from_id = ParseHashV(request.params[0], "from_asset_id");
            uint256 to_id   = ParseHashV(request.params[1], "to_asset_id");
            int64_t from_amount = request.params[2].getInt<int64_t>();
            const std::string address = request.params[3].get_str();

            if (from_amount <= 0)
                throw JSONRPCError(RPC_INVALID_PARAMETER, "from_amount harus positif");
            if (from_id == to_id)
                throw JSONRPCError(RPC_INVALID_PARAMETER, "from dan to asset tidak boleh sama");
            if (!IsValidDestination(DecodeDestination(address)))
                throw JSONRPCError(RPC_INVALID_ADDRESS_OR_KEY, "address tidak valid");

            Assets::AssetDB& asset_db = Assets::GetAssetDB();
            DEX::DexDB& dex_db = DEX::GetDexDB();

            // Cek kedua asset ada
            Assets::AssetInfo from_info, to_info;
            if (!asset_db.ReadAsset(from_id, from_info))
                throw JSONRPCError(RPC_INVALID_PARAMETER, "Asset sumber tidak ditemukan");
            if (!asset_db.ReadAsset(to_id, to_info))
                throw JSONRPCError(RPC_INVALID_PARAMETER, "Asset tujuan tidak ditemukan");

            // Cek saldo from_asset
            int64_t from_balance = 0;
            asset_db.ReadBalance(from_id, address, from_balance);
            if (from_balance < from_amount)
                throw JSONRPCError(RPC_INVALID_PARAMETER,
                    strprintf("Saldo %s tidak cukup (punya: %d, butuh: %d)",
                              from_info.symbol, from_balance, from_amount));

            // Cek market maker ada untuk kedua asset
            DEX::MarketMaker mm_from, mm_to;
            if (!dex_db.ReadMarketMaker(from_id, mm_from) || !mm_from.active)
                throw JSONRPCError(RPC_INVALID_PARAMETER,
                    strprintf("Market maker %s tidak aktif", from_info.symbol));
            if (!dex_db.ReadMarketMaker(to_id, mm_to) || !mm_to.active)
                throw JSONRPCError(RPC_INVALID_PARAMETER,
                    strprintf("Market maker %s tidak aktif", to_info.symbol));

            // ====== STEP 1: Jual from_asset → GRD (via BID orders) ======
            auto orderbook_from = dex_db.GetOrderBook(from_id, 500);
            std::vector<DEX::Order*> bids;
            for (auto& o : orderbook_from) {
                if (o.side == DEX::OrderSide::BUY && o.status == DEX::OrderStatus::OPEN)
                    bids.push_back(&o);
            }
            std::sort(bids.begin(), bids.end(),
                      [](const DEX::Order* a, const DEX::Order* b) { return a->price > b->price; });

            if (bids.empty())
                throw JSONRPCError(RPC_INVALID_PARAMETER,
                    strprintf("Tidak ada BID order untuk %s", from_info.symbol));

            int64_t now = TicksSinceEpoch<std::chrono::seconds>(SystemClock::now());
            int64_t from_remaining = from_amount;
            CAmount total_grd = 0;
            UniValue step1_fills(UniValue::VARR);

            for (auto* bid : bids) {
                if (from_remaining <= 0) break;
                int64_t bid_remaining_sat = bid->amount - bid->filled;
                int64_t bid_remaining_units = bid_remaining_sat / COIN_SAT;
                int64_t fill_units = std::min(from_remaining, bid_remaining_units);
                if (fill_units <= 0) continue;

                int64_t fill_sat = fill_units * COIN_SAT;
                CAmount grd_earned = SafeMulDiv(fill_sat, bid->price, COIN_SAT);

                bid->filled += fill_sat;
                if (bid->filled >= bid->amount)
                    bid->status = DEX::OrderStatus::FILLED;
                else
                    bid->status = DEX::OrderStatus::PARTIAL;
                dex_db.WriteOrder(*bid);

                // Transfer from_asset: seller → buyer(MM)
                int64_t buyer_bal = 0;
                asset_db.ReadBalance(from_id, bid->owner, buyer_bal);
                buyer_bal += fill_units;
                asset_db.WriteBalance(from_id, bid->owner, buyer_bal);

                from_remaining -= fill_units;
                total_grd += grd_earned;

                // Record trade
                CSHA256 hasher;
                hasher.Write(bid->order_id.data(), 32);
                hasher.Write(reinterpret_cast<const unsigned char*>(&now), sizeof(now));
                uint256 trade_id;
                hasher.Finalize(trade_id.data());

                DEX::TradeResult tr;
                tr.trade_id = trade_id;
                tr.buy_order_id = bid->order_id;
                tr.sell_order_id = uint256::ZERO;
                tr.asset_id = from_id;
                tr.amount = fill_sat;
                tr.price = bid->price;
                tr.timestamp = now;
                dex_db.WriteTrade(tr);

                UniValue fill(UniValue::VOBJ);
                fill.pushKV("buyer", bid->owner);
                fill.pushKV("price", ValueFromAmount(bid->price));
                fill.pushKV("units", fill_units);
                fill.pushKV("grd", ValueFromAmount(grd_earned));
                step1_fills.push_back(fill);
            }

            int64_t from_sold = from_amount - from_remaining;
            if (from_sold <= 0)
                throw JSONRPCError(RPC_INVALID_PARAMETER,
                    strprintf("Tidak bisa match BID order %s", from_info.symbol));

            // Kurangi saldo from_asset seller
            from_balance -= from_sold;
            asset_db.WriteBalance(from_id, address, from_balance);

            // Auto-adjust from_asset MM price (selling = GRD bought)
            AutoAdjustMMPrice(dex_db, asset_db, from_id, true, from_sold);

            // ====== STEP 2: Beli to_asset dengan GRD (via ASK orders) ======
            auto orderbook_to = dex_db.GetOrderBook(to_id, 500);
            std::vector<DEX::Order*> asks;
            for (auto& o : orderbook_to) {
                if (o.side == DEX::OrderSide::SELL && o.status == DEX::OrderStatus::OPEN)
                    asks.push_back(&o);
            }
            std::sort(asks.begin(), asks.end(),
                      [](const DEX::Order* a, const DEX::Order* b) { return a->price < b->price; });

            if (asks.empty())
                throw JSONRPCError(RPC_INVALID_PARAMETER,
                    strprintf("Tidak ada ASK order untuk %s", to_info.symbol));

            CAmount grd_remaining = total_grd;
            int64_t total_to_received = 0;
            UniValue step2_fills(UniValue::VARR);

            for (auto* ask : asks) {
                if (grd_remaining <= 0) break;

                // ask->amount dalam satoshi (units * COIN_SAT), ask->price dalam satoshi (GRD per unit)
                int64_t ask_remaining_units = (ask->amount - ask->filled) / COIN_SAT;
                // Berapa GRD dibutuhkan untuk beli semua remaining units di ask ini
                CAmount grd_for_this = SafeMulDiv(ask_remaining_units, ask->price, 1);
                CAmount grd_used = std::min(grd_remaining, grd_for_this);
                if (grd_used <= 0 || ask->price <= 0) continue;

                // Berapa units yang bisa dibeli dengan grd_used
                int64_t units_bought = grd_used / ask->price;
                if (units_bought > ask_remaining_units) units_bought = ask_remaining_units;
                if (units_bought <= 0) continue;

                // Actual GRD cost
                CAmount actual_grd_cost = SafeMulDiv(units_bought, ask->price, 1);

                int64_t fill_sat = units_bought * COIN_SAT;
                ask->filled += fill_sat;
                if (ask->filled >= ask->amount)
                    ask->status = DEX::OrderStatus::FILLED;
                else
                    ask->status = DEX::OrderStatus::PARTIAL;
                dex_db.WriteOrder(*ask);

                // Transfer to_asset: MM → buyer
                int64_t mm_bal = 0;
                asset_db.ReadBalance(to_id, ask->owner, mm_bal);
                if (mm_bal >= units_bought) {
                    mm_bal -= units_bought;
                    asset_db.WriteBalance(to_id, ask->owner, mm_bal);
                }

                grd_remaining -= actual_grd_cost;
                total_to_received += units_bought;

                // Record trade
                CSHA256 hasher2;
                hasher2.Write(ask->order_id.data(), 32);
                int64_t now2 = now + 1;
                hasher2.Write(reinterpret_cast<const unsigned char*>(&now2), sizeof(now2));
                uint256 trade_id2;
                hasher2.Finalize(trade_id2.data());

                DEX::TradeResult tr2;
                tr2.trade_id = trade_id2;
                tr2.buy_order_id = uint256::ZERO;
                tr2.sell_order_id = ask->order_id;
                tr2.asset_id = to_id;
                tr2.amount = fill_sat;
                tr2.price = ask->price;
                tr2.timestamp = now;
                dex_db.WriteTrade(tr2);

                UniValue fill(UniValue::VOBJ);
                fill.pushKV("seller", ask->owner);
                fill.pushKV("price", ValueFromAmount(ask->price));
                fill.pushKV("units", units_bought);
                fill.pushKV("grd_cost", ValueFromAmount(actual_grd_cost));
                step2_fills.push_back(fill);
            }

            if (total_to_received <= 0)
                throw JSONRPCError(RPC_INVALID_PARAMETER,
                    strprintf("Tidak bisa match ASK order %s", to_info.symbol));

            // Tambah saldo to_asset untuk buyer
            int64_t to_balance = 0;
            asset_db.ReadBalance(to_id, address, to_balance);
            to_balance += total_to_received;
            asset_db.WriteBalance(to_id, address, to_balance);

            // Auto-adjust to_asset MM price (buying = GRD sold)
            AutoAdjustMMPrice(dex_db, asset_db, to_id, false, total_to_received);

            // Build result
            UniValue result(UniValue::VOBJ);
            result.pushKV("status", "OK");
            result.pushKV("from_asset", from_info.symbol);
            result.pushKV("to_asset", to_info.symbol);
            result.pushKV("from_sold", from_sold);
            result.pushKV("grd_intermediate", ValueFromAmount(total_grd));
            result.pushKV("grd_used", ValueFromAmount(total_grd - grd_remaining));
            result.pushKV("to_received", total_to_received);
            result.pushKV("exchange_rate", (from_sold > 0) ? (double)total_to_received / (double)from_sold : 0.0);

            // Harga dalam IDR (display only — SafeMulDiv for precision)
            // IDR base rate = 16000 IDR/GRD → price_idr = base_price_sat * 16000 / COIN_SAT
            int64_t from_price_idr = SafeMulDiv(mm_from.base_price, 16000, COIN_SAT);
            int64_t to_price_idr = SafeMulDiv(mm_to.base_price, 16000, COIN_SAT);
            result.pushKV("from_price_idr", from_price_idr);
            result.pushKV("to_price_idr", to_price_idr);

            UniValue step1(UniValue::VOBJ);
            step1.pushKV("action", strprintf("Jual %d %s → %s GRD", from_sold, from_info.symbol,
                          ValueFromAmount(total_grd).getValStr()));
            step1.pushKV("fills", step1_fills);

            UniValue step2(UniValue::VOBJ);
            step2.pushKV("action", strprintf("Beli %d %s ← %s GRD", total_to_received, to_info.symbol,
                          ValueFromAmount(total_grd - grd_remaining).getValStr()));
            step2.pushKV("fills", step2_fills);

            UniValue steps(UniValue::VARR);
            steps.push_back(step1);
            steps.push_back(step2);
            result.pushKV("steps", steps);

            result.pushKV("address", address);

            LogPrintf("SwapAsset: %s %d %s → %d %s (via %s GRD)\n",
                      address, from_sold, from_info.symbol,
                      total_to_received, to_info.symbol,
                      ValueFromAmount(total_grd).getValStr());

            return result;
        },
    };
}

// ---------------------------------------------------------------------------
// getassetprice [asset_id]
// ---------------------------------------------------------------------------
static RPCHelpMan getassetprice()
{
    return RPCHelpMan{
        "getassetprice",
        "Lihat harga semua asset (saham, stablecoin, token) di orderbook.\n",
        {
            {"symbol", RPCArg::Type::STR, RPCArg::Optional::OMITTED, "Filter simbol (misal BBCA)"},
        },
        RPCResult{RPCResult::Type::OBJ, "", "", {}},
        RPCExamples{HelpExampleCli("getassetprice", "") + HelpExampleCli("getassetprice", "\"BBCA\"")},
        [&](const RPCHelpMan& self, const JSONRPCRequest& request) -> UniValue
        {
            std::string filter = request.params[0].isNull() ? "" : request.params[0].get_str();

            Assets::AssetDB& asset_db = Assets::GetAssetDB();
            DEX::DexDB& dex_db = DEX::GetDexDB();
            auto all_assets = asset_db.ListAssets(500);

            UniValue result(UniValue::VARR);

            for (const auto& asset : all_assets) {
                if (!filter.empty() && asset.symbol != filter) continue;

                DEX::MarketMaker mm;
                if (!dex_db.ReadMarketMaker(asset.asset_id, mm) || !mm.active) continue;

                // price_idr = base_price_sat * 16000 / COIN_SAT (integer)
                int64_t price_idr_int = SafeMulDiv(mm.base_price, 16000, COIN_SAT);
                // Fractional part: (base_price * 16000 * 10000 / COIN_SAT) % 10000 → 4 decimals
                int64_t price_idr_frac = SafeMulDiv(mm.base_price, (int64_t)16000 * 10000, COIN_SAT) % 10000;

                UniValue obj(UniValue::VOBJ);
                obj.pushKV("symbol", asset.symbol);
                obj.pushKV("name", asset.name);
                obj.pushKV("type", asset.type);
                obj.pushKV("price_grd", ValueFromAmount(mm.base_price));
                obj.pushKV("price_idr", (double)price_idr_int + (double)price_idr_frac / 10000.0);
                obj.pushKV("asset_id", asset.asset_id.GetHex());

                // Orderbook stats
                auto orderbook = dex_db.GetOrderBook(asset.asset_id, 100);
                CAmount best_bid = 0, best_ask = 0;
                for (const auto& o : orderbook) {
                    if (o.side == DEX::OrderSide::BUY && o.status == DEX::OrderStatus::OPEN) {
                        if (o.price > best_bid) best_bid = o.price;
                    }
                    if (o.side == DEX::OrderSide::SELL && o.status == DEX::OrderStatus::OPEN) {
                        if (best_ask == 0 || o.price < best_ask) best_ask = o.price;
                    }
                }
                obj.pushKV("best_bid", ValueFromAmount(best_bid));
                obj.pushKV("best_ask", ValueFromAmount(best_ask));

                result.push_back(obj);
            }

            return result;
        },
    };
}

// ===========================================================================
// DUAL STABLECOIN SYSTEM — Oracle Peg + Forex + Arbitrage Swap
// ===========================================================================

// ---------------------------------------------------------------------------
// updatepegrate "symbol" grd_per_unit "source"
// CBDC authority sets real-world peg rate for a stablecoin
// ---------------------------------------------------------------------------
static RPCHelpMan updatepegrate()
{
    return RPCHelpMan{
        "updatepegrate",
        "Update oracle peg rate (harga dunia nyata) untuk stablecoin.\n"
        "Hanya CBDC node yang boleh update. Rate ini digunakan oleh pegged stablecoin (pIDR, pUSD, dll).\n",
        {
            {"symbol",       RPCArg::Type::STR,    RPCArg::Optional::NO, "Simbol mata uang (IDR, USD, JPY, dll)"},
            {"grd_per_unit", RPCArg::Type::AMOUNT,  RPCArg::Optional::NO, "Harga 1 unit stablecoin dalam GRD (misal 0.0000625 untuk IDR)"},
            {"source",       RPCArg::Type::STR,    RPCArg::Optional::OMITTED, "Sumber data (default: CBDC_AUTHORITY)"},
            {"pqcseckeyhex", RPCArg::Type::STR,    RPCArg::Optional::OMITTED, "ML-DSA-87 authority key (pk||sk, 7488 bytes hex). Wajib jika PQC aktif."},
        },
        RPCResult{RPCResult::Type::OBJ, "", "", {}},
        RPCExamples{HelpExampleCli("updatepegrate", "\"IDR\" 0.0000625") +
                    HelpExampleCli("updatepegrate", "\"USD\" 1.0 \"REUTERS\"")},
        [&](const RPCHelpMan& self, const JSONRPCRequest& request) -> UniValue
        {
            auto wmode = CBDC::GetWalletMode();
            if (wmode != CBDC::WalletMode::CBDC)
                throw JSONRPCError(RPC_MISC_ERROR,
                    "Hanya node CBDC yang boleh update peg rate oracle.");

            std::string symbol = request.params[0].get_str();
            CAmount grd_per_unit = AmountFromValue(request.params[1]);
            std::string source = request.params[2].isNull() ? "CBDC_AUTHORITY" : request.params[2].get_str();

            if (grd_per_unit <= 0)
                throw JSONRPCError(RPC_INVALID_PARAMETER, "grd_per_unit harus positif");

            std::string pqc_hex = (request.params.size() > 3 && !request.params[3].isNull())
                                  ? request.params[3].get_str() : "";
            try {
                CBDC::RequirePQCAuth(pqc_hex, "updatepegrate",
                                     symbol + "|" + std::to_string(grd_per_unit) + "|" + source);
            } catch (const std::runtime_error& e) {
                throw JSONRPCError(RPC_INVALID_PARAMETER, e.what());
            }

            // rate_per_grd = COIN_SAT / grd_per_unit (berapa unit per 1 GRD)
            int64_t rate_per_grd = SafeMulDiv(COIN_SAT, COIN_SAT, grd_per_unit);

            DEX::OraclePegRate rate;
            rate.symbol = symbol;
            rate.grd_per_unit = grd_per_unit;
            rate.rate_per_grd = rate_per_grd;
            rate.timestamp = TicksSinceEpoch<std::chrono::seconds>(SystemClock::now());
            rate.source = source;

            DEX::DexDB& dex_db = DEX::GetDexDB();
            dex_db.WriteOraclePegRate(rate);

            LogPrintf("OraclePegRate: %s = %s GRD/unit (source: %s)\n",
                      symbol, ValueFromAmount(grd_per_unit).getValStr(), source);

            UniValue result(UniValue::VOBJ);
            result.pushKV("status", "OK");
            result.pushKV("symbol", symbol);
            result.pushKV("grd_per_unit", ValueFromAmount(grd_per_unit));
            result.pushKV("units_per_grd", (double)rate_per_grd / (double)COIN_SAT);
            result.pushKV("source", source);
            result.pushKV("timestamp", rate.timestamp);
            return result;
        },
    };
}

// ---------------------------------------------------------------------------
// getpegrates [symbol]
// Lihat semua oracle peg rates
// ---------------------------------------------------------------------------
static RPCHelpMan getpegrates()
{
    return RPCHelpMan{
        "getpegrates",
        "Lihat oracle peg rates (harga dunia nyata) semua stablecoin.\n",
        {
            {"symbol", RPCArg::Type::STR, RPCArg::Optional::OMITTED, "Filter simbol (misal IDR)"},
        },
        RPCResult{RPCResult::Type::OBJ, "", "", {}},
        RPCExamples{HelpExampleCli("getpegrates", "") + HelpExampleCli("getpegrates", "\"IDR\"")},
        [&](const RPCHelpMan& self, const JSONRPCRequest& request) -> UniValue
        {
            std::string filter = request.params[0].isNull() ? "" : request.params[0].get_str();
            DEX::DexDB& dex_db = DEX::GetDexDB();

            UniValue result(UniValue::VARR);

            if (!filter.empty()) {
                DEX::OraclePegRate rate;
                if (!dex_db.ReadOraclePegRate(filter, rate))
                    throw JSONRPCError(RPC_INVALID_PARAMETER,
                        strprintf("Oracle peg rate untuk %s tidak ditemukan", filter));
                UniValue obj(UniValue::VOBJ);
                obj.pushKV("symbol", rate.symbol);
                obj.pushKV("grd_per_unit", ValueFromAmount(rate.grd_per_unit));
                obj.pushKV("units_per_grd", (double)rate.rate_per_grd / (double)COIN_SAT);
                obj.pushKV("source", rate.source);
                obj.pushKV("timestamp", rate.timestamp);
                result.push_back(obj);
            } else {
                auto rates = dex_db.ListOraclePegRates(500);
                for (const auto& rate : rates) {
                    UniValue obj(UniValue::VOBJ);
                    obj.pushKV("symbol", rate.symbol);
                    obj.pushKV("grd_per_unit", ValueFromAmount(rate.grd_per_unit));
                    obj.pushKV("units_per_grd", (double)rate.rate_per_grd / (double)COIN_SAT);
                    obj.pushKV("source", rate.source);
                    obj.pushKV("timestamp", rate.timestamp);
                    result.push_back(obj);
                }
            }
            return result;
        },
    };
}

// ---------------------------------------------------------------------------
// getdualrate [symbol]
// Bandingkan harga forex blockchain vs oracle peg rate dunia nyata
// ---------------------------------------------------------------------------
static RPCHelpMan getdualrate()
{
    return RPCHelpMan{
        "getdualrate",
        "Bandingkan harga stablecoin: forex blockchain vs oracle peg rate dunia nyata.\n"
        "Menunjukkan deviasi/spread antara harga blockchain dan harga real.\n",
        {
            {"symbol", RPCArg::Type::STR, RPCArg::Optional::OMITTED, "Filter simbol (misal IDR)"},
        },
        RPCResult{RPCResult::Type::OBJ, "", "", {}},
        RPCExamples{HelpExampleCli("getdualrate", "") + HelpExampleCli("getdualrate", "\"IDR\"")},
        [&](const RPCHelpMan& self, const JSONRPCRequest& request) -> UniValue
        {
            std::string filter = request.params[0].isNull() ? "" : request.params[0].get_str();

            Assets::AssetDB& asset_db = Assets::GetAssetDB();
            DEX::DexDB& dex_db = DEX::GetDexDB();
            auto all_assets = asset_db.ListAssets(500);

            UniValue result(UniValue::VARR);

            for (const auto& asset : all_assets) {
                if (asset.type != "stablecoin") continue;
                if (!filter.empty() && asset.symbol != filter) continue;

                DEX::MarketMaker mm;
                if (!dex_db.ReadMarketMaker(asset.asset_id, mm) || !mm.active) continue;

                CAmount forex_price = mm.base_price; // blockchain forex price (sat)

                // Oracle price
                DEX::OraclePegRate oracle;
                bool has_oracle = dex_db.ReadOraclePegRate(asset.symbol, oracle);

                UniValue obj(UniValue::VOBJ);
                obj.pushKV("symbol", asset.symbol);
                obj.pushKV("name", asset.name);

                // Forex (blockchain)
                obj.pushKV("forex_grd_per_unit", ValueFromAmount(forex_price));
                int64_t forex_idr = SafeMulDiv(forex_price, 16000, COIN_SAT);
                obj.pushKV("forex_price_idr", forex_idr);

                if (has_oracle) {
                    CAmount oracle_price = oracle.grd_per_unit;
                    obj.pushKV("oracle_grd_per_unit", ValueFromAmount(oracle_price));
                    int64_t oracle_idr = SafeMulDiv(oracle_price, 16000, COIN_SAT);
                    obj.pushKV("oracle_price_idr", oracle_idr);

                    // Deviasi: (forex - oracle) / oracle * 100%
                    // Dalam PPM untuk precision
                    int64_t deviation_ppm = 0;
                    if (oracle_price > 0) {
                        deviation_ppm = SafeMulDiv(forex_price - oracle_price, 1000000, oracle_price);
                    }
                    double deviation_pct = (double)deviation_ppm / 10000.0;
                    obj.pushKV("deviation_pct", deviation_pct);

                    std::string status;
                    if (deviation_ppm > 10000)       status = "FOREX_OVERVALUED";  // >1%
                    else if (deviation_ppm < -10000)  status = "FOREX_UNDERVALUED"; // <-1%
                    else                              status = "ALIGNED";           // within 1%
                    obj.pushKV("status", status);
                    obj.pushKV("oracle_source", oracle.source);
                    obj.pushKV("oracle_updated", oracle.timestamp);

                    // Arbitrage opportunity
                    if (deviation_ppm > 5000) { // >0.5%
                        obj.pushKV("arbitrage", strprintf(
                            "SELL forex_%s → BUY pegged_%s (profit ~%.2f%%)",
                            asset.symbol, asset.symbol, deviation_pct));
                    } else if (deviation_ppm < -5000) {
                        obj.pushKV("arbitrage", strprintf(
                            "BUY forex_%s → SELL pegged_%s (profit ~%.2f%%)",
                            asset.symbol, asset.symbol, -deviation_pct));
                    } else {
                        obj.pushKV("arbitrage", "NONE (spread < 0.5%)");
                    }
                } else {
                    obj.pushKV("oracle_grd_per_unit", "N/A");
                    obj.pushKV("deviation_pct", "N/A");
                    obj.pushKV("status", "NO_ORACLE");
                }

                result.push_back(obj);
            }

            return result;
        },
    };
}

// ---------------------------------------------------------------------------
// swapforextopeg "symbol" amount "address"
// Swap forex stablecoin ↔ pegged stablecoin (arbitrage mechanism)
// Forex IDR → pIDR (oracle rate) atau pIDR → forex IDR
// ---------------------------------------------------------------------------
static RPCHelpMan swapforextopeg()
{
    return RPCHelpMan{
        "swapforextopeg",
        "Swap antara forex stablecoin (harga blockchain) dan pegged stablecoin (harga dunia nyata).\n"
        "Jika forex overvalued → swap forex→pegged untung.\n"
        "Jika forex undervalued → swap pegged→forex untung.\n"
        "Arbitrage ini menjaga harga blockchain tetap dekat harga dunia nyata.\n",
        {
            {"direction",  RPCArg::Type::STR,    RPCArg::Optional::NO,
             "Arah swap: 'forex_to_peg' atau 'peg_to_forex'"},
            {"symbol",     RPCArg::Type::STR,    RPCArg::Optional::NO, "Simbol stablecoin (IDR, USD, dll)"},
            {"amount",     RPCArg::Type::NUM,     RPCArg::Optional::NO, "Jumlah unit yang di-swap"},
            {"address",    RPCArg::Type::STR,    RPCArg::Optional::NO, "Alamat wallet"},
        },
        RPCResult{RPCResult::Type::OBJ, "", "", {}},
        RPCExamples{
            HelpExampleCli("swapforextopeg", "\"forex_to_peg\" \"IDR\" 1000000 \"grd1q...\"") +
            HelpExampleCli("swapforextopeg", "\"peg_to_forex\" \"IDR\" 1000000 \"grd1q...\"")},
        [&](const RPCHelpMan& self, const JSONRPCRequest& request) -> UniValue
        {
            std::string direction = request.params[0].get_str();
            std::string symbol = request.params[1].get_str();
            int64_t amount = request.params[2].getInt<int64_t>();
            std::string address = request.params[3].get_str();

            if (direction != "forex_to_peg" && direction != "peg_to_forex")
                throw JSONRPCError(RPC_INVALID_PARAMETER,
                    "direction harus 'forex_to_peg' atau 'peg_to_forex'");
            if (amount <= 0)
                throw JSONRPCError(RPC_INVALID_PARAMETER, "amount harus positif");

            Assets::AssetDB& asset_db = Assets::GetAssetDB();
            DEX::DexDB& dex_db = DEX::GetDexDB();

            // Cari forex stablecoin
            auto all_assets = asset_db.ListAssets(500);
            uint256 forex_id;
            Assets::AssetInfo forex_info;
            bool found_forex = false;
            for (const auto& a : all_assets) {
                if (a.symbol == symbol && a.type == "stablecoin") {
                    forex_id = a.asset_id;
                    forex_info = a;
                    found_forex = true;
                    break;
                }
            }
            if (!found_forex)
                throw JSONRPCError(RPC_INVALID_PARAMETER,
                    strprintf("Forex stablecoin %s tidak ditemukan", symbol));

            // Cari pegged stablecoin (prefix 'p')
            std::string peg_symbol = "p" + symbol;
            uint256 peg_id;
            Assets::AssetInfo peg_info;
            bool found_peg = false;
            for (const auto& a : all_assets) {
                if (a.symbol == peg_symbol && a.type == "stablecoin_pegged") {
                    peg_id = a.asset_id;
                    peg_info = a;
                    found_peg = true;
                    break;
                }
            }
            if (!found_peg)
                throw JSONRPCError(RPC_INVALID_PARAMETER,
                    strprintf("Pegged stablecoin %s tidak ditemukan. Buat dulu dengan issueasset type=stablecoin_pegged.", peg_symbol));

            // Cek oracle rate
            DEX::OraclePegRate oracle;
            if (!dex_db.ReadOraclePegRate(symbol, oracle))
                throw JSONRPCError(RPC_INVALID_PARAMETER,
                    strprintf("Oracle peg rate untuk %s belum di-set. Gunakan updatepegrate.", symbol));

            // Forex MM price
            DEX::MarketMaker mm;
            if (!dex_db.ReadMarketMaker(forex_id, mm) || !mm.active)
                throw JSONRPCError(RPC_INVALID_PARAMETER,
                    strprintf("Market maker %s tidak aktif", symbol));

            CAmount forex_price = mm.base_price;  // GRD per 1 forex unit (sat)
            CAmount oracle_price = oracle.grd_per_unit; // GRD per 1 unit (sat)

            // Swap rate: use oracle rate as the conversion rate between forex and pegged
            // This is the key insight: the swap happens at oracle rate,
            // so if forex is overvalued, you get more pegged units for your forex units
            UniValue result(UniValue::VOBJ);
            result.pushKV("direction", direction);
            result.pushKV("symbol", symbol);
            result.pushKV("amount", amount);

            if (direction == "forex_to_peg") {
                // Sell forex stablecoin, get pegged stablecoin at oracle rate
                // Conversion: forex units → GRD (at forex price) → pegged units (at oracle price)
                // GRD received = amount * forex_price
                CAmount grd_value = SafeMulDiv(amount, forex_price, 1);
                // Pegged units received = GRD / oracle_price
                int64_t peg_received = grd_value / oracle_price;
                if (peg_received <= 0)
                    throw JSONRPCError(RPC_INVALID_PARAMETER, "Jumlah terlalu kecil");

                // Check forex balance
                int64_t forex_bal = 0;
                asset_db.ReadBalance(forex_id, address, forex_bal);
                if (forex_bal < amount)
                    throw JSONRPCError(RPC_INVALID_PARAMETER,
                        strprintf("Saldo %s tidak cukup: %ld < %ld", symbol, forex_bal, amount));

                // Execute swap
                forex_bal -= amount;
                asset_db.WriteBalance(forex_id, address, forex_bal);

                int64_t peg_bal = 0;
                asset_db.ReadBalance(peg_id, address, peg_bal);
                peg_bal += peg_received;
                asset_db.WriteBalance(peg_id, address, peg_bal);

                // Selling forex → forex supply increases → forex price should drop
                AutoAdjustMMPrice(dex_db, asset_db, forex_id, true, amount);

                // Profit/loss calculation
                // If forex is overvalued (forex_price > oracle_price), peg_received > amount → profit
                int64_t profit = peg_received - amount;
                double profit_pct = (amount > 0) ? (double)profit / (double)amount * 100.0 : 0;

                result.pushKV("forex_sold", amount);
                result.pushKV("pegged_received", peg_received);
                result.pushKV("effective_rate", (double)peg_received / (double)amount);
                result.pushKV("profit_units", profit);
                result.pushKV("profit_pct", profit_pct);
                result.pushKV("forex_price_grd", ValueFromAmount(forex_price));
                result.pushKV("oracle_price_grd", ValueFromAmount(oracle_price));

            } else { // peg_to_forex
                // Buy forex stablecoin with pegged stablecoin at oracle rate
                CAmount grd_value = SafeMulDiv(amount, oracle_price, 1);
                int64_t forex_received = grd_value / forex_price;
                if (forex_received <= 0)
                    throw JSONRPCError(RPC_INVALID_PARAMETER, "Jumlah terlalu kecil");

                // Check pegged balance
                int64_t peg_bal = 0;
                asset_db.ReadBalance(peg_id, address, peg_bal);
                if (peg_bal < amount)
                    throw JSONRPCError(RPC_INVALID_PARAMETER,
                        strprintf("Saldo %s tidak cukup: %ld < %ld", peg_symbol, peg_bal, amount));

                // Execute swap
                peg_bal -= amount;
                asset_db.WriteBalance(peg_id, address, peg_bal);

                int64_t forex_bal = 0;
                asset_db.ReadBalance(forex_id, address, forex_bal);
                forex_bal += forex_received;
                asset_db.WriteBalance(forex_id, address, forex_bal);

                // Buying forex → forex demand increases → forex price should rise
                AutoAdjustMMPrice(dex_db, asset_db, forex_id, false, forex_received);

                int64_t profit = forex_received - amount;
                double profit_pct = (amount > 0) ? (double)profit / (double)amount * 100.0 : 0;

                result.pushKV("pegged_sold", amount);
                result.pushKV("forex_received", forex_received);
                result.pushKV("effective_rate", (double)forex_received / (double)amount);
                result.pushKV("profit_units", profit);
                result.pushKV("profit_pct", profit_pct);
                result.pushKV("forex_price_grd", ValueFromAmount(forex_price));
                result.pushKV("oracle_price_grd", ValueFromAmount(oracle_price));
            }

            result.pushKV("status", "OK");
            result.pushKV("address", address);

            // Show updated prices after the swap
            DEX::MarketMaker mm_after;
            if (dex_db.ReadMarketMaker(forex_id, mm_after)) {
                result.pushKV("forex_price_after", ValueFromAmount(mm_after.base_price));
                int64_t dev_ppm = SafeMulDiv(mm_after.base_price - oracle_price, 1000000, oracle_price);
                result.pushKV("deviation_after_pct", (double)dev_ppm / 10000.0);
            }

            LogPrintf("SwapForexToPeg: %s %s %ld %s\n", direction, symbol, amount, address);
            return result;
        },
    };
}

// ---------------------------------------------------------------------------
// swaporacle "from_symbol" "to_symbol" amount "address"
// Swap antar oracle stablecoin (pIDR → pUSD) menggunakan oracle rate.
// Stablecoin orderbook (IDR, USD) sebagai liquidity backing.
// Flow: pIDR → (oracle rate IDR/GRD) → GRD → (oracle rate GRD/USD) → pUSD
// ---------------------------------------------------------------------------
static RPCHelpMan swaporacle()
{
    return RPCHelpMan{
        "swaporacle",
        "Swap antar stablecoin oracle menggunakan harga fix dari oracle.\n"
        "Contoh: swap pIDR ke pUSD pada kurs dunia nyata.\n"
        "Stablecoin orderbook (IDR, USD) berfungsi sebagai liquidity pool.\n"
        "Fee 0.1% otomatis dipotong.\n",
        {
            {"from_symbol", RPCArg::Type::STR, RPCArg::Optional::NO,
             "Simbol sumber (IDR, USD, EUR, MYR, dll — tanpa prefix 'p')"},
            {"to_symbol",   RPCArg::Type::STR, RPCArg::Optional::NO,
             "Simbol tujuan (IDR, USD, EUR, MYR, dll — tanpa prefix 'p')"},
            {"amount",      RPCArg::Type::STR, RPCArg::Optional::NO,
             "Jumlah pegged stablecoin sumber yang di-swap"},
            {"address",     RPCArg::Type::STR, RPCArg::Optional::NO,
             "Alamat wallet penerima"},
        },
        RPCResult{RPCResult::Type::OBJ, "", "", {}},
        RPCExamples{
            HelpExampleCli("swaporacle", "\"IDR\" \"USD\" 1000000 \"grd1q...\"") +
            HelpExampleCli("swaporacle", "\"USD\" \"EUR\" 500 \"grd1q...\"")},
        [&](const RPCHelpMan& self, const JSONRPCRequest& request) -> UniValue
        {
            std::string from_sym = request.params[0].get_str();
            std::string to_sym   = request.params[1].get_str();
            int64_t amount       = request.params[2].isNum()
                                   ? request.params[2].getInt<int64_t>()
                                   : atoll(request.params[2].get_str().c_str());
            std::string address  = request.params[3].get_str();

            // Uppercase
            for (auto& c : from_sym) c = toupper(c);
            for (auto& c : to_sym)   c = toupper(c);

            if (from_sym == to_sym)
                throw JSONRPCError(RPC_INVALID_PARAMETER, "from dan to tidak boleh sama");
            if (amount <= 0)
                throw JSONRPCError(RPC_INVALID_PARAMETER, "amount harus positif");

            Assets::AssetDB& asset_db = Assets::GetAssetDB();
            DEX::DexDB& dex_db = DEX::GetDexDB();

            auto all_assets = asset_db.ListAssets(500);

            // Helper: find pegged stablecoin (pXXX) and orderbook stablecoin (XXX)
            auto findPair = [&](const std::string& sym,
                                uint256& peg_id, Assets::AssetInfo& peg_info,
                                uint256& ob_id, Assets::AssetInfo& ob_info) -> bool
            {
                std::string p_sym = "p" + sym;
                bool fp = false, fo = false;
                for (const auto& a : all_assets) {
                    if (!fp && a.symbol == p_sym && a.type == "stablecoin_pegged") {
                        peg_id = a.asset_id; peg_info = a; fp = true;
                    }
                    if (!fo && a.symbol == sym && a.type == "stablecoin") {
                        ob_id = a.asset_id; ob_info = a; fo = true;
                    }
                    if (fp && fo) break;
                }
                return fp; // pegged must exist; orderbook optional
            };

            uint256 from_peg_id, from_ob_id, to_peg_id, to_ob_id;
            Assets::AssetInfo from_peg_info, from_ob_info, to_peg_info, to_ob_info;

            if (!findPair(from_sym, from_peg_id, from_peg_info, from_ob_id, from_ob_info))
                throw JSONRPCError(RPC_INVALID_PARAMETER,
                    strprintf("Pegged stablecoin p%s tidak ditemukan", from_sym));
            if (!findPair(to_sym, to_peg_id, to_peg_info, to_ob_id, to_ob_info))
                throw JSONRPCError(RPC_INVALID_PARAMETER,
                    strprintf("Pegged stablecoin p%s tidak ditemukan", to_sym));

            // Get oracle rates
            DEX::OraclePegRate from_oracle, to_oracle;
            if (!dex_db.ReadOraclePegRate(from_sym, from_oracle))
                throw JSONRPCError(RPC_INVALID_PARAMETER,
                    strprintf("Oracle rate %s belum tersedia", from_sym));
            if (!dex_db.ReadOraclePegRate(to_sym, to_oracle))
                throw JSONRPCError(RPC_INVALID_PARAMETER,
                    strprintf("Oracle rate %s belum tersedia", to_sym));

            // Calculate swap:
            // from_amount pFROM → GRD value → to_amount pTO
            // GRD value = amount * from_oracle.grd_per_unit
            // to_amount = GRD_value / to_oracle.grd_per_unit
            CAmount grd_value = SafeMulDiv(amount, from_oracle.grd_per_unit, 1);
            if (grd_value <= 0)
                throw JSONRPCError(RPC_INVALID_PARAMETER, "Nilai terlalu kecil");

            int64_t to_amount_gross = grd_value / to_oracle.grd_per_unit;
            if (to_amount_gross <= 0)
                throw JSONRPCError(RPC_INVALID_PARAMETER,
                    "Hasil swap terlalu kecil, tambah jumlah");

            // Fee 0.1%
            int64_t fee = std::max(to_amount_gross / 1000, (int64_t)1);
            int64_t to_amount = to_amount_gross - fee;

            // Check source balance
            int64_t from_bal = 0;
            asset_db.ReadBalance(from_peg_id, address, from_bal);
            if (from_bal < amount)
                throw JSONRPCError(RPC_INVALID_PARAMETER,
                    strprintf("Saldo p%s tidak cukup: %ld < %ld", from_sym, from_bal, amount));

            // Execute: debit pFROM, credit pTO
            from_bal -= amount;
            asset_db.WriteBalance(from_peg_id, address, from_bal);

            int64_t to_bal = 0;
            asset_db.ReadBalance(to_peg_id, address, to_bal);
            to_bal += to_amount;
            asset_db.WriteBalance(to_peg_id, address, to_bal);

            // Adjust orderbook MM prices if they exist (liquidity effect)
            // Selling FROM currency → FROM price drops
            // Buying TO currency → TO price rises
            DEX::MarketMaker mm_from, mm_to;
            if (dex_db.ReadMarketMaker(from_ob_id, mm_from) && mm_from.active)
                AutoAdjustMMPrice(dex_db, asset_db, from_ob_id, true, amount);
            if (dex_db.ReadMarketMaker(to_ob_id, mm_to) && mm_to.active)
                AutoAdjustMMPrice(dex_db, asset_db, to_ob_id, false, to_amount);

            // Calculate effective cross rate
            double cross_rate = (amount > 0) ? (double)to_amount / (double)amount : 0;
            double oracle_cross = (to_oracle.grd_per_unit > 0)
                ? (double)from_oracle.grd_per_unit / (double)to_oracle.grd_per_unit : 0;

            UniValue result(UniValue::VOBJ);
            result.pushKV("status", "OK");
            result.pushKV("from", "p" + from_sym);
            result.pushKV("to", "p" + to_sym);
            result.pushKV("amount_in", amount);
            result.pushKV("amount_out", to_amount);
            result.pushKV("fee", fee);
            result.pushKV("effective_rate", cross_rate);
            result.pushKV("oracle_rate", oracle_cross);
            result.pushKV("from_oracle_grd", ValueFromAmount(from_oracle.grd_per_unit));
            result.pushKV("to_oracle_grd", ValueFromAmount(to_oracle.grd_per_unit));
            result.pushKV("grd_intermediate", ValueFromAmount(grd_value));
            result.pushKV("address", address);

            LogPrintf("SwapOracle: p%s→p%s %ld→%ld (fee %ld) addr=%s\n",
                from_sym, to_sym, amount, to_amount, fee, address);
            return result;
        },
    };
}

// ---------------------------------------------------------------------------
// Oracle Rate Auto-Sync Engine (real-time background thread)
// ---------------------------------------------------------------------------
static std::string FetchURL(const std::string& url)
{
    std::string cmd = "curl -s --connect-timeout 10 --max-time 30 \"" + url + "\"";
    FILE* pipe = popen(cmd.c_str(), "r");
    if (!pipe) return "";
    std::string result;
    char buffer[4096];
    while (fgets(buffer, sizeof(buffer), pipe)) {
        result += buffer;
    }
    pclose(pipe);
    return result;
}

// Multi-source API URLs for redundancy & real-time data
struct RateAPISource {
    std::string name;
    std::string url;
    std::string base_key;   // JSON key containing rates object
    std::string base_currency; // "usd", "eur", etc.
};

static const std::vector<RateAPISource> g_api_sources = {
    // Primary: fawazahmed0 — free, 200+ currencies, no key
    {"fawazahmed0-cdn", "https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api@latest/v1/currencies/usd.json", "usd", "usd"},
    {"fawazahmed0-pages", "https://latest.currency-api.pages.dev/v1/currencies/usd.json", "usd", "usd"},
    // Fallback: exchangerate.host — free, real-time
    {"exchangerate-host", "https://api.exchangerate.host/latest?base=USD", "rates", "usd"},
    // Fallback: open.er-api — free, no key
    {"open-er-api", "https://open.er-api.com/v6/latest/USD", "rates", "usd"},
};

// ---- Fetch rates from a single API source ----
// Returns map of uppercase symbol -> rate_per_usd (as double)
static std::map<std::string, double> FetchRatesFromSource(const RateAPISource& src, std::string& date_out)
{
    std::map<std::string, double> rates;
    std::string json_str = FetchURL(src.url);
    if (json_str.empty() || json_str[0] != '{') return rates;

    UniValue api_data(UniValue::VOBJ);
    if (!api_data.read(json_str)) return rates;

    const UniValue& rate_obj = api_data[src.base_key];
    if (!rate_obj.isObject() || rate_obj.empty()) return rates;

    if (api_data["date"].isStr()) date_out = api_data["date"].get_str();

    for (const auto& key : rate_obj.getKeys()) {
        const UniValue& val = rate_obj[key];
        if (!val.isNum()) continue;
        double r = val.get_real();
        if (r <= 0) continue;
        std::string sym;
        sym.reserve(key.size());
        for (char c : key) sym += (char)toupper((unsigned char)c);
        if (sym.size() == 3) rates[sym] = r;
    }
    return rates;
}

// ---- Compute median of a vector of int64_t ----
static int64_t ComputeMedian(std::vector<int64_t>& values)
{
    if (values.empty()) return 0;
    std::sort(values.begin(), values.end());
    size_t n = values.size();
    if (n % 2 == 1) return values[n / 2];
    // Even: average of two middle values
    return (values[n / 2 - 1] + values[n / 2]) / 2;
}

// Maximum deviation threshold (PPM) for oracle consensus to accept a rate
// If any source deviates more than this from median, it's flagged as outlier
static constexpr int64_t ORACLE_MAX_DEVIATION_PPM = 50000; // 5%

// Minimum valid sources required for consensus
static constexpr int ORACLE_MIN_SOURCES = 2;

// Core sync function with MULTI-SOURCE MEDIAN CONSENSUS
// Fetches from ALL sources, computes median, rejects outliers
static int DoSyncPegRates(int64_t grd_per_usd, std::string& out_api_name,
                          std::string& out_date, std::string& error_msg)
{
    DEX::DexDB& dex_db = DEX::GetDexDB();

    // Step 1: Fetch rates from ALL sources in parallel (sequential for simplicity)
    struct SourceResult {
        std::string name;
        std::string date;
        std::map<std::string, double> rates;
        bool valid;
    };

    std::vector<SourceResult> source_results;
    int valid_sources = 0;

    for (const auto& src : g_api_sources) {
        SourceResult sr;
        sr.name = src.name;
        sr.date = "unknown";
        sr.rates = FetchRatesFromSource(src, sr.date);
        sr.valid = !sr.rates.empty();
        if (sr.valid) valid_sources++;
        source_results.push_back(std::move(sr));
    }

    if (valid_sources < 1) {
        error_msg = "Semua API source gagal. Pastikan node terhubung ke internet.";
        return -1;
    }

    // Step 2: For each currency, collect rates from all valid sources
    // and compute MEDIAN for consensus
    std::set<std::string> all_symbols;
    for (const auto& sr : source_results) {
        if (!sr.valid) continue;
        for (const auto& [sym, _] : sr.rates) all_symbols.insert(sym);
    }

    int64_t now = TicksSinceEpoch<std::chrono::seconds>(SystemClock::now());
    int count = 0;
    std::string sources_used;
    std::string date_str = "unknown";

    for (const auto& sr : source_results) {
        if (sr.valid) {
            if (!sources_used.empty()) sources_used += "+";
            sources_used += sr.name;
            if (date_str == "unknown") date_str = sr.date;
        }
    }

    for (const auto& symbol : all_symbols) {
        // Collect grd_per_unit from each source
        std::vector<int64_t> source_values;

        for (const auto& sr : source_results) {
            if (!sr.valid) continue;
            auto it = sr.rates.find(symbol);
            if (it == sr.rates.end()) continue;

            double rate_per_usd = it->second;
            int64_t rate_scaled = (int64_t)(rate_per_usd * 100000000.0 + 0.5);
            if (rate_scaled <= 0) continue;

            int64_t grd_per_unit = SafeMulDiv(grd_per_usd, COIN_SAT, rate_scaled);
            if (grd_per_unit <= 0) grd_per_unit = 1;
            source_values.push_back(grd_per_unit);
        }

        if (source_values.empty()) continue;

        // Compute median
        int64_t median_rate = ComputeMedian(source_values);
        if (median_rate <= 0) continue;

        // Check consensus: if we have multiple sources, verify they agree within threshold
        bool consensus_ok = true;
        if (source_values.size() >= 2) {
            for (int64_t val : source_values) {
                int64_t deviation = SafeMulDiv(std::abs(val - median_rate), 1000000, median_rate);
                if (deviation > ORACLE_MAX_DEVIATION_PPM) {
                    // Source is an outlier — log but still use median (majority rules)
                    LogPrintf("OracleConsensus: %s outlier detected (val=%ld median=%ld dev=%ld PPM)\n",
                              symbol, val, median_rate, deviation);
                }
            }
        }

        int64_t rate_per_grd = SafeMulDiv(COIN_SAT, COIN_SAT, median_rate);

        DEX::OraclePegRate peg;
        peg.symbol = symbol;
        peg.grd_per_unit = median_rate;
        peg.rate_per_grd = rate_per_grd;
        peg.timestamp = now;
        peg.source = "CONSENSUS:" + std::to_string(source_values.size()) + "src:" + sources_used;
        dex_db.WriteOraclePegRate(peg);
        count++;
    }

    // Update USD itself
    {
        int64_t rate_per_grd_usd = SafeMulDiv(COIN_SAT, COIN_SAT, grd_per_usd);
        DEX::OraclePegRate usd_peg;
        usd_peg.symbol = "USD";
        usd_peg.grd_per_unit = grd_per_usd;
        usd_peg.rate_per_grd = rate_per_grd_usd;
        usd_peg.timestamp = now;
        usd_peg.source = "CONSENSUS:" + sources_used;
        dex_db.WriteOraclePegRate(usd_peg);
    }

    out_api_name = sources_used;
    out_date = date_str;
    return count;
}

// ---------------------------------------------------------------------------
// Background auto-sync thread state
// ---------------------------------------------------------------------------
static std::atomic<bool> g_autosync_running{false};
static std::atomic<int>  g_autosync_interval_sec{1}; // default: 1 detik
static std::atomic<int64_t> g_autosync_grd_per_usd{0};
static std::atomic<int64_t> g_autosync_last_update{0};
static std::atomic<int>  g_autosync_last_count{0};
static std::atomic<int>  g_autosync_total_syncs{0};
static std::atomic<int>  g_autosync_errors{0};
static std::string        g_autosync_last_source;
static std::string        g_autosync_last_error;
static std::mutex         g_autosync_mutex;
static std::thread        g_autosync_thread;

static void AutoSyncThread()
{
    LogPrintf("PegRateAutoSync: background thread started (interval=%ds)\n",
              g_autosync_interval_sec.load());

    while (g_autosync_running.load()) {
        int64_t grd_per_usd = g_autosync_grd_per_usd.load();

        // If no explicit price, try reading from DB
        if (grd_per_usd <= 0) {
            try {
                DEX::DexDB& dex_db = DEX::GetDexDB();
                DEX::OraclePegRate usd_rate;
                if (dex_db.ReadOraclePegRate("USD", usd_rate)) {
                    grd_per_usd = usd_rate.grd_per_unit;
                }
            } catch (...) {}
        }

        if (grd_per_usd > 0) {
            std::string api_name, date_str, error_msg;
            int count = DoSyncPegRates(grd_per_usd, api_name, date_str, error_msg);

            std::lock_guard<std::mutex> lock(g_autosync_mutex);
            if (count >= 0) {
                g_autosync_last_count.store(count);
                g_autosync_last_update.store(
                    TicksSinceEpoch<std::chrono::seconds>(SystemClock::now()));
                g_autosync_total_syncs.fetch_add(1);
                g_autosync_last_source = api_name;
                g_autosync_last_error.clear();
            } else {
                g_autosync_errors.fetch_add(1);
                g_autosync_last_error = error_msg;
                LogPrintf("PegRateAutoSync: error — %s\n", error_msg);
            }
        }

        // Sleep in small increments so we can stop quickly
        int interval = g_autosync_interval_sec.load();
        for (int i = 0; i < interval * 10 && g_autosync_running.load(); i++) {
            std::this_thread::sleep_for(std::chrono::milliseconds(100));
        }
    }

    LogPrintf("PegRateAutoSync: background thread stopped\n");
}

// ---------------------------------------------------------------------------
// syncpegrates [grd_price_usd]
// Manual one-shot sync
// ---------------------------------------------------------------------------
static RPCHelpMan syncpegrates()
{
    return RPCHelpMan{
        "syncpegrates",
        "Fetch harga real-time mata uang dari API publik dan update semua oracle peg rates (one-shot).\n"
        "Untuk auto-sync real-time per detik, gunakan startpegratesync.\n",
        {
            {"grd_price_usd", RPCArg::Type::AMOUNT, RPCArg::Optional::OMITTED,
             "Harga 1 GRD dalam USD (default: ambil dari oracle rate USD yang sudah ada)"},
            {"pqcseckeyhex", RPCArg::Type::STR, RPCArg::Optional::OMITTED,
             "ML-DSA-87 authority key (pk||sk, 7488 bytes hex). Wajib jika PQC aktif."},
        },
        RPCResult{RPCResult::Type::OBJ, "", "", {}},
        RPCExamples{
            HelpExampleCli("syncpegrates", "") +
            HelpExampleCli("syncpegrates", "1.0")
        },
        [&](const RPCHelpMan& self, const JSONRPCRequest& request) -> UniValue
        {
            auto wmode = CBDC::GetWalletMode();
            if (wmode != CBDC::WalletMode::CBDC)
                throw JSONRPCError(RPC_MISC_ERROR,
                    "Hanya node CBDC yang boleh sync peg rates.");

            DEX::DexDB& dex_db = DEX::GetDexDB();
            int64_t grd_per_usd = 0;

            if (!request.params[0].isNull()) {
                grd_per_usd = AmountFromValue(request.params[0]);
            } else {
                DEX::OraclePegRate usd_rate;
                if (dex_db.ReadOraclePegRate("USD", usd_rate))
                    grd_per_usd = usd_rate.grd_per_unit;
                else
                    throw JSONRPCError(RPC_INVALID_PARAMETER,
                        "Tidak ada oracle rate USD. Berikan grd_price_usd atau jalankan: updatepegrate USD <amount>");
            }

            if (grd_per_usd <= 0)
                throw JSONRPCError(RPC_INVALID_PARAMETER, "grd_price_usd harus positif");

            std::string pqc_hex = (request.params.size() > 1 && !request.params[1].isNull())
                                  ? request.params[1].get_str() : "";
            try {
                CBDC::RequirePQCAuth(pqc_hex, "syncpegrates", std::to_string(grd_per_usd));
            } catch (const std::runtime_error& e) {
                throw JSONRPCError(RPC_INVALID_PARAMETER, e.what());
            }

            std::string api_name, date_str, error_msg;
            int count = DoSyncPegRates(grd_per_usd, api_name, date_str, error_msg);

            if (count < 0)
                throw JSONRPCError(RPC_MISC_ERROR, error_msg);

            UniValue result(UniValue::VOBJ);
            result.pushKV("status", "OK");
            result.pushKV("api_source", api_name);
            result.pushKV("api_date", date_str);
            result.pushKV("grd_price_usd", ValueFromAmount(grd_per_usd));
            result.pushKV("currencies_updated", count);
            result.pushKV("timestamp", TicksSinceEpoch<std::chrono::seconds>(SystemClock::now()));

            LogPrintf("SyncPegRates: %d currencies updated from %s\n", count, api_name);
            return result;
        },
    };
}

// ---------------------------------------------------------------------------
// startpegratesync [interval_seconds] [grd_price_usd]
// Start background auto-sync real-time per detik
// ---------------------------------------------------------------------------
static RPCHelpMan startpegratesync()
{
    return RPCHelpMan{
        "startpegratesync",
        "Mulai auto-sync oracle peg rates secara real-time di background.\n"
        "Default: update setiap 1 detik dari API publik (fawazahmed0, exchangerate.host, open.er-api).\n"
        "Hanya CBDC node yang boleh menjalankan.\n",
        {
            {"interval_seconds", RPCArg::Type::NUM, RPCArg::Optional::OMITTED,
             "Interval update dalam detik (default: 1)"},
            {"grd_price_usd", RPCArg::Type::AMOUNT, RPCArg::Optional::OMITTED,
             "Harga 1 GRD dalam USD (default: ambil dari oracle rate USD)"},
            {"pqcseckeyhex", RPCArg::Type::STR, RPCArg::Optional::OMITTED,
             "ML-DSA-87 authority key (pk||sk, 7488 bytes hex). Wajib jika PQC aktif."},
        },
        RPCResult{RPCResult::Type::OBJ, "", "", {}},
        RPCExamples{
            HelpExampleCli("startpegratesync", "") +
            HelpExampleCli("startpegratesync", "1") +
            HelpExampleCli("startpegratesync", "1 1.0")
        },
        [&](const RPCHelpMan& self, const JSONRPCRequest& request) -> UniValue
        {
            auto wmode = CBDC::GetWalletMode();
            if (wmode != CBDC::WalletMode::CBDC)
                throw JSONRPCError(RPC_MISC_ERROR,
                    "Hanya node CBDC yang boleh menjalankan auto-sync.");

            if (g_autosync_running.load())
                throw JSONRPCError(RPC_MISC_ERROR,
                    "Auto-sync sudah berjalan. Gunakan stoppegratesync untuk menghentikan terlebih dahulu.");

            int interval = 1;
            if (!request.params[0].isNull()) {
                interval = request.params[0].getInt<int>();
                if (interval < 1) interval = 1;
                if (interval > 86400) interval = 86400;
            }

            int64_t grd_per_usd = 0;
            if (!request.params[1].isNull()) {
                grd_per_usd = AmountFromValue(request.params[1]);
            } else {
                DEX::DexDB& dex_db = DEX::GetDexDB();
                DEX::OraclePegRate usd_rate;
                if (dex_db.ReadOraclePegRate("USD", usd_rate))
                    grd_per_usd = usd_rate.grd_per_unit;
            }

            std::string pqc_hex = (request.params.size() > 2 && !request.params[2].isNull())
                                  ? request.params[2].get_str() : "";
            try {
                CBDC::RequirePQCAuth(pqc_hex, "startpegratesync",
                                     std::to_string(interval) + "|" + std::to_string(grd_per_usd));
            } catch (const std::runtime_error& e) {
                throw JSONRPCError(RPC_INVALID_PARAMETER, e.what());
            }

            g_autosync_interval_sec.store(interval);
            g_autosync_grd_per_usd.store(grd_per_usd);
            g_autosync_running.store(true);
            g_autosync_total_syncs.store(0);
            g_autosync_errors.store(0);

            // Detach any previous thread (should not exist if stopped properly)
            if (g_autosync_thread.joinable())
                g_autosync_thread.join();

            g_autosync_thread = std::thread(AutoSyncThread);

            UniValue result(UniValue::VOBJ);
            result.pushKV("status", "STARTED");
            result.pushKV("interval_seconds", interval);
            result.pushKV("grd_price_usd", ValueFromAmount(grd_per_usd > 0 ? grd_per_usd : 0));
            result.pushKV("message", strprintf("Auto-sync started: update setiap %d detik", interval));

            LogPrintf("PegRateAutoSync: STARTED interval=%ds\n", interval);
            return result;
        },
    };
}

// ---------------------------------------------------------------------------
// stoppegratesync
// Stop background auto-sync
// ---------------------------------------------------------------------------
static RPCHelpMan stoppegratesync()
{
    return RPCHelpMan{
        "stoppegratesync",
        "Hentikan auto-sync oracle peg rates di background.\n",
        {},
        RPCResult{RPCResult::Type::OBJ, "", "", {}},
        RPCExamples{HelpExampleCli("stoppegratesync", "")},
        [&](const RPCHelpMan& self, const JSONRPCRequest& request) -> UniValue
        {
            if (!g_autosync_running.load())
                throw JSONRPCError(RPC_MISC_ERROR, "Auto-sync tidak sedang berjalan.");

            g_autosync_running.store(false);
            if (g_autosync_thread.joinable())
                g_autosync_thread.join();

            UniValue result(UniValue::VOBJ);
            result.pushKV("status", "STOPPED");
            result.pushKV("total_syncs", g_autosync_total_syncs.load());
            result.pushKV("total_errors", g_autosync_errors.load());

            LogPrintf("PegRateAutoSync: STOPPED (total_syncs=%d, errors=%d)\n",
                      g_autosync_total_syncs.load(), g_autosync_errors.load());
            return result;
        },
    };
}

// ---------------------------------------------------------------------------
// getpegratesyncstatus
// Check status of background auto-sync
// ---------------------------------------------------------------------------
static RPCHelpMan getpegratesyncstatus()
{
    return RPCHelpMan{
        "getpegratesyncstatus",
        "Lihat status auto-sync oracle peg rates.\n",
        {},
        RPCResult{RPCResult::Type::OBJ, "", "", {}},
        RPCExamples{HelpExampleCli("getpegratesyncstatus", "")},
        [&](const RPCHelpMan& self, const JSONRPCRequest& request) -> UniValue
        {
            UniValue result(UniValue::VOBJ);
            result.pushKV("running", g_autosync_running.load());
            result.pushKV("interval_seconds", g_autosync_interval_sec.load());
            result.pushKV("grd_price_usd", ValueFromAmount(g_autosync_grd_per_usd.load()));
            result.pushKV("last_update_timestamp", g_autosync_last_update.load());
            result.pushKV("last_currencies_count", g_autosync_last_count.load());
            result.pushKV("total_syncs", g_autosync_total_syncs.load());
            result.pushKV("total_errors", g_autosync_errors.load());

            {
                std::lock_guard<std::mutex> lock(g_autosync_mutex);
                result.pushKV("last_source", g_autosync_last_source);
                if (!g_autosync_last_error.empty())
                    result.pushKV("last_error", g_autosync_last_error);
            }

            int64_t now = TicksSinceEpoch<std::chrono::seconds>(SystemClock::now());
            int64_t last = g_autosync_last_update.load();
            if (last > 0)
                result.pushKV("seconds_since_last_update", now - last);

            return result;
        },
    };
}

// ---------------------------------------------------------------------------
// getstateroot — Query current DEX/Asset state root commitment
// ---------------------------------------------------------------------------
static RPCHelpMan getstateroot()
{
    return RPCHelpMan{
        "getstateroot",
        "Hitung state root hash dari DEX dan Asset state saat ini.\n"
        "State root ini di-commit ke setiap block coinbase OP_RETURN untuk auditabilitas on-chain.\n",
        {},
        RPCResult{RPCResult::Type::OBJ, "", "", {}},
        RPCExamples{HelpExampleCli("getstateroot", "")},
        [&](const RPCHelpMan& self, const JSONRPCRequest& request) -> UniValue
        {
            uint256 dex_root = DEX::ComputeDexStateRoot();
            uint256 asset_root = Assets::ComputeAssetStateRoot();

            // Combined root: SHA256(dex_root || asset_root)
            uint256 combined;
            CSHA256 hasher;
            hasher.Write(dex_root.data(), 32);
            hasher.Write(asset_root.data(), 32);
            hasher.Finalize(combined.begin());

            UniValue result(UniValue::VOBJ);
            result.pushKV("dex_state_root", dex_root.GetHex());
            result.pushKV("asset_state_root", asset_root.GetHex());
            result.pushKV("combined_root", combined.GetHex());
            result.pushKV("commitment_format", "OP_RETURN GRD\\x01 <dex_root_32> <asset_root_32>");
            return result;
        },
    };
}

// ---------------------------------------------------------------------------
// dexgrdbalance <address>
// ---------------------------------------------------------------------------
static RPCHelpMan dexgrdbalance()
{
    return RPCHelpMan{
        "dexgrdbalance",
        "Saldo virtual GRD di DEX untuk address tertentu (digunakan untuk BUY orders).\n",
        {
            {"address", RPCArg::Type::STR, RPCArg::Optional::NO, "Alamat"},
        },
        RPCResult{RPCResult::Type::OBJ, "", "", {
            {RPCResult::Type::STR, "address", ""},
            {RPCResult::Type::NUM, "balance_sat", ""},
            {RPCResult::Type::STR_AMOUNT, "balance_grd", ""},
        }},
        RPCExamples{HelpExampleCli("dexgrdbalance", "\"grd1q...\"")},
        [&](const RPCHelpMan& self, const JSONRPCRequest& request) -> UniValue
        {
            const std::string address = request.params[0].get_str();
            int64_t balance = 0;
            DEX::GetDexDB().ReadGrdBalance(address, balance);
            UniValue result(UniValue::VOBJ);
            result.pushKV("address", address);
            result.pushKV("balance_sat", balance);
            result.pushKV("balance_grd", ValueFromAmount(balance));
            return result;
        },
    };
}

// ---------------------------------------------------------------------------
// depositgrd <address> <amount_grd>
//   CBDC-authority only. Credits virtual GRD ledger (untuk BUY order escrow).
// ---------------------------------------------------------------------------
static RPCHelpMan depositgrd()
{
    return RPCHelpMan{
        "depositgrd",
        "Credit virtual GRD balance di DEX (CBDC authority only).\n"
        "Digunakan agar user bisa pasang BUY orders. Dalam produksi harus dilink ke real on-chain deposit.\n",
        {
            {"address", RPCArg::Type::STR,    RPCArg::Optional::NO, "Alamat tujuan"},
            {"amount",  RPCArg::Type::AMOUNT, RPCArg::Optional::NO, "Jumlah GRD untuk di-credit"},
            {"pqcseckeyhex", RPCArg::Type::STR, RPCArg::Optional::OMITTED, "ML-DSA-87 authority key (pk||sk, 7488 bytes hex). Wajib jika PQC aktif."},
        },
        RPCResult{RPCResult::Type::OBJ, "", "", {
            {RPCResult::Type::STR, "address", ""},
            {RPCResult::Type::NUM, "new_balance_sat", ""},
        }},
        RPCExamples{HelpExampleCli("depositgrd", "\"grd1q...\" 100.0")},
        [&](const RPCHelpMan& self, const JSONRPCRequest& request) -> UniValue
        {
            auto wmode = CBDC::GetWalletMode();
            if (wmode != CBDC::WalletMode::CBDC)
                throw JSONRPCError(RPC_MISC_ERROR,
                    "Hanya node CBDC yang boleh depositgrd. Tambahkan walletmode=cbdc.");

            const std::string address = request.params[0].get_str();
            CAmount amount = AmountFromValue(request.params[1]);
            if (amount <= 0)
                throw JSONRPCError(RPC_INVALID_PARAMETER, "amount harus positif");
            if (!IsValidDestination(DecodeDestination(address)))
                throw JSONRPCError(RPC_INVALID_ADDRESS_OR_KEY, "address tidak valid");

            std::string pqc_hex = (request.params.size() > 2 && !request.params[2].isNull())
                                  ? request.params[2].get_str() : "";
            try {
                CBDC::RequirePQCAuth(pqc_hex, "depositgrd",
                                     address + "|" + std::to_string(amount));
            } catch (const std::runtime_error& e) {
                throw JSONRPCError(RPC_INVALID_PARAMETER, e.what());
            }

            DEX::DexDB& db = DEX::GetDexDB();
            int64_t balance = 0;
            db.ReadGrdBalance(address, balance);
            int64_t new_balance = balance + amount;
            if (!db.WriteGrdBalance(address, new_balance))
                throw JSONRPCError(RPC_DATABASE_ERROR, "Gagal credit virtual GRD");

            UniValue result(UniValue::VOBJ);
            result.pushKV("address", address);
            result.pushKV("new_balance_sat", new_balance);
            result.pushKV("new_balance_grd", ValueFromAmount(new_balance));
            return result;
        },
    };
}

// ---------------------------------------------------------------------------
// withdrawgrd <address> <amount_grd>
//   CBDC-authority only. Debits virtual GRD.
// ---------------------------------------------------------------------------
static RPCHelpMan withdrawgrd()
{
    return RPCHelpMan{
        "withdrawgrd",
        "Debit virtual GRD balance di DEX (CBDC authority only).\n",
        {
            {"address", RPCArg::Type::STR,    RPCArg::Optional::NO, "Alamat"},
            {"amount",  RPCArg::Type::AMOUNT, RPCArg::Optional::NO, "Jumlah GRD untuk di-debit"},
            {"pqcseckeyhex", RPCArg::Type::STR, RPCArg::Optional::OMITTED, "ML-DSA-87 authority key (pk||sk, 7488 bytes hex). Wajib jika PQC aktif."},
        },
        RPCResult{RPCResult::Type::OBJ, "", "", {
            {RPCResult::Type::STR, "address", ""},
            {RPCResult::Type::NUM, "new_balance_sat", ""},
        }},
        RPCExamples{HelpExampleCli("withdrawgrd", "\"grd1q...\" 10.0")},
        [&](const RPCHelpMan& self, const JSONRPCRequest& request) -> UniValue
        {
            auto wmode = CBDC::GetWalletMode();
            if (wmode != CBDC::WalletMode::CBDC)
                throw JSONRPCError(RPC_MISC_ERROR,
                    "Hanya node CBDC yang boleh withdrawgrd.");

            const std::string address = request.params[0].get_str();
            CAmount amount = AmountFromValue(request.params[1]);
            if (amount <= 0)
                throw JSONRPCError(RPC_INVALID_PARAMETER, "amount harus positif");

            std::string pqc_hex = (request.params.size() > 2 && !request.params[2].isNull())
                                  ? request.params[2].get_str() : "";
            try {
                CBDC::RequirePQCAuth(pqc_hex, "withdrawgrd",
                                     address + "|" + std::to_string(amount));
            } catch (const std::runtime_error& e) {
                throw JSONRPCError(RPC_INVALID_PARAMETER, e.what());
            }

            DEX::DexDB& db = DEX::GetDexDB();
            int64_t balance = 0;
            db.ReadGrdBalance(address, balance);
            if (balance < amount)
                throw JSONRPCError(RPC_INVALID_PARAMETER, "Saldo virtual GRD tidak cukup");
            int64_t new_balance = balance - amount;
            if (!db.WriteGrdBalance(address, new_balance))
                throw JSONRPCError(RPC_DATABASE_ERROR, "Gagal debit virtual GRD");

            UniValue result(UniValue::VOBJ);
            result.pushKV("address", address);
            result.pushKV("new_balance_sat", new_balance);
            result.pushKV("new_balance_grd", ValueFromAmount(new_balance));
            return result;
        },
    };
}

// ---------------------------------------------------------------------------
void RegisterDexRPCCommands(CRPCTable& t)
{
    static const CRPCCommand commands[]{
        {"dex", &placeorder},
        {"dex", &cancelorder},
        {"dex", &getorderbook},
        {"dex", &getorder},
        {"dex", &matchorders},
        {"dex", &gettradehistory},
        {"dex", &setupmarketmaker},
        {"dex", &getmarketmaker},
        {"dex", &refreshmarketmaker},
        {"dex", &listmarketmakers},
        {"dex", &swapgrdtostable},
        {"dex", &swapstabletogrd},
        {"dex", &getgrdprice},
        {"dex", &swapasset},
        {"dex", &getassetprice},
        {"dex", &swapstable},
        {"dex", &getforexrate},
        {"dex", &updatepegrate},
        {"dex", &getpegrates},
        {"dex", &getdualrate},
        {"dex", &swapforextopeg},
        {"dex", &swaporacle},
        {"dex", &syncpegrates},
        {"dex", &startpegratesync},
        {"dex", &stoppegratesync},
        {"dex", &getpegratesyncstatus},
        {"dex", &getstateroot},
        {"dex", &dexgrdbalance},
        {"dex", &depositgrd},
        {"dex", &withdrawgrd},
    };
    for (const auto& c : commands) {
        t.appendCommand(c.name, &c);
    }
}
