// Copyright (c) 2026 GarudaChain developers
// APBN (Anggaran Pendapatan Belanja Negara) — auto fee distribution
#pragma once

#include <string>

namespace APBN {

// APBN treasury address (menerima 30% fee dari setiap block)
static const std::string APBN_ADDRESS = "grd1qyqt42h2pkld0waalz63ykayaj353uzzlwzuq7p";

// Persentase fee ke APBN (30%)
static constexpr int FEE_PERCENT = 30;

// Minimum balance sebelum auto-forward ke market maker (100 sat)
static constexpr int64_t MIN_FORWARD_AMOUNT = 100;

// Forward APBN funds ke semua active market maker.
// Dipanggil otomatis setelah block baru ditambang.
// Mengembalikan jumlah GRD yang di-forward (satoshi), atau 0 jika gagal/belum cukup.
// Membutuhkan wallet context (request harus punya wallet loaded).
int64_t AutoForwardToMarketMakers(const std::string& wallet_uri, void* context);

} // namespace APBN
