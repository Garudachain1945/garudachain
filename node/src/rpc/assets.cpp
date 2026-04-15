// Copyright (c) 2026 GarudaChain developers
// RPC: issueasset, transferasset, getassetinfo, getasset, listassets,
//      getassetbalance, listassetholders, mintasset, burnasset,
//      getpeginfo, getassettx, createassetwallet2,
//      declaredividend, getdividendhistory
#include <config/bitcoin-config.h> // IWYU pragma: keep

#include <assets/asset_db.h>
#include <assets/asset_types.h>
#include <dex/dex_db.h>
#include <cbdc/authority.h>
#include <chainparams.h>
#include <consensus/amount.h>
#include <core_io.h>
#include <key_io.h>
#include <node/context.h>
#include <rpc/assets.h>
#include <rpc/server.h>
#include <rpc/server_util.h>
#include <rpc/util.h>
#include <univalue.h>
#include <util/strencodings.h>
#include <util/time.h>
#include <cmath>

using node::NodeContext;

static UniValue AssetToJSON(const Assets::AssetInfo& a)
{
    UniValue obj(UniValue::VOBJ);
    obj.pushKV("asset_id", a.asset_id.GetHex());
    obj.pushKV("name", a.name);
    obj.pushKV("symbol", a.symbol);
    obj.pushKV("type", a.type);
    obj.pushKV("total_supply", a.total_supply);
    obj.pushKV("decimals", a.decimals);
    obj.pushKV("creator", a.creator);
    obj.pushKV("block_height", a.block_height);
    if (!a.peg_currency.empty()) {
        obj.pushKV("peg_rate", (double)a.peg_rate / 100000000.0);
        obj.pushKV("peg_currency", a.peg_currency);
    }
    if (a.face_value > 0) obj.pushKV("face_value", a.face_value);
    if (a.maturity > 0) obj.pushKV("maturity", a.maturity);
    if (a.coupon > 0) obj.pushKV("coupon", a.coupon);
    if (a.nav > 0) obj.pushKV("nav", a.nav);
    return obj;
}

// ---------------------------------------------------------------------------
// issueasset <symbol> <name> <type> <total_supply> <address>
//            [face_value] [maturity] [coupon] [nav] [peg_rate] [peg_currency]
// ---------------------------------------------------------------------------
static RPCHelpMan issueasset()
{
    return RPCHelpMan{
        "issueasset",
        "Terbitkan asset baru (saham/stablecoin/obligasi/token).\n",
        {
            {"symbol",       RPCArg::Type::STR,    RPCArg::Optional::NO,  "Simbol asset (BBRI, IDRT, dll)"},
            {"name",         RPCArg::Type::STR,    RPCArg::Optional::NO,  "Nama asset"},
            {"type",         RPCArg::Type::STR,    RPCArg::Optional::NO,  "Tipe: saham, stablecoin, obligasi, token"},
            {"total_supply", RPCArg::Type::NUM,    RPCArg::Optional::NO,  "Total supply (integer)"},
            {"address",      RPCArg::Type::STR,    RPCArg::Optional::NO,  "Alamat penerbit"},
            {"face_value",   RPCArg::Type::NUM,    RPCArg::Optional::OMITTED, "Face value (obligasi)"},
            {"maturity",     RPCArg::Type::NUM,    RPCArg::Optional::OMITTED, "Maturity timestamp (obligasi)"},
            {"coupon",       RPCArg::Type::NUM,    RPCArg::Optional::OMITTED, "Coupon bps (obligasi)"},
            {"nav",          RPCArg::Type::NUM,    RPCArg::Optional::OMITTED, "NAV (obligasi)"},
            {"peg_rate",     RPCArg::Type::NUM,    RPCArg::Optional::OMITTED, "Peg rate (stablecoin)"},
            {"peg_currency", RPCArg::Type::STR,    RPCArg::Optional::OMITTED, "Peg currency: IDR, USD, etc"},
            {"pqcseckeyhex", RPCArg::Type::STR,    RPCArg::Optional::OMITTED, "ML-DSA-87 authority key (pk||sk, 7488 bytes hex). Wajib jika PQC aktif."},
        },
        RPCResult{
            RPCResult::Type::OBJ, "", "",
            {
                {RPCResult::Type::STR_HEX, "asset_id", "Asset ID"},
                {RPCResult::Type::STR, "opreturn_data", "OP_RETURN hex (untuk broadcast)"},
                {RPCResult::Type::STR, "symbol", "Simbol"},
            }
        },
        RPCExamples{
            HelpExampleCli("issueasset", "\"BBRI\" \"Saham BRI\" \"saham\" 1000000 \"grd1q...\"")
        },
        [&](const RPCHelpMan& self, const JSONRPCRequest& request) -> UniValue
        {
            const std::string symbol = request.params[0].get_str();
            const std::string name = request.params[1].get_str();
            const std::string type = request.params[2].get_str();
            int64_t total_supply = request.params[3].getInt<int64_t>();
            const std::string address = request.params[4].get_str();

            // === KEAMANAN: Hanya CBDC/Creator node yang boleh issue asset ===
            auto wmode = CBDC::GetWalletMode();
            if (wmode != CBDC::WalletMode::CBDC && wmode != CBDC::WalletMode::CREATOR)
                throw JSONRPCError(RPC_MISC_ERROR,
                    "Hanya node CBDC atau Creator yang boleh menerbitkan asset. "
                    "Tambahkan walletmode=cbdc atau walletmode=creator di konfigurasi.");

            if (symbol.empty() || symbol.size() > 12)
                throw JSONRPCError(RPC_INVALID_PARAMETER, "Simbol harus 1-12 karakter");
            if (name.empty() || name.size() > 64)
                throw JSONRPCError(RPC_INVALID_PARAMETER, "Nama harus 1-64 karakter");
            if (total_supply <= 0)
                throw JSONRPCError(RPC_INVALID_PARAMETER, "Total supply harus positif");

            CTxDestination dest = DecodeDestination(address);
            if (!IsValidDestination(dest))
                throw JSONRPCError(RPC_INVALID_ADDRESS_OR_KEY, "Alamat tidak valid");

            uint256 asset_id = Assets::ComputeAssetId(name, symbol, address);
            Assets::AssetDB& db = Assets::GetAssetDB();

            if (db.AssetExists(asset_id))
                throw JSONRPCError(RPC_INVALID_PARAMETER, "Asset sudah ada");

            Assets::AssetInfo info{};
            info.asset_id = asset_id;
            info.name = name;
            info.symbol = symbol;
            info.type = type;
            info.total_supply = total_supply;
            info.decimals = 0;
            info.creator = address;
            info.block_height = 0;
            info.peg_rate = 0;
            info.face_value = 0;
            info.maturity = 0;
            info.coupon = 0;
            info.nav = 0;

            // Optional params
            if (!request.params[5].isNull()) info.face_value = request.params[5].getInt<int64_t>();
            if (!request.params[6].isNull()) info.maturity = request.params[6].getInt<int64_t>();
            if (!request.params[7].isNull()) info.coupon = request.params[7].getInt<int64_t>();
            if (!request.params[8].isNull()) info.nav = request.params[8].getInt<int64_t>();
            if (!request.params[9].isNull()) info.peg_rate = (int64_t)(request.params[9].get_real() * 100000000);
            if (!request.params[10].isNull()) info.peg_currency = request.params[10].get_str();

            std::string pqc_hex = (request.params.size() > 11 && !request.params[11].isNull())
                                  ? request.params[11].get_str() : "";
            try {
                CBDC::RequirePQCAuth(pqc_hex, "issueasset",
                                     symbol + "|" + name + "|" + type + "|" +
                                     std::to_string(total_supply) + "|" + address);
            } catch (const std::runtime_error& e) {
                throw JSONRPCError(RPC_INVALID_PARAMETER, e.what());
            }

            if (!db.WriteAsset(info))
                throw JSONRPCError(RPC_DATABASE_ERROR, "Gagal menulis asset");

            // Seluruh supply ke creator
            if (!db.WriteBalance(asset_id, address, total_supply))
                throw JSONRPCError(RPC_DATABASE_ERROR, "Gagal menulis saldo awal");

            // Log tx
            int64_t now = TicksSinceEpoch<std::chrono::seconds>(SystemClock::now());
            Assets::AssetTxEntry txe{};
            txe.asset_id = asset_id;
            txe.action = "issue";
            txe.from = "";
            txe.to = address;
            txe.amount = total_supply;
            txe.timestamp = now;
            db.WriteAssetTx(txe);

            // Build OP_RETURN data (hex: "ASSET" + symbol + asset_id)
            std::string opreturn_hex;
            {
                std::vector<unsigned char> data;
                // "ASSET" marker
                std::string marker = "ASSET";
                data.insert(data.end(), marker.begin(), marker.end());
                // symbol (padded to 12 bytes)
                std::string sym_padded = symbol;
                sym_padded.resize(12, '\0');
                data.insert(data.end(), sym_padded.begin(), sym_padded.end());
                // asset_id (32 bytes)
                data.insert(data.end(), asset_id.begin(), asset_id.end());
                opreturn_hex = HexStr(data);
            }

            UniValue result(UniValue::VOBJ);
            result.pushKV("asset_id", asset_id.GetHex());
            result.pushKV("opreturn_data", opreturn_hex);
            result.pushKV("symbol", symbol);
            return result;
        },
    };
}

// ---------------------------------------------------------------------------
// transferasset <asset_id> <amount> <from> <to>
// (matches API param order)
// ---------------------------------------------------------------------------
static RPCHelpMan transferasset()
{
    return RPCHelpMan{
        "transferasset",
        "Transfer asset token.\n",
        {
            {"asset_id", RPCArg::Type::STR_HEX, RPCArg::Optional::NO, "Asset ID"},
            {"amount",   RPCArg::Type::NUM,      RPCArg::Optional::NO, "Jumlah (integer)"},
            {"from",     RPCArg::Type::STR,      RPCArg::Optional::NO, "Alamat pengirim"},
            {"to",       RPCArg::Type::STR,      RPCArg::Optional::NO, "Alamat penerima"},
            {"pqcseckeyhex", RPCArg::Type::STR, RPCArg::Optional::OMITTED, "ML-DSA-87 authority key (pk||sk, 7488 bytes hex). Wajib jika PQC aktif."},
        },
        RPCResult{
            RPCResult::Type::OBJ, "", "",
            {
                {RPCResult::Type::STR, "opreturn_data", "OP_RETURN hex"},
            }
        },
        RPCExamples{
            HelpExampleCli("transferasset", "\"<asset_id>\" 1000 \"grd1q...from\" \"grd1q...to\"")
        },
        [&](const RPCHelpMan& self, const JSONRPCRequest& request) -> UniValue
        {
            uint256 asset_id = ParseHashV(request.params[0], "asset_id");
            int64_t amount = request.params[1].getInt<int64_t>();
            const std::string from_addr = request.params[2].get_str();
            const std::string to_addr = request.params[3].get_str();

            if (amount <= 0)
                throw JSONRPCError(RPC_INVALID_PARAMETER, "Amount harus positif");
            if (!IsValidDestination(DecodeDestination(from_addr)))
                throw JSONRPCError(RPC_INVALID_ADDRESS_OR_KEY, "from address tidak valid");
            if (!IsValidDestination(DecodeDestination(to_addr)))
                throw JSONRPCError(RPC_INVALID_ADDRESS_OR_KEY, "to address tidak valid");

            std::string pqc_hex = (request.params.size() > 4 && !request.params[4].isNull())
                                  ? request.params[4].get_str() : "";
            try {
                CBDC::RequirePQCAuth(pqc_hex, "transferasset",
                                     asset_id.GetHex() + "|" + std::to_string(amount) + "|" +
                                     from_addr + "|" + to_addr);
            } catch (const std::runtime_error& e) {
                throw JSONRPCError(RPC_INVALID_PARAMETER, e.what());
            }

            Assets::AssetDB& db = Assets::GetAssetDB();
            Assets::AssetInfo info;
            if (!db.ReadAsset(asset_id, info))
                throw JSONRPCError(RPC_INVALID_PARAMETER, "Asset tidak ditemukan");

            int64_t from_balance = 0;
            db.ReadBalance(asset_id, from_addr, from_balance);
            if (from_balance < amount)
                throw JSONRPCError(RPC_INVALID_PARAMETER, "Saldo tidak cukup");

            int64_t to_balance = 0;
            db.ReadBalance(asset_id, to_addr, to_balance);

            from_balance -= amount;
            to_balance += amount;

            if (!db.WriteBalance(asset_id, from_addr, from_balance))
                throw JSONRPCError(RPC_DATABASE_ERROR, "Gagal update saldo pengirim");
            if (!db.WriteBalance(asset_id, to_addr, to_balance))
                throw JSONRPCError(RPC_DATABASE_ERROR, "Gagal update saldo penerima");

            // Log
            int64_t now = TicksSinceEpoch<std::chrono::seconds>(SystemClock::now());
            Assets::AssetTxEntry txe{};
            txe.asset_id = asset_id;
            txe.action = "transfer";
            txe.from = from_addr;
            txe.to = to_addr;
            txe.amount = amount;
            txe.timestamp = now;
            db.WriteAssetTx(txe);

            // OP_RETURN data
            std::string opreturn_hex;
            {
                std::vector<unsigned char> data;
                std::string marker = "XFER";
                data.insert(data.end(), marker.begin(), marker.end());
                data.insert(data.end(), asset_id.begin(), asset_id.end());
                opreturn_hex = HexStr(data);
            }

            UniValue result(UniValue::VOBJ);
            result.pushKV("opreturn_data", opreturn_hex);
            return result;
        },
    };
}

// ---------------------------------------------------------------------------
// getassetinfo <asset_id>
// ---------------------------------------------------------------------------
static RPCHelpMan getassetinfo()
{
    return RPCHelpMan{
        "getassetinfo",
        "Detail asset.\n",
        {{"asset_id", RPCArg::Type::STR_HEX, RPCArg::Optional::NO, "Asset ID"}},
        RPCResult{RPCResult::Type::ANY, "", ""},
        RPCExamples{HelpExampleCli("getassetinfo", "\"<asset_id>\"")},
        [&](const RPCHelpMan& self, const JSONRPCRequest& request) -> UniValue
        {
            uint256 asset_id = ParseHashV(request.params[0], "asset_id");
            Assets::AssetDB& db = Assets::GetAssetDB();
            Assets::AssetInfo info;
            if (!db.ReadAsset(asset_id, info))
                throw JSONRPCError(RPC_INVALID_PARAMETER, "Asset tidak ditemukan");
            return AssetToJSON(info);
        },
    };
}

// ---------------------------------------------------------------------------
// getasset <asset_id>  (alias — same as getassetinfo, API uses this)
// ---------------------------------------------------------------------------
static RPCHelpMan getasset()
{
    return RPCHelpMan{
        "getasset",
        "Get asset info (alias getassetinfo).\n",
        {{"asset_id", RPCArg::Type::STR_HEX, RPCArg::Optional::NO, "Asset ID"}},
        RPCResult{RPCResult::Type::ANY, "", ""},
        RPCExamples{HelpExampleCli("getasset", "\"<asset_id>\"")},
        [&](const RPCHelpMan& self, const JSONRPCRequest& request) -> UniValue
        {
            uint256 asset_id = ParseHashV(request.params[0], "asset_id");
            Assets::AssetDB& db = Assets::GetAssetDB();
            Assets::AssetInfo info;
            if (!db.ReadAsset(asset_id, info))
                throw JSONRPCError(RPC_INVALID_PARAMETER, "Asset tidak ditemukan");
            return AssetToJSON(info);
        },
    };
}

// ---------------------------------------------------------------------------
// listassets
// ---------------------------------------------------------------------------
static RPCHelpMan listassets()
{
    return RPCHelpMan{
        "listassets",
        "List semua asset.\n",
        {},
        RPCResult{RPCResult::Type::ANY, "", ""},
        RPCExamples{HelpExampleCli("listassets", "")},
        [&](const RPCHelpMan& self, const JSONRPCRequest& request) -> UniValue
        {
            Assets::AssetDB& db = Assets::GetAssetDB();
            auto assets = db.ListAssets(500);
            UniValue result(UniValue::VARR);
            for (const auto& a : assets) {
                result.push_back(AssetToJSON(a));
            }
            return result;
        },
    };
}

// ---------------------------------------------------------------------------
// getassetbalance <address> <asset_id>
// (API param order: address first, then asset_id)
// ---------------------------------------------------------------------------
static RPCHelpMan getassetbalance()
{
    return RPCHelpMan{
        "getassetbalance",
        "Saldo asset untuk alamat.\n",
        {
            {"address",  RPCArg::Type::STR,      RPCArg::Optional::NO, "Alamat wallet"},
            {"asset_id", RPCArg::Type::STR_HEX,  RPCArg::Optional::NO, "Asset ID"},
        },
        RPCResult{RPCResult::Type::ANY, "", ""},
        RPCExamples{HelpExampleCli("getassetbalance", "\"grd1q...\" \"<asset_id>\"")},
        [&](const RPCHelpMan& self, const JSONRPCRequest& request) -> UniValue
        {
            const std::string address = request.params[0].get_str();
            uint256 asset_id = ParseHashV(request.params[1], "asset_id");

            Assets::AssetDB& db = Assets::GetAssetDB();
            int64_t balance = 0;
            db.ReadBalance(asset_id, address, balance);

            UniValue result(UniValue::VOBJ);
            result.pushKV("asset_id", asset_id.GetHex());
            result.pushKV("address", address);
            result.pushKV("balance", balance);
            return result;
        },
    };
}

// ---------------------------------------------------------------------------
// listassetholders <asset_id>
// ---------------------------------------------------------------------------
static RPCHelpMan listassetholders()
{
    return RPCHelpMan{
        "listassetholders",
        "List semua pemegang asset.\n",
        {{"asset_id", RPCArg::Type::STR_HEX, RPCArg::Optional::NO, "Asset ID"}},
        RPCResult{RPCResult::Type::ANY, "", ""},
        RPCExamples{HelpExampleCli("listassetholders", "\"<asset_id>\"")},
        [&](const RPCHelpMan& self, const JSONRPCRequest& request) -> UniValue
        {
            uint256 asset_id = ParseHashV(request.params[0], "asset_id");
            Assets::AssetDB& db = Assets::GetAssetDB();
            auto holders = db.ListHolders(asset_id, 500);

            UniValue result(UniValue::VARR);
            for (const auto& h : holders) {
                UniValue obj(UniValue::VOBJ);
                obj.pushKV("address", h.address);
                obj.pushKV("balance", h.balance);
                result.push_back(obj);
            }
            return result;
        },
    };
}

// ---------------------------------------------------------------------------
// mintasset <asset_id> <amount>
// Mint tambahan supply (stablecoin/token). Diberikan ke creator.
// ---------------------------------------------------------------------------
static RPCHelpMan mintasset()
{
    return RPCHelpMan{
        "mintasset",
        "Mint tambahan supply asset (stablecoin).\n",
        {
            {"asset_id", RPCArg::Type::STR_HEX, RPCArg::Optional::NO, "Asset ID"},
            {"amount",   RPCArg::Type::NUM,      RPCArg::Optional::NO, "Jumlah mint (integer)"},
            {"pqcseckeyhex", RPCArg::Type::STR, RPCArg::Optional::OMITTED, "ML-DSA-87 authority key (pk||sk, 7488 bytes hex). Wajib jika PQC aktif."},
        },
        RPCResult{RPCResult::Type::ANY, "", ""},
        RPCExamples{HelpExampleCli("mintasset", "\"<asset_id>\" 1000000")},
        [&](const RPCHelpMan& self, const JSONRPCRequest& request) -> UniValue
        {
            // === KEAMANAN: Hanya CBDC node yang boleh mint ===
            auto wmode = CBDC::GetWalletMode();
            if (wmode != CBDC::WalletMode::CBDC)
                throw JSONRPCError(RPC_MISC_ERROR,
                    "Hanya node CBDC yang boleh mint asset. "
                    "Tidak bisa cetak uang modal dengkul! "
                    "Tambahkan walletmode=cbdc di konfigurasi.");

            uint256 asset_id = ParseHashV(request.params[0], "asset_id");
            int64_t amount = request.params[1].getInt<int64_t>();
            if (amount <= 0)
                throw JSONRPCError(RPC_INVALID_PARAMETER, "Amount harus positif");

            std::string pqc_hex = (request.params.size() > 2 && !request.params[2].isNull())
                                  ? request.params[2].get_str() : "";
            try {
                CBDC::RequirePQCAuth(pqc_hex, "mintasset",
                                     asset_id.GetHex() + "|" + std::to_string(amount));
            } catch (const std::runtime_error& e) {
                throw JSONRPCError(RPC_INVALID_PARAMETER, e.what());
            }

            Assets::AssetDB& db = Assets::GetAssetDB();
            Assets::AssetInfo info;
            if (!db.ReadAsset(asset_id, info))
                throw JSONRPCError(RPC_INVALID_PARAMETER, "Asset tidak ditemukan");

            // Update supply
            info.total_supply += amount;
            if (!db.WriteAsset(info))
                throw JSONRPCError(RPC_DATABASE_ERROR, "Gagal update asset");

            // Add to creator balance
            int64_t creator_bal = 0;
            db.ReadBalance(asset_id, info.creator, creator_bal);
            creator_bal += amount;
            if (!db.WriteBalance(asset_id, info.creator, creator_bal))
                throw JSONRPCError(RPC_DATABASE_ERROR, "Gagal update saldo creator");

            // Log
            int64_t now = TicksSinceEpoch<std::chrono::seconds>(SystemClock::now());
            Assets::AssetTxEntry txe{};
            txe.asset_id = asset_id;
            txe.action = "mint";
            txe.to = info.creator;
            txe.amount = amount;
            txe.timestamp = now;
            db.WriteAssetTx(txe);

            // OP_RETURN
            std::string opreturn_hex;
            {
                std::vector<unsigned char> data;
                std::string marker = "MINT";
                data.insert(data.end(), marker.begin(), marker.end());
                data.insert(data.end(), asset_id.begin(), asset_id.end());
                opreturn_hex = HexStr(data);
            }

            UniValue result(UniValue::VOBJ);
            result.pushKV("op_return_hex", opreturn_hex);
            result.pushKV("new_supply", info.total_supply);
            result.pushKV("symbol", info.symbol);
            return result;
        },
    };
}

// ---------------------------------------------------------------------------
// burnasset <asset_id> <amount> <address>
// ---------------------------------------------------------------------------
static RPCHelpMan burnasset()
{
    return RPCHelpMan{
        "burnasset",
        "Burn (hapus) supply asset dari alamat tertentu.\n",
        {
            {"asset_id", RPCArg::Type::STR_HEX, RPCArg::Optional::NO, "Asset ID"},
            {"amount",   RPCArg::Type::NUM,      RPCArg::Optional::NO, "Jumlah burn (integer)"},
            {"address",  RPCArg::Type::STR,      RPCArg::Optional::NO, "Alamat yang di-burn"},
            {"pqcseckeyhex", RPCArg::Type::STR, RPCArg::Optional::OMITTED, "ML-DSA-87 authority key (pk||sk, 7488 bytes hex). Wajib jika PQC aktif."},
        },
        RPCResult{RPCResult::Type::ANY, "", ""},
        RPCExamples{HelpExampleCli("burnasset", "\"<asset_id>\" 500000 \"grd1q...\"")},
        [&](const RPCHelpMan& self, const JSONRPCRequest& request) -> UniValue
        {
            uint256 asset_id = ParseHashV(request.params[0], "asset_id");
            int64_t amount = request.params[1].getInt<int64_t>();
            const std::string address = request.params[2].get_str();

            if (amount <= 0)
                throw JSONRPCError(RPC_INVALID_PARAMETER, "Amount harus positif");

            std::string pqc_hex = (request.params.size() > 3 && !request.params[3].isNull())
                                  ? request.params[3].get_str() : "";
            try {
                CBDC::RequirePQCAuth(pqc_hex, "burnasset",
                                     asset_id.GetHex() + "|" + std::to_string(amount) + "|" + address);
            } catch (const std::runtime_error& e) {
                throw JSONRPCError(RPC_INVALID_PARAMETER, e.what());
            }

            Assets::AssetDB& db = Assets::GetAssetDB();
            Assets::AssetInfo info;
            if (!db.ReadAsset(asset_id, info))
                throw JSONRPCError(RPC_INVALID_PARAMETER, "Asset tidak ditemukan");

            // Check balance
            int64_t balance = 0;
            db.ReadBalance(asset_id, address, balance);
            if (balance < amount)
                throw JSONRPCError(RPC_INVALID_PARAMETER, "Saldo tidak cukup untuk burn");

            // Update
            balance -= amount;
            info.total_supply -= amount;
            if (!db.WriteBalance(asset_id, address, balance))
                throw JSONRPCError(RPC_DATABASE_ERROR, "Gagal update saldo");
            if (!db.WriteAsset(info))
                throw JSONRPCError(RPC_DATABASE_ERROR, "Gagal update supply");

            // Log
            int64_t now = TicksSinceEpoch<std::chrono::seconds>(SystemClock::now());
            Assets::AssetTxEntry txe{};
            txe.asset_id = asset_id;
            txe.action = "burn";
            txe.from = address;
            txe.amount = amount;
            txe.timestamp = now;
            db.WriteAssetTx(txe);

            // OP_RETURN
            std::string opreturn_hex;
            {
                std::vector<unsigned char> data;
                std::string marker = "BURN";
                data.insert(data.end(), marker.begin(), marker.end());
                data.insert(data.end(), asset_id.begin(), asset_id.end());
                opreturn_hex = HexStr(data);
            }

            UniValue result(UniValue::VOBJ);
            result.pushKV("op_return_hex", opreturn_hex);
            result.pushKV("new_supply", info.total_supply);
            result.pushKV("burned", amount);
            result.pushKV("symbol", info.symbol);
            return result;
        },
    };
}

// ---------------------------------------------------------------------------
// getpeginfo <asset_id>
// ---------------------------------------------------------------------------
static RPCHelpMan getpeginfo()
{
    return RPCHelpMan{
        "getpeginfo",
        "Info peg stablecoin.\n",
        {{"asset_id", RPCArg::Type::STR_HEX, RPCArg::Optional::NO, "Asset ID"}},
        RPCResult{RPCResult::Type::ANY, "", ""},
        RPCExamples{HelpExampleCli("getpeginfo", "\"<asset_id>\"")},
        [&](const RPCHelpMan& self, const JSONRPCRequest& request) -> UniValue
        {
            uint256 asset_id = ParseHashV(request.params[0], "asset_id");
            Assets::AssetDB& db = Assets::GetAssetDB();
            Assets::AssetInfo info;
            if (!db.ReadAsset(asset_id, info))
                throw JSONRPCError(RPC_INVALID_PARAMETER, "Asset tidak ditemukan");

            UniValue result(UniValue::VOBJ);
            result.pushKV("asset_id", asset_id.GetHex());
            result.pushKV("symbol", info.symbol);
            result.pushKV("type", info.type);
            result.pushKV("peg_rate", (double)info.peg_rate / 100000000.0);
            result.pushKV("peg_currency", info.peg_currency);
            result.pushKV("total_supply", info.total_supply);
            result.pushKV("creator", info.creator);
            return result;
        },
    };
}

// ---------------------------------------------------------------------------
// getassettx <asset_id> [count]
// ---------------------------------------------------------------------------
static RPCHelpMan getassettx()
{
    return RPCHelpMan{
        "getassettx",
        "Histori transaksi asset.\n",
        {
            {"asset_id", RPCArg::Type::STR_HEX, RPCArg::Optional::NO, "Asset ID"},
            {"count",    RPCArg::Type::NUM,      RPCArg::Optional::OMITTED, "Max entries (default 500)"},
        },
        RPCResult{RPCResult::Type::ANY, "", ""},
        RPCExamples{HelpExampleCli("getassettx", "\"<asset_id>\" 100")},
        [&](const RPCHelpMan& self, const JSONRPCRequest& request) -> UniValue
        {
            uint256 asset_id = ParseHashV(request.params[0], "asset_id");
            size_t count = 500;
            if (!request.params[1].isNull())
                count = (size_t)request.params[1].getInt<int>();

            Assets::AssetDB& db = Assets::GetAssetDB();
            auto txs = db.GetAssetTxHistory(asset_id, count);

            UniValue result(UniValue::VARR);
            for (const auto& tx : txs) {
                UniValue obj(UniValue::VOBJ);
                obj.pushKV("action", tx.action);
                obj.pushKV("from", tx.from);
                obj.pushKV("to", tx.to);
                obj.pushKV("amount", tx.amount);
                obj.pushKV("timestamp", tx.timestamp);
                if (!tx.txid.empty()) obj.pushKV("txid", tx.txid);
                result.push_back(obj);
            }
            return result;
        },
    };
}

// ---------------------------------------------------------------------------
// createassetwallet2 <address> <wallet_type>
// Register address as a specific wallet type
// ---------------------------------------------------------------------------
static RPCHelpMan createassetwallet2()
{
    return RPCHelpMan{
        "createassetwallet2",
        "Register alamat wallet dengan tipe tertentu.\n",
        {
            {"address",     RPCArg::Type::STR, RPCArg::Optional::NO, "Alamat wallet"},
            {"wallet_type", RPCArg::Type::STR, RPCArg::Optional::NO, "Tipe: cbdc, creator, miner, public, semua"},
            {"pqcseckeyhex", RPCArg::Type::STR, RPCArg::Optional::OMITTED, "ML-DSA-87 authority key (pk||sk, 7488 bytes hex). Wajib jika PQC aktif."},
        },
        RPCResult{RPCResult::Type::ANY, "", ""},
        RPCExamples{HelpExampleCli("createassetwallet2", "\"grd1q...\" \"creator\"")},
        [&](const RPCHelpMan& self, const JSONRPCRequest& request) -> UniValue
        {
            const std::string address = request.params[0].get_str();
            const std::string wallet_type = request.params[1].get_str();

            std::string pqc_hex = (request.params.size() > 2 && !request.params[2].isNull())
                                  ? request.params[2].get_str() : "";
            try {
                CBDC::RequirePQCAuth(pqc_hex, "createassetwallet2", address + "|" + wallet_type);
            } catch (const std::runtime_error& e) {
                throw JSONRPCError(RPC_INVALID_PARAMETER, e.what());
            }

            Assets::AssetDB& db = Assets::GetAssetDB();
            if (!db.WriteWalletType(address, wallet_type))
                throw JSONRPCError(RPC_DATABASE_ERROR, "Gagal register wallet");

            UniValue result(UniValue::VOBJ);
            result.pushKV("address", address);
            result.pushKV("wallet_type", wallet_type);
            result.pushKV("status", "registered");
            return result;
        },
    };
}

// ---------------------------------------------------------------------------
// declaredividend <asset_id> <total_dividend> <issuer_address>
// ---------------------------------------------------------------------------
static RPCHelpMan declaredividend()
{
    return RPCHelpMan{
        "declaredividend",
        "Deklarasikan pembagian dividen untuk saham.\n",
        {
            {"asset_id",       RPCArg::Type::STR_HEX, RPCArg::Optional::NO, "Asset ID saham"},
            {"total_dividend", RPCArg::Type::NUM,      RPCArg::Optional::NO, "Total GRD dividen (integer)"},
            {"issuer_address", RPCArg::Type::STR,      RPCArg::Optional::NO, "Alamat issuer"},
            {"pqcseckeyhex",   RPCArg::Type::STR,      RPCArg::Optional::OMITTED, "ML-DSA-87 authority key (pk||sk, 7488 bytes hex). Wajib jika PQC aktif."},
        },
        RPCResult{RPCResult::Type::ANY, "", ""},
        RPCExamples{HelpExampleCli("declaredividend", "\"<asset_id>\" 1000000 \"grd1q...\"")},
        [&](const RPCHelpMan& self, const JSONRPCRequest& request) -> UniValue
        {
            uint256 asset_id = ParseHashV(request.params[0], "asset_id");
            int64_t total_dividend = request.params[1].getInt<int64_t>();
            const std::string issuer = request.params[2].get_str();

            if (total_dividend <= 0)
                throw JSONRPCError(RPC_INVALID_PARAMETER, "total_dividend harus positif");

            std::string pqc_hex = (request.params.size() > 3 && !request.params[3].isNull())
                                  ? request.params[3].get_str() : "";
            try {
                CBDC::RequirePQCAuth(pqc_hex, "declaredividend",
                                     asset_id.GetHex() + "|" + std::to_string(total_dividend) + "|" + issuer);
            } catch (const std::runtime_error& e) {
                throw JSONRPCError(RPC_INVALID_PARAMETER, e.what());
            }

            Assets::AssetDB& db = Assets::GetAssetDB();
            Assets::AssetInfo info;
            if (!db.ReadAsset(asset_id, info))
                throw JSONRPCError(RPC_INVALID_PARAMETER, "Asset tidak ditemukan");

            // Get holders
            auto holders = db.ListHolders(asset_id, 10000);
            if (holders.empty())
                throw JSONRPCError(RPC_INVALID_PARAMETER, "Tidak ada holder");

            // Calculate total tokens held
            int64_t total_held = 0;
            for (const auto& h : holders) total_held += h.balance;
            if (total_held <= 0)
                throw JSONRPCError(RPC_INVALID_PARAMETER, "Total balance holder = 0");

            // Build distribution list
            UniValue distributions(UniValue::VARR);
            for (const auto& h : holders) {
                if (h.balance <= 0) continue;
                // Pro-rata dividend
                int64_t share = (int64_t)((double)h.balance / (double)total_held * (double)total_dividend);
                if (share <= 0) continue;

                UniValue dist(UniValue::VOBJ);
                dist.pushKV("address", h.address);
                dist.pushKV("tokens", h.balance);
                dist.pushKV("dividend_grd", share);
                distributions.push_back(dist);
            }

            // Save record
            int64_t now = TicksSinceEpoch<std::chrono::seconds>(SystemClock::now());
            Assets::DividendRecord rec{};
            rec.asset_id = asset_id;
            rec.total_dividend = total_dividend;
            rec.issuer = issuer;
            rec.timestamp = now;
            rec.num_holders = (int32_t)holders.size();
            db.WriteDividend(rec);

            // Log
            Assets::AssetTxEntry txe{};
            txe.asset_id = asset_id;
            txe.action = "dividend";
            txe.from = issuer;
            txe.amount = total_dividend;
            txe.timestamp = now;
            db.WriteAssetTx(txe);

            UniValue result(UniValue::VOBJ);
            result.pushKV("asset_id", asset_id.GetHex());
            result.pushKV("symbol", info.symbol);
            result.pushKV("total_dividend", total_dividend);
            result.pushKV("num_holders", (int)holders.size());
            result.pushKV("distributions", distributions);
            return result;
        },
    };
}

// ---------------------------------------------------------------------------
// getdividendhistory <asset_id>
// ---------------------------------------------------------------------------
static RPCHelpMan getdividendhistory()
{
    return RPCHelpMan{
        "getdividendhistory",
        "Histori dividen asset.\n",
        {{"asset_id", RPCArg::Type::STR_HEX, RPCArg::Optional::NO, "Asset ID"}},
        RPCResult{RPCResult::Type::ANY, "", ""},
        RPCExamples{HelpExampleCli("getdividendhistory", "\"<asset_id>\"")},
        [&](const RPCHelpMan& self, const JSONRPCRequest& request) -> UniValue
        {
            uint256 asset_id = ParseHashV(request.params[0], "asset_id");
            Assets::AssetDB& db = Assets::GetAssetDB();
            auto history = db.GetDividendHistory(asset_id, 100);

            UniValue result(UniValue::VARR);
            for (const auto& rec : history) {
                UniValue obj(UniValue::VOBJ);
                obj.pushKV("asset_id", rec.asset_id.GetHex());
                obj.pushKV("total_dividend", rec.total_dividend);
                obj.pushKV("issuer", rec.issuer);
                obj.pushKV("timestamp", rec.timestamp);
                obj.pushKV("num_holders", rec.num_holders);
                result.push_back(obj);
            }
            return result;
        },
    };
}

// ---------------------------------------------------------------------------
// getwalletassets
// Mengembalikan semua asset yang dimiliki di wallet ini (balance > 0).
// Digunakan oleh Qt GUI untuk menampilkan Kepemilikan Token.
// ---------------------------------------------------------------------------
static RPCHelpMan getwalletassets()
{
    return RPCHelpMan{
        "getwalletassets",
        "List semua asset (saham/stablecoin) yang dimiliki wallet ini.\n",
        {},
        RPCResult{RPCResult::Type::ANY, "", ""},
        RPCExamples{HelpExampleCli("getwalletassets", "")},
        [&](const RPCHelpMan& self, const JSONRPCRequest& request) -> UniValue
        {
            Assets::AssetDB& db = Assets::GetAssetDB();
            auto assets = db.ListAssets(500);
            UniValue result(UniValue::VARR);

            for (const auto& asset : assets) {
                auto holders = db.ListHolders(asset.asset_id, 500);
                for (const auto& h : holders) {
                    if (h.balance <= 0) continue;

                    double bal = (double)h.balance / std::pow(10, asset.decimals);
                    char buf[64];
                    std::snprintf(buf, sizeof(buf), "%.*f", asset.decimals, bal);

                    UniValue obj(UniValue::VOBJ);
                    obj.pushKV("asset_id", asset.asset_id.GetHex());
                    obj.pushKV("symbol", asset.symbol);
                    obj.pushKV("name", asset.name);
                    obj.pushKV("type", asset.type);
                    obj.pushKV("balance", std::string(buf));
                    obj.pushKV("address", h.address);
                    obj.pushKV("balance_raw", h.balance);
                    if (!asset.peg_currency.empty()) {
                        obj.pushKV("peg_currency", asset.peg_currency);
                        obj.pushKV("peg_rate", (double)asset.peg_rate / 1e8);
                    }
                    result.push_back(obj);
                }
            }
            return result;
        },
    };
}

// ---------------------------------------------------------------------------
// deleteasset "asset_id"
// ---------------------------------------------------------------------------
static RPCHelpMan deleteasset()
{
    return RPCHelpMan{"deleteasset",
        "Delete an asset from the AssetDB by asset_id.\n",
        {
            {"asset_id", RPCArg::Type::STR_HEX, RPCArg::Optional::NO, "The asset id (hex)"},
            {"pqcseckeyhex", RPCArg::Type::STR, RPCArg::Optional::OMITTED, "ML-DSA-87 authority key (pk||sk, 7488 bytes hex). Wajib jika PQC aktif."},
        },
        RPCResult{RPCResult::Type::BOOL, "", "true if deleted"},
        RPCExamples{HelpExampleCli("deleteasset", "\"abc123...\"")},
        [&](const RPCHelpMan& self, const JSONRPCRequest& request) -> UniValue
        {
            uint256 asset_id = ParseHashV(request.params[0], "asset_id");

            std::string pqc_hex = (request.params.size() > 1 && !request.params[1].isNull())
                                  ? request.params[1].get_str() : "";
            try {
                CBDC::RequirePQCAuth(pqc_hex, "deleteasset", asset_id.GetHex());
            } catch (const std::runtime_error& e) {
                throw JSONRPCError(RPC_INVALID_PARAMETER, e.what());
            }

            auto& db = Assets::GetAssetDB();
            if (!db.AssetExists(asset_id)) {
                throw JSONRPCError(RPC_INVALID_PARAMETER, "Asset not found");
            }
            if (!db.DeleteAsset(asset_id)) {
                throw JSONRPCError(RPC_DATABASE_ERROR, "Failed to delete asset");
            }
            return true;
        },
    };
}

// ---------------------------------------------------------------------------
// issuepegged — Otomatis buat semua stablecoin oracle (tipe stablecoin_pegged)
// Baca oracle rates, untuk setiap mata uang buat token p{SYMBOL}
// ---------------------------------------------------------------------------
static RPCHelpMan issuepegged()
{
    return RPCHelpMan{
        "issuepegged",
        "Buat stablecoin oracle (stablecoin_pegged) untuk semua mata uang di oracle.\n"
        "Otomatis membuat token p{SYMBOL} untuk setiap rate di oracle yang belum punya token pegged.\n"
        "Hanya node CBDC yang boleh menjalankan perintah ini.\n",
        {
            {"address",      RPCArg::Type::STR, RPCArg::Optional::NO, "Alamat penerbit/creator"},
            {"total_supply", RPCArg::Type::NUM, RPCArg::Optional::OMITTED, "Total supply per token (default: 999999999999999)"},
            {"pqcseckeyhex", RPCArg::Type::STR, RPCArg::Optional::OMITTED, "ML-DSA-87 authority key (pk||sk, 7488 bytes hex). Wajib jika PQC aktif."},
        },
        RPCResult{RPCResult::Type::OBJ, "", "",
            {
                {RPCResult::Type::NUM, "created", "Jumlah token baru yang dibuat"},
                {RPCResult::Type::NUM, "skipped", "Jumlah yang sudah ada (dilewati)"},
                {RPCResult::Type::ARR, "tokens", "Daftar token yang dibuat",
                    {{RPCResult::Type::OBJ, "", "",
                        {
                            {RPCResult::Type::STR, "symbol", "Simbol token"},
                            {RPCResult::Type::STR_HEX, "asset_id", "Asset ID"},
                        }
                    }}
                },
            }
        },
        RPCExamples{
            HelpExampleCli("issuepegged", "\"grd1q...\"") +
            HelpExampleCli("issuepegged", "\"grd1q...\" 1000000000")
        },
        [&](const RPCHelpMan& self, const JSONRPCRequest& request) -> UniValue
        {
            // Hanya CBDC node
            auto wmode = CBDC::GetWalletMode();
            if (wmode != CBDC::WalletMode::CBDC)
                throw JSONRPCError(RPC_MISC_ERROR,
                    "Hanya node CBDC yang boleh membuat stablecoin oracle. "
                    "Tambahkan walletmode=cbdc di konfigurasi.");

            const std::string address = request.params[0].get_str();
            int64_t total_supply = 999999999999999LL; // default ~999 triliun
            if (!request.params[1].isNull())
                total_supply = request.params[1].getInt<int64_t>();

            std::string pqc_hex = (request.params.size() > 2 && !request.params[2].isNull())
                                  ? request.params[2].get_str() : "";
            try {
                CBDC::RequirePQCAuth(pqc_hex, "issuepegged",
                                     address + "|" + std::to_string(total_supply));
            } catch (const std::runtime_error& e) {
                throw JSONRPCError(RPC_INVALID_PARAMETER, e.what());
            }

            CTxDestination dest = DecodeDestination(address);
            if (!IsValidDestination(dest))
                throw JSONRPCError(RPC_INVALID_ADDRESS_OR_KEY, "Alamat tidak valid");

            Assets::AssetDB& asset_db = Assets::GetAssetDB();
            DEX::DexDB& dex_db = DEX::GetDexDB();

            // Ambil semua oracle rates
            auto oracle_rates = dex_db.ListOraclePegRates(500);
            if (oracle_rates.empty())
                throw JSONRPCError(RPC_INVALID_PARAMETER,
                    "Tidak ada oracle rate. Gunakan updatepegrate terlebih dahulu.");

            // Ambil semua asset yang sudah ada
            auto existing_assets = asset_db.ListAssets(1000);
            std::set<std::string> existing_symbols;
            for (const auto& a : existing_assets) {
                existing_symbols.insert(a.symbol);
            }

            int created = 0;
            int skipped = 0;
            UniValue tokens(UniValue::VARR);
            int64_t now = TicksSinceEpoch<std::chrono::seconds>(SystemClock::now());

            for (const auto& rate : oracle_rates) {
                std::string peg_symbol = "p" + rate.symbol;

                // Skip jika sudah ada
                if (existing_symbols.count(peg_symbol) > 0) {
                    skipped++;
                    continue;
                }

                // Buat nama yang deskriptif
                std::string peg_name = "Pegged " + rate.symbol + " (Oracle)";

                uint256 asset_id = Assets::ComputeAssetId(peg_name, peg_symbol, address);

                // Cek duplikat asset_id
                if (asset_db.AssetExists(asset_id)) {
                    skipped++;
                    continue;
                }

                Assets::AssetInfo info{};
                info.asset_id = asset_id;
                info.name = peg_name;
                info.symbol = peg_symbol;
                info.type = "stablecoin_pegged";
                info.total_supply = total_supply;
                info.decimals = 0;
                info.creator = address;
                info.block_height = 0;
                info.peg_rate = rate.grd_per_unit;
                info.peg_currency = rate.symbol;
                info.face_value = 0;
                info.maturity = 0;
                info.coupon = 0;
                info.nav = 0;

                if (!asset_db.WriteAsset(info))
                    continue; // skip failed writes

                // Seluruh supply ke creator
                asset_db.WriteBalance(asset_id, address, total_supply);

                // Log tx
                Assets::AssetTxEntry txe{};
                txe.asset_id = asset_id;
                txe.action = "issue";
                txe.from = "";
                txe.to = address;
                txe.amount = total_supply;
                txe.timestamp = now;
                asset_db.WriteAssetTx(txe);

                UniValue tok(UniValue::VOBJ);
                tok.pushKV("symbol", peg_symbol);
                tok.pushKV("asset_id", asset_id.GetHex());
                tok.pushKV("peg_currency", rate.symbol);
                tokens.push_back(tok);

                created++;
            }

            UniValue result(UniValue::VOBJ);
            result.pushKV("created", created);
            result.pushKV("skipped", skipped);
            result.pushKV("total_oracle_rates", (int)oracle_rates.size());
            result.pushKV("tokens", tokens);
            return result;
        },
    };
}

// ---------------------------------------------------------------------------
void RegisterAssetRPCCommands(CRPCTable& t)
{
    static const CRPCCommand commands[]{
        {"assets", &issueasset},
        {"assets", &transferasset},
        {"assets", &getassetinfo},
        {"assets", &getasset},
        {"assets", &listassets},
        {"assets", &getassetbalance},
        {"assets", &listassetholders},
        {"assets", &mintasset},
        {"assets", &burnasset},
        {"assets", &getpeginfo},
        {"assets", &getassettx},
        {"assets", &createassetwallet2},
        {"assets", &declaredividend},
        {"assets", &getdividendhistory},
        {"assets", &getwalletassets},
        {"assets", &deleteasset},
        {"assets", &issuepegged},
    };
    for (const auto& c : commands) {
        t.appendCommand(c.name, &c);
    }
}
