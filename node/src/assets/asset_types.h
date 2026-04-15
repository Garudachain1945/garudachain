// Copyright (c) 2026 GarudaChain developers
// Asset tokenization — data structures
#pragma once

#include <serialize.h>
#include <uint256.h>

#include <cstdint>
#include <string>
#include <vector>

namespace Assets {

// Tx version untuk ASSET_ISSUE
static constexpr int32_t ASSET_ISSUE_VERSION = 4;
// Tx version untuk ASSET_TRANSFER
static constexpr int32_t ASSET_TRANSFER_VERSION = 5;

// Marker prevout hash untuk ASSET_ISSUE
static const uint256 ASSET_ISSUE_MARKER = uint256{
    "a55e710000000000000000000000000000000000000000000000000000000000"};

struct AssetInfo {
    uint256 asset_id;
    std::string name;           // "Saham BRI"
    std::string symbol;         // "BBRI"
    std::string type;           // "saham", "stablecoin", "obligasi", "token"
    int64_t total_supply;       // satoshi (1e8)
    int32_t decimals;           // 0-8
    std::string creator;        // alamat penerbit
    int64_t block_height;       // block saat diterbitkan

    // Stablecoin peg fields
    int64_t peg_rate;           // satoshi: 1000.0 disimpan sebagai 100000000000
    std::string peg_currency;   // "IDR", "USD", etc.

    // Obligasi/SBN fields
    int64_t face_value;
    int64_t maturity;           // unix timestamp
    int64_t coupon;             // basis points
    int64_t nav;                // net asset value

    SERIALIZE_METHODS(AssetInfo, obj) {
        READWRITE(obj.asset_id, obj.name, obj.symbol, obj.type,
                  obj.total_supply, obj.decimals, obj.creator,
                  obj.block_height, obj.peg_rate, obj.peg_currency,
                  obj.face_value, obj.maturity, obj.coupon, obj.nav);
    }
};

// Saldo asset per alamat
struct AssetBalance {
    uint256 asset_id;
    std::string address;
    int64_t balance;

    SERIALIZE_METHODS(AssetBalance, obj) {
        READWRITE(obj.asset_id, obj.address, obj.balance);
    }
};

// Dividend record
struct DividendRecord {
    uint256 asset_id;
    int64_t total_dividend;     // total GRD dibagikan
    std::string issuer;         // alamat issuer
    int64_t timestamp;
    int32_t num_holders;        // jumlah holder saat distribusi

    SERIALIZE_METHODS(DividendRecord, obj) {
        READWRITE(obj.asset_id, obj.total_dividend, obj.issuer,
                  obj.timestamp, obj.num_holders);
    }
};

// Asset transaction log entry
struct AssetTxEntry {
    uint256 asset_id;
    std::string action;         // "issue", "transfer", "mint", "burn", "dividend"
    std::string from;
    std::string to;
    int64_t amount;
    int64_t timestamp;
    std::string txid;           // on-chain txid jika ada

    SERIALIZE_METHODS(AssetTxEntry, obj) {
        READWRITE(obj.asset_id, obj.action, obj.from, obj.to,
                  obj.amount, obj.timestamp, obj.txid);
    }
};

// Compute asset_id = SHA256(name + symbol + creator)
uint256 ComputeAssetId(const std::string& name, const std::string& symbol,
                       const std::string& creator);

} // namespace Assets
