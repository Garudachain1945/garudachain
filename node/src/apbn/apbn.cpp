// Copyright (c) 2026 GarudaChain developers
#include <apbn/apbn.h>

#include <dex/dex_db.h>
#include <dex/dex_types.h>
#include <rpc/server.h>
#include <rpc/request.h>
#include <univalue.h>
#include <logging.h>
#include <util/strencodings.h>

namespace APBN {

int64_t AutoForwardToMarketMakers(const std::string& wallet_uri, void* context)
{
    // 1. Cek saldo APBN via listunspent
    JSONRPCRequest list_req;
    list_req.context = *(std::any*)context;
    list_req.strMethod = "listunspent";
    list_req.params = UniValue(UniValue::VARR);
    list_req.params.push_back(1);    // minconf
    list_req.params.push_back(9999999); // maxconf
    UniValue addr_filter(UniValue::VARR);
    addr_filter.push_back(APBN_ADDRESS);
    list_req.params.push_back(addr_filter);
    list_req.URI = wallet_uri;

    UniValue utxos;
    try {
        utxos = tableRPC.execute(list_req);
    } catch (...) {
        LogPrintf("APBN: gagal listunspent untuk %s\n", APBN_ADDRESS);
        return 0;
    }

    if (!utxos.isArray() || utxos.size() == 0) return 0;

    // Hitung total balance APBN
    int64_t total_sat = 0;
    for (size_t i = 0; i < utxos.size(); ++i) {
        const auto& u = utxos[i];
        double amount = u["amount"].get_real();
        total_sat += (int64_t)(amount * 100000000.0);
    }

    if (total_sat < MIN_FORWARD_AMOUNT) return 0;

    // 2. Ambil daftar market maker aktif
    DEX::DexDB& dex_db = DEX::GetDexDB();
    auto mms = dex_db.ListMarketMakers(200);
    if (mms.empty()) {
        LogPrintf("APBN: tidak ada market maker aktif, dana tetap di APBN\n");
        return 0;
    }

    // Hitung jumlah MM aktif
    int active_count = 0;
    for (const auto& mm : mms) {
        if (mm.active) ++active_count;
    }
    if (active_count == 0) return 0;

    // Bagi rata ke semua MM (kurangi sedikit untuk fee tx)
    int64_t fee_reserve = 200; // reserve untuk fee tx
    int64_t distributable = total_sat - fee_reserve;
    if (distributable <= 0) return 0;

    int64_t per_mm = distributable / active_count;
    if (per_mm < 1) return 0;

    // 3. Kirim ke setiap MM via sendtoaddress
    int64_t total_forwarded = 0;

    // Kumpulkan semua MM addresses unik
    std::map<std::string, int64_t> mm_amounts;
    for (const auto& mm : mms) {
        if (!mm.active) continue;
        mm_amounts[mm.mm_address] += per_mm;
    }

    // Kirim via sendtoaddress (semua MM punya 1 address)
    // Aggregate total ke 1 address
    std::string mm_addr;
    int64_t total_amount = 0;
    for (const auto& [addr, amount] : mm_amounts) {
        mm_addr = addr;
        total_amount += amount;
    }

    JSONRPCRequest send_req;
    send_req.context = *(std::any*)context;
    send_req.strMethod = "sendtoaddress";
    send_req.params = UniValue(UniValue::VARR);
    send_req.params.push_back(mm_addr);
    char amount_str[32];
    snprintf(amount_str, sizeof(amount_str), "%.8f", (double)total_amount / 100000000.0);
    send_req.params.push_back(amount_str);
    send_req.URI = wallet_uri;

    try {
        UniValue result = tableRPC.execute(send_req);
        std::string txid = result.get_str();
        total_forwarded = total_amount;
        LogPrintf("APBN: auto-forward %d sat ke %d market maker(s), txid=%s\n",
                  total_forwarded, (int)mm_amounts.size(), txid);
    } catch (const UniValue& e) {
        LogPrintf("APBN: gagal forward ke MM: %s\n", e["message"].get_str());
        return 0;
    } catch (...) {
        LogPrintf("APBN: gagal forward ke MM (unknown error)\n");
        return 0;
    }

    return total_forwarded;
}

} // namespace APBN
