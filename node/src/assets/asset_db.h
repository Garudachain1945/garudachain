// Copyright (c) 2026 GarudaChain developers
// Asset registry — LevelDB backed
#pragma once

#include <assets/asset_types.h>
#include <dbwrapper.h>
#include <uint256.h>
#include <util/fs.h>

#include <memory>
#include <string>
#include <vector>

namespace Assets {

class AssetDB {
public:
    explicit AssetDB(const fs::path& path, size_t cache_size = (1 << 20));
    ~AssetDB();

    // Asset CRUD
    bool WriteAsset(const AssetInfo& asset);
    bool ReadAsset(const uint256& asset_id, AssetInfo& asset) const;
    bool AssetExists(const uint256& asset_id) const;
    bool DeleteAsset(const uint256& asset_id);
    std::vector<AssetInfo> ListAssets(size_t max_count = 500) const;

    // Balance per address per asset
    bool WriteBalance(const uint256& asset_id, const std::string& address, int64_t balance);
    bool ReadBalance(const uint256& asset_id, const std::string& address, int64_t& balance) const;
    std::vector<AssetBalance> ListHolders(const uint256& asset_id, size_t max_count = 500) const;

    // Dividend records
    bool WriteDividend(const DividendRecord& rec);
    std::vector<DividendRecord> GetDividendHistory(const uint256& asset_id, size_t max_count = 100) const;

    // Asset transaction log
    bool WriteAssetTx(const AssetTxEntry& entry);
    std::vector<AssetTxEntry> GetAssetTxHistory(const uint256& asset_id, size_t max_count = 500) const;

    // Wallet type registry (address -> wallet type)
    bool WriteWalletType(const std::string& address, const std::string& wallet_type);
    bool ReadWalletType(const std::string& address, std::string& wallet_type) const;

private:
    std::unique_ptr<CDBWrapper> m_db;
};

// Global instance
AssetDB& GetAssetDB();
void InitAssetDB(const fs::path& datadir);
void ShutdownAssetDB();

// ---- State root for on-chain commitment ----
// Computes SHA256 hash of all asset registrations + balances.
uint256 ComputeAssetStateRoot();

} // namespace Assets
