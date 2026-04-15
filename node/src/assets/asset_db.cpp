// Copyright (c) 2026 GarudaChain developers
#include <assets/asset_db.h>

#include <crypto/sha256.h>
#include <logging.h>
#include <serialize.h>
#include <streams.h>

#include <cassert>

namespace Assets {

// DB key prefixes
static constexpr uint8_t DB_ASSET   = 'A'; // 'A' + asset_id -> AssetInfo
static constexpr uint8_t DB_BALANCE = 'B'; // 'B' + asset_id + address -> int64_t
static constexpr uint8_t DB_DIVID   = 'D'; // 'D' + asset_id + timestamp -> DividendRecord
static constexpr uint8_t DB_ATXLOG  = 'T'; // 'T' + asset_id + timestamp -> AssetTxEntry
static constexpr uint8_t DB_WTYPE   = 'W'; // 'W' + address -> string (wallet type)

// ---------------------------------------------------------------------------
// ComputeAssetId
// ---------------------------------------------------------------------------
uint256 ComputeAssetId(const std::string& name, const std::string& symbol,
                       const std::string& creator)
{
    CSHA256 hasher;
    hasher.Write(reinterpret_cast<const unsigned char*>(name.data()), name.size());
    hasher.Write(reinterpret_cast<const unsigned char*>(symbol.data()), symbol.size());
    hasher.Write(reinterpret_cast<const unsigned char*>(creator.data()), creator.size());
    uint256 result;
    hasher.Finalize(result.data());
    return result;
}

// ---------------------------------------------------------------------------
// AssetDB
// ---------------------------------------------------------------------------
AssetDB::AssetDB(const fs::path& path, size_t cache_size)
{
    DBParams params{
        .path = path,
        .cache_bytes = cache_size,
    };
    m_db = std::make_unique<CDBWrapper>(params);
    LogPrintf("AssetDB opened at %s\n", fs::PathToString(path));
}

AssetDB::~AssetDB() = default;

// --- Asset CRUD ---

bool AssetDB::WriteAsset(const AssetInfo& asset)
{
    auto key = std::make_pair(DB_ASSET, asset.asset_id);
    return m_db->Write(key, asset);
}

bool AssetDB::ReadAsset(const uint256& asset_id, AssetInfo& asset) const
{
    auto key = std::make_pair(DB_ASSET, asset_id);
    return m_db->Read(key, asset);
}

bool AssetDB::AssetExists(const uint256& asset_id) const
{
    auto key = std::make_pair(DB_ASSET, asset_id);
    return m_db->Exists(key);
}

bool AssetDB::DeleteAsset(const uint256& asset_id)
{
    auto key = std::make_pair(DB_ASSET, asset_id);
    return m_db->Erase(key);
}

std::vector<AssetInfo> AssetDB::ListAssets(size_t max_count) const
{
    std::vector<AssetInfo> result;
    auto it = m_db->NewIterator();
    auto prefix = std::make_pair(DB_ASSET, uint256::ZERO);
    it->Seek(prefix);

    while (it->Valid() && result.size() < max_count) {
        std::pair<uint8_t, uint256> key;
        if (!it->GetKey(key) || key.first != DB_ASSET)
            break;
        AssetInfo info;
        if (it->GetValue(info)) {
            result.push_back(std::move(info));
        }
        it->Next();
    }
    return result;
}

// --- Balance ---

bool AssetDB::WriteBalance(const uint256& asset_id, const std::string& address,
                           int64_t balance)
{
    auto key = std::make_pair(DB_BALANCE, std::make_pair(asset_id, address));
    return m_db->Write(key, balance);
}

bool AssetDB::ReadBalance(const uint256& asset_id, const std::string& address,
                          int64_t& balance) const
{
    auto key = std::make_pair(DB_BALANCE, std::make_pair(asset_id, address));
    return m_db->Read(key, balance);
}

std::vector<AssetBalance> AssetDB::ListHolders(const uint256& asset_id,
                                                size_t max_count) const
{
    std::vector<AssetBalance> result;
    auto it = m_db->NewIterator();
    auto prefix = std::make_pair(DB_BALANCE, std::make_pair(asset_id, std::string{}));
    it->Seek(prefix);

    while (it->Valid() && result.size() < max_count) {
        std::pair<uint8_t, std::pair<uint256, std::string>> key;
        if (!it->GetKey(key) || key.first != DB_BALANCE ||
            key.second.first != asset_id)
            break;
        int64_t bal{0};
        if (it->GetValue(bal) && bal > 0) {
            AssetBalance ab;
            ab.asset_id = asset_id;
            ab.address = key.second.second;
            ab.balance = bal;
            result.push_back(std::move(ab));
        }
        it->Next();
    }
    return result;
}

// --- Dividend ---

bool AssetDB::WriteDividend(const DividendRecord& rec)
{
    auto key = std::make_pair(DB_DIVID, std::make_pair(rec.asset_id, rec.timestamp));
    return m_db->Write(key, rec);
}

std::vector<DividendRecord> AssetDB::GetDividendHistory(const uint256& asset_id,
                                                         size_t max_count) const
{
    std::vector<DividendRecord> result;
    auto it = m_db->NewIterator();
    auto prefix = std::make_pair(DB_DIVID, std::make_pair(asset_id, int64_t{0}));
    it->Seek(prefix);

    while (it->Valid() && result.size() < max_count) {
        std::pair<uint8_t, std::pair<uint256, int64_t>> key;
        if (!it->GetKey(key) || key.first != DB_DIVID ||
            key.second.first != asset_id)
            break;
        DividendRecord rec;
        if (it->GetValue(rec)) {
            result.push_back(std::move(rec));
        }
        it->Next();
    }
    return result;
}

// --- Asset Tx Log ---

bool AssetDB::WriteAssetTx(const AssetTxEntry& entry)
{
    auto key = std::make_pair(DB_ATXLOG, std::make_pair(entry.asset_id, entry.timestamp));
    return m_db->Write(key, entry);
}

std::vector<AssetTxEntry> AssetDB::GetAssetTxHistory(const uint256& asset_id,
                                                      size_t max_count) const
{
    std::vector<AssetTxEntry> result;
    auto it = m_db->NewIterator();
    auto prefix = std::make_pair(DB_ATXLOG, std::make_pair(asset_id, int64_t{0}));
    it->Seek(prefix);

    while (it->Valid() && result.size() < max_count) {
        std::pair<uint8_t, std::pair<uint256, int64_t>> key;
        if (!it->GetKey(key) || key.first != DB_ATXLOG ||
            key.second.first != asset_id)
            break;
        AssetTxEntry entry;
        if (it->GetValue(entry)) {
            result.push_back(std::move(entry));
        }
        it->Next();
    }
    return result;
}

// --- Wallet Type ---

bool AssetDB::WriteWalletType(const std::string& address, const std::string& wallet_type)
{
    auto key = std::make_pair(DB_WTYPE, address);
    return m_db->Write(key, wallet_type);
}

bool AssetDB::ReadWalletType(const std::string& address, std::string& wallet_type) const
{
    auto key = std::make_pair(DB_WTYPE, address);
    return m_db->Read(key, wallet_type);
}

// ---------------------------------------------------------------------------
// Global instance
// ---------------------------------------------------------------------------
static std::unique_ptr<AssetDB> g_asset_db;

AssetDB& GetAssetDB()
{
    assert(g_asset_db);
    return *g_asset_db;
}

void InitAssetDB(const fs::path& datadir)
{
    g_asset_db = std::make_unique<AssetDB>(datadir / "assets");
}

void ShutdownAssetDB()
{
    g_asset_db.reset();
}

// ---- State Root: SHA256 hash of all Asset state for on-chain commitment ----
uint256 ComputeAssetStateRoot()
{
    AssetDB& db = GetAssetDB();
    CSHA256 hasher;

    // Hash all registered assets (sorted by asset_id for determinism)
    auto assets = db.ListAssets(1000);
    std::sort(assets.begin(), assets.end(),
              [](const AssetInfo& a, const AssetInfo& b) {
                  return a.asset_id < b.asset_id;
              });

    for (const auto& asset : assets) {
        hasher.Write(asset.asset_id.data(), 32);
        hasher.Write((const unsigned char*)asset.symbol.data(), asset.symbol.size());
        uint8_t buf[8];
        for (int i = 0; i < 8; i++) buf[i] = (uint8_t)(asset.total_supply >> (i * 8));
        hasher.Write(buf, 8);
    }

    uint256 result;
    hasher.Finalize(result.begin());
    return result;
}

} // namespace Assets
