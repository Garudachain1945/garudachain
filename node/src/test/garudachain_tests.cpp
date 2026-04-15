// Copyright (c) 2026 GarudaChain developers
// Unit tests for GarudaChain custom features:
// - CBDC Authority (configurable keys, replay protection, fee enforcement)
// - ML-DSA-87 Post-Quantum Cryptography
// - DEX types and oracle peg rates
// - Integer arithmetic (SafeMulDiv)

#include <cbdc/authority.h>
#include <crypto/pqc/ml_dsa87.h>
#include <crypto/sha256.h>
#include <dex/dex_types.h>
#include <primitives/transaction.h>
#include <script/script.h>
#include <test/util/setup_common.h>
#include <uint256.h>
#include <util/strencodings.h>

#include <boost/test/unit_test.hpp>

#include <array>
#include <cstring>
#include <stdexcept>
#include <string>
#include <utility>
#include <vector>

// SafeMulDiv is defined in rpc/dex.cpp — replicate for testing
static int64_t TestSafeMulDiv(int64_t a, int64_t b, int64_t divisor)
{
    if (divisor == 0) return 0;
    __int128 prod = (__int128)a * (__int128)b;
    return (int64_t)(prod / (__int128)divisor);
}

static constexpr int64_t TEST_COIN_SAT = 100000000LL;

// ======================================================================
// Suite: SafeMulDiv integer arithmetic
// ======================================================================
BOOST_AUTO_TEST_SUITE(garudachain_safemuldiv_tests)

BOOST_AUTO_TEST_CASE(basic_multiplication)
{
    // 100 * 200 / 400 = 50
    BOOST_CHECK_EQUAL(TestSafeMulDiv(100, 200, 400), 50);
}

BOOST_AUTO_TEST_CASE(large_values_no_overflow)
{
    // 1B GRD * 1e8 / 1e8 = 1B GRD (tests __int128 prevents overflow)
    int64_t one_billion_sat = 100000000000000000LL; // 1B * 1e8
    BOOST_CHECK_EQUAL(TestSafeMulDiv(one_billion_sat, TEST_COIN_SAT, TEST_COIN_SAT), one_billion_sat);
}

BOOST_AUTO_TEST_CASE(division_by_zero_returns_zero)
{
    BOOST_CHECK_EQUAL(TestSafeMulDiv(1000, 2000, 0), 0);
}

BOOST_AUTO_TEST_CASE(idr_price_calculation)
{
    // 1 GRD = 16000 IDR → grd_per_unit_IDR = 1e8 / 16000 = 6250 sat
    int64_t grd_per_usd = TEST_COIN_SAT; // 1 GRD = 1 USD
    int64_t rate_idr_per_usd = 16000LL * TEST_COIN_SAT; // scaled by 1e8
    int64_t grd_per_idr = TestSafeMulDiv(grd_per_usd, TEST_COIN_SAT, rate_idr_per_usd);
    BOOST_CHECK_EQUAL(grd_per_idr, 6250);
}

BOOST_AUTO_TEST_CASE(spread_ppm_calculation)
{
    // 50 bps spread: half_spread_ppm = 50 * 50 = 2500
    // level_offset_ppm for level 0 = 2500 * 1000 / 1000 = 2500
    int64_t half_spread_ppm = 50LL * 50;
    int64_t level_offset_ppm = half_spread_ppm * 1000 / 1000;
    BOOST_CHECK_EQUAL(level_offset_ppm, 2500);

    // price at level 0: base * (1000000 - 2500) / 1000000
    int64_t base_price = TEST_COIN_SAT;
    int64_t bid_price = TestSafeMulDiv(base_price, 1000000 - level_offset_ppm, 1000000);
    // Should be 99750000 (0.9975 GRD)
    BOOST_CHECK_EQUAL(bid_price, 99750000);
}

BOOST_AUTO_TEST_SUITE_END()

// ======================================================================
// Suite: CBDC Authority
// ======================================================================
BOOST_FIXTURE_TEST_SUITE(garudachain_cbdc_tests, BasicTestingSetup)

BOOST_AUTO_TEST_CASE(cbdc_mint_marker)
{
    BOOST_CHECK_EQUAL(
        CBDC::CBDC_MINT_MARKER.GetHex(),
        "cbdc000000000000000000000000000000000000000000000000000000000000"
    );
}

BOOST_AUTO_TEST_CASE(cbdc_mint_version)
{
    BOOST_CHECK_EQUAL(CBDC::CBDC_MINT_VERSION, 3);
}

BOOST_AUTO_TEST_CASE(cbdc_chain_id)
{
    BOOST_CHECK(!CBDC::CHAIN_ID.empty());
    BOOST_CHECK_EQUAL(CBDC::CHAIN_ID, "garudachain-mainnet-v1");
}

BOOST_AUTO_TEST_CASE(is_cbdc_mint_tx_valid)
{
    CMutableTransaction mtx;
    mtx.version = CBDC::CBDC_MINT_VERSION;
    CTxIn vin;
    vin.prevout = COutPoint(Txid::FromUint256(CBDC::CBDC_MINT_MARKER), 0);
    mtx.vin.push_back(vin);
    mtx.vout.push_back(CTxOut(1000, CScript() << OP_TRUE));

    CTransaction tx(mtx);
    BOOST_CHECK(CBDC::IsCBDCMintTx(tx));
}

BOOST_AUTO_TEST_CASE(is_cbdc_mint_tx_wrong_version)
{
    CMutableTransaction mtx;
    mtx.version = 2; // wrong version
    CTxIn vin;
    vin.prevout = COutPoint(Txid::FromUint256(CBDC::CBDC_MINT_MARKER), 0);
    mtx.vin.push_back(vin);

    CTransaction tx(mtx);
    BOOST_CHECK(!CBDC::IsCBDCMintTx(tx));
}

BOOST_AUTO_TEST_CASE(is_cbdc_mint_tx_wrong_marker)
{
    CMutableTransaction mtx;
    mtx.version = CBDC::CBDC_MINT_VERSION;
    CTxIn vin;
    vin.prevout = COutPoint(Txid::FromUint256(uint256::ZERO), 0);
    mtx.vin.push_back(vin);

    CTransaction tx(mtx);
    BOOST_CHECK(!CBDC::IsCBDCMintTx(tx));
}

BOOST_AUTO_TEST_CASE(replay_protected_hash_differs)
{
    CMutableTransaction mtx;
    mtx.version = CBDC::CBDC_MINT_VERSION;
    CTxIn vin;
    vin.prevout = COutPoint(Txid::FromUint256(CBDC::CBDC_MINT_MARKER), 0);
    mtx.vin.push_back(vin);
    mtx.vout.push_back(CTxOut(1000, CScript() << OP_TRUE));

    CTransaction tx(mtx);
    uint256 plain_hash = tx.GetHash();
    uint256 replay_hash = CBDC::GetReplayProtectedHash(tx);

    // Replay-protected hash must differ from plain tx hash
    BOOST_CHECK(plain_hash != replay_hash);
}

BOOST_AUTO_TEST_CASE(replay_protected_hash_deterministic)
{
    CMutableTransaction mtx;
    mtx.version = CBDC::CBDC_MINT_VERSION;
    CTxIn vin;
    vin.prevout = COutPoint(Txid::FromUint256(CBDC::CBDC_MINT_MARKER), 0);
    mtx.vin.push_back(vin);
    mtx.vout.push_back(CTxOut(1000, CScript() << OP_TRUE));

    CTransaction tx(mtx);
    uint256 h1 = CBDC::GetReplayProtectedHash(tx);
    uint256 h2 = CBDC::GetReplayProtectedHash(tx);
    BOOST_CHECK_EQUAL(h1, h2);
}

BOOST_AUTO_TEST_CASE(authority_key_configurable)
{
    // Default is empty (operators must configure via bitcoin.conf). The
    // setter/getter round-trip must still work for any non-default value.
    std::string original = CBDC::GetAuthorityPubkeyHex();

    std::string new_key = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
    CBDC::SetAuthorityPubkeyHex(new_key);
    BOOST_CHECK_EQUAL(CBDC::GetAuthorityPubkeyHex(), new_key);

    // Restore
    CBDC::SetAuthorityPubkeyHex(original);
    BOOST_CHECK_EQUAL(CBDC::GetAuthorityPubkeyHex(), original);
}

BOOST_AUTO_TEST_CASE(pqc_key_configurable)
{
    std::string original = CBDC::GetAuthorityPQCPubkeyHashHex();

    std::string hash = "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";
    CBDC::SetAuthorityPQCPubkeyHashHex(hash);
    BOOST_CHECK_EQUAL(CBDC::GetAuthorityPQCPubkeyHashHex(), hash);

    CBDC::SetAuthorityPQCPubkeyHashHex(original);
}

BOOST_AUTO_TEST_CASE(mint_fee_configurable)
{
    int64_t original = CBDC::GetMintFeePPM();

    CBDC::SetMintFeePPM(5000); // 0.5%
    BOOST_CHECK_EQUAL(CBDC::GetMintFeePPM(), 5000);

    // Boundary: max 10%
    CBDC::SetMintFeePPM(200000);
    BOOST_CHECK_EQUAL(CBDC::GetMintFeePPM(), 100000);

    // Boundary: min 0
    CBDC::SetMintFeePPM(-100);
    BOOST_CHECK_EQUAL(CBDC::GetMintFeePPM(), 0);

    CBDC::SetMintFeePPM(original);
}

BOOST_AUTO_TEST_CASE(supply_cap_constants)
{
    // 1B GRD = 1e9 * 1e8 = 1e17 satoshi
    BOOST_CHECK_EQUAL(CBDC::MAX_MINT_PER_TX, 100000000000000000LL);
    // 5B GRD = 5e9 * 1e8 = 5e17 satoshi
    BOOST_CHECK_EQUAL(CBDC::MAX_MINT_PER_BLOCK, 500000000000000000LL);
    BOOST_CHECK_EQUAL(CBDC::MAX_MINT_TXS_PER_BLOCK, 10);

    // Verify no overflow: max values must fit in int64_t
    BOOST_CHECK(CBDC::MAX_MINT_PER_TX > 0);
    BOOST_CHECK(CBDC::MAX_MINT_PER_BLOCK > 0);
    BOOST_CHECK(CBDC::MAX_MINT_PER_BLOCK > CBDC::MAX_MINT_PER_TX);
}

BOOST_AUTO_TEST_CASE(apbn_script_valid)
{
    CScript script = CBDC::GetAPBNScript();
    BOOST_CHECK(!script.empty());
    // Must start with OP_0 (witness version 0)
    BOOST_CHECK_EQUAL(script[0], OP_0);
}

BOOST_AUTO_TEST_CASE(treasury_config)
{
    auto tc = CBDC::GetTreasuryConfig();
    BOOST_CHECK(tc.required_sigs >= 1);
    BOOST_CHECK(tc.total_keys >= tc.required_sigs);
    BOOST_CHECK(tc.timelock_blocks >= 0);
}

BOOST_AUTO_TEST_CASE(wallet_mode)
{
    CBDC::SetWalletMode("cbdc");
    BOOST_CHECK(CBDC::GetWalletMode() == CBDC::WalletMode::CBDC);
    CBDC::SetWalletMode("creator");
    BOOST_CHECK(CBDC::GetWalletMode() == CBDC::WalletMode::CREATOR);
    CBDC::SetWalletMode("public");
    BOOST_CHECK(CBDC::GetWalletMode() == CBDC::WalletMode::PUBLIC);
    CBDC::SetWalletMode("normal");
    BOOST_CHECK(CBDC::GetWalletMode() == CBDC::WalletMode::NORMAL);
    CBDC::SetWalletMode("invalid");
    BOOST_CHECK(CBDC::GetWalletMode() == CBDC::WalletMode::NORMAL);
}

BOOST_AUTO_TEST_SUITE_END()

// ======================================================================
// Suite: ML-DSA-87 Post-Quantum Cryptography
// ======================================================================
BOOST_AUTO_TEST_SUITE(garudachain_pqc_tests)

BOOST_AUTO_TEST_CASE(pqc_constants)
{
    BOOST_CHECK_EQUAL(PQC::ML_DSA_87_PUBKEY_SIZE, 2592u);
    BOOST_CHECK_EQUAL(PQC::ML_DSA_87_SECKEY_SIZE, 4896u);
    BOOST_CHECK_EQUAL(PQC::ML_DSA_87_SIG_SIZE, 4627u);
}

BOOST_AUTO_TEST_CASE(pqc_keygen)
{
    std::vector<uint8_t> pk(PQC::ML_DSA_87_PUBKEY_SIZE);
    std::vector<uint8_t> sk(PQC::ML_DSA_87_SECKEY_SIZE);

    bool ok = PQC::MLDSA87Keygen(pk.data(), sk.data());
    BOOST_CHECK(ok);

    // Keys should not be all zeros
    bool pk_nonzero = false, sk_nonzero = false;
    for (auto b : pk) if (b != 0) { pk_nonzero = true; break; }
    for (auto b : sk) if (b != 0) { sk_nonzero = true; break; }
    BOOST_CHECK(pk_nonzero);
    BOOST_CHECK(sk_nonzero);
}

BOOST_AUTO_TEST_CASE(pqc_sign_verify)
{
    std::vector<uint8_t> pk(PQC::ML_DSA_87_PUBKEY_SIZE);
    std::vector<uint8_t> sk(PQC::ML_DSA_87_SECKEY_SIZE);
    BOOST_REQUIRE(PQC::MLDSA87Keygen(pk.data(), sk.data()));

    // Sign a message
    const uint8_t msg[] = "GarudaChain PQC test message";
    size_t msg_len = sizeof(msg) - 1;

    std::vector<uint8_t> sig(PQC::ML_DSA_87_SIG_SIZE);
    size_t sig_len = 0;
    bool sign_ok = PQC::MLDSA87Sign(sig.data(), &sig_len, msg, msg_len, sk.data());
    BOOST_CHECK(sign_ok);
    BOOST_CHECK_EQUAL(sig_len, PQC::ML_DSA_87_SIG_SIZE);

    // Verify
    bool verify_ok = PQC::MLDSA87Verify(msg, msg_len, sig.data(), sig_len, pk.data());
    BOOST_CHECK(verify_ok);
}

BOOST_AUTO_TEST_CASE(pqc_verify_wrong_message)
{
    std::vector<uint8_t> pk(PQC::ML_DSA_87_PUBKEY_SIZE);
    std::vector<uint8_t> sk(PQC::ML_DSA_87_SECKEY_SIZE);
    BOOST_REQUIRE(PQC::MLDSA87Keygen(pk.data(), sk.data()));

    const uint8_t msg[] = "original message";
    std::vector<uint8_t> sig(PQC::ML_DSA_87_SIG_SIZE);
    size_t sig_len = 0;
    BOOST_REQUIRE(PQC::MLDSA87Sign(sig.data(), &sig_len, msg, sizeof(msg) - 1, sk.data()));

    // Verify with wrong message should fail
    const uint8_t wrong[] = "tampered message";
    BOOST_CHECK(!PQC::MLDSA87Verify(wrong, sizeof(wrong) - 1, sig.data(), sig_len, pk.data()));
}

BOOST_AUTO_TEST_CASE(pqc_verify_wrong_key)
{
    std::vector<uint8_t> pk1(PQC::ML_DSA_87_PUBKEY_SIZE);
    std::vector<uint8_t> sk1(PQC::ML_DSA_87_SECKEY_SIZE);
    std::vector<uint8_t> pk2(PQC::ML_DSA_87_PUBKEY_SIZE);
    std::vector<uint8_t> sk2(PQC::ML_DSA_87_SECKEY_SIZE);
    BOOST_REQUIRE(PQC::MLDSA87Keygen(pk1.data(), sk1.data()));
    BOOST_REQUIRE(PQC::MLDSA87Keygen(pk2.data(), sk2.data()));

    const uint8_t msg[] = "test";
    std::vector<uint8_t> sig(PQC::ML_DSA_87_SIG_SIZE);
    size_t sig_len = 0;
    BOOST_REQUIRE(PQC::MLDSA87Sign(sig.data(), &sig_len, msg, sizeof(msg) - 1, sk1.data()));

    // Verify with wrong pubkey should fail
    BOOST_CHECK(!PQC::MLDSA87Verify(msg, sizeof(msg) - 1, sig.data(), sig_len, pk2.data()));
}

BOOST_AUTO_TEST_CASE(pqc_deterministic_keygen)
{
    uint8_t seed[32] = {};
    memset(seed, 0x42, 32); // fixed seed

    std::vector<uint8_t> pk1(PQC::ML_DSA_87_PUBKEY_SIZE);
    std::vector<uint8_t> sk1(PQC::ML_DSA_87_SECKEY_SIZE);
    std::vector<uint8_t> pk2(PQC::ML_DSA_87_PUBKEY_SIZE);
    std::vector<uint8_t> sk2(PQC::ML_DSA_87_SECKEY_SIZE);

    BOOST_REQUIRE(PQC::MLDSA87KeygenFromSeed(seed, pk1.data(), sk1.data()));
    BOOST_REQUIRE(PQC::MLDSA87KeygenFromSeed(seed, pk2.data(), sk2.data()));

    // Same seed must produce identical keypairs
    BOOST_CHECK(pk1 == pk2);
    BOOST_CHECK(sk1 == sk2);
}

BOOST_AUTO_TEST_CASE(pqc_different_seed_different_key)
{
    uint8_t seed1[32] = {};
    uint8_t seed2[32] = {};
    memset(seed1, 0x01, 32);
    memset(seed2, 0x02, 32);

    std::vector<uint8_t> pk1(PQC::ML_DSA_87_PUBKEY_SIZE);
    std::vector<uint8_t> sk1(PQC::ML_DSA_87_SECKEY_SIZE);
    std::vector<uint8_t> pk2(PQC::ML_DSA_87_PUBKEY_SIZE);
    std::vector<uint8_t> sk2(PQC::ML_DSA_87_SECKEY_SIZE);

    BOOST_REQUIRE(PQC::MLDSA87KeygenFromSeed(seed1, pk1.data(), sk1.data()));
    BOOST_REQUIRE(PQC::MLDSA87KeygenFromSeed(seed2, pk2.data(), sk2.data()));

    BOOST_CHECK(pk1 != pk2);
}

BOOST_AUTO_TEST_CASE(pqc_sign_verify_with_seeded_key)
{
    uint8_t seed[32] = {};
    memset(seed, 0xAB, 32);

    std::vector<uint8_t> pk(PQC::ML_DSA_87_PUBKEY_SIZE);
    std::vector<uint8_t> sk(PQC::ML_DSA_87_SECKEY_SIZE);
    BOOST_REQUIRE(PQC::MLDSA87KeygenFromSeed(seed, pk.data(), sk.data()));

    const uint8_t msg[] = "CBDC mint transaction hash";
    std::vector<uint8_t> sig(PQC::ML_DSA_87_SIG_SIZE);
    size_t sig_len = 0;
    BOOST_REQUIRE(PQC::MLDSA87Sign(sig.data(), &sig_len, msg, sizeof(msg) - 1, sk.data()));
    BOOST_CHECK(PQC::MLDSA87Verify(msg, sizeof(msg) - 1, sig.data(), sig_len, pk.data()));
}

BOOST_AUTO_TEST_SUITE_END()

// ======================================================================
// Suite: DEX Types
// ======================================================================
BOOST_AUTO_TEST_SUITE(garudachain_dex_tests)

BOOST_AUTO_TEST_CASE(oracle_peg_rate_struct)
{
    DEX::OraclePegRate rate;
    rate.symbol = "IDR";
    rate.grd_per_unit = 6250;
    rate.rate_per_grd = 1600000000000000LL;
    rate.timestamp = 1700000000;
    rate.source = "TEST";

    BOOST_CHECK_EQUAL(rate.symbol, "IDR");
    BOOST_CHECK_EQUAL(rate.grd_per_unit, 6250);
}

BOOST_AUTO_TEST_CASE(order_id_computation)
{
    uint256 asset_id{"acf4cdf98fe2918354bd8ae34caa458e19729a363222b9b1b752bf01c14fd3ba"};

    uint256 id1 = DEX::ComputeOrderId(asset_id, DEX::OrderSide::BUY, 100, 1000, "addr1", 1700000000);
    uint256 id2 = DEX::ComputeOrderId(asset_id, DEX::OrderSide::BUY, 100, 1000, "addr1", 1700000000);
    uint256 id3 = DEX::ComputeOrderId(asset_id, DEX::OrderSide::SELL, 100, 1000, "addr1", 1700000000);

    // Same inputs → same ID
    BOOST_CHECK_EQUAL(id1, id2);
    // Different side → different ID
    BOOST_CHECK(id1 != id3);
}

BOOST_AUTO_TEST_CASE(market_maker_struct)
{
    DEX::MarketMaker mm;
    mm.spread_bps = 50;
    mm.num_levels = 5;
    mm.order_size = 100000000;
    mm.active = true;

    BOOST_CHECK(mm.active);
    BOOST_CHECK_EQUAL(mm.spread_bps, 50);
    BOOST_CHECK_EQUAL(mm.num_levels, 5);
}

BOOST_AUTO_TEST_SUITE_END()

// ======================================================================
// Suite: RequirePQCAuth — unified PQC authorization gate
// ======================================================================
BOOST_FIXTURE_TEST_SUITE(garudachain_require_pqc_auth_tests, BasicTestingSetup)

// Helper: build a deterministic ML-DSA-87 keypair + combined pk||sk hex, and
// configure the CBDC authority hash to match it. Returns {combined_hex,
// original_hash} so the caller can restore prior state on teardown.
static std::pair<std::string, std::string> InstallTestPQCAuthority(uint8_t seed_byte)
{
    uint8_t seed[32];
    memset(seed, seed_byte, 32);

    std::vector<uint8_t> pk(PQC::ML_DSA_87_PUBKEY_SIZE);
    std::vector<uint8_t> sk(PQC::ML_DSA_87_SECKEY_SIZE);
    BOOST_REQUIRE(PQC::MLDSA87KeygenFromSeed(seed, pk.data(), sk.data()));

    // Raw-byte hash (matches validator's memcmp in RequirePQCAuth)
    std::array<unsigned char, 32> pk_hash_raw;
    CSHA256().Write(pk.data(), pk.size()).Finalize(pk_hash_raw.data());
    std::string hash_hex = HexStr(pk_hash_raw);

    // Combined pk || sk hex (format expected by RequirePQCAuth)
    std::vector<uint8_t> combined(pk.size() + sk.size());
    memcpy(combined.data(), pk.data(), pk.size());
    memcpy(combined.data() + pk.size(), sk.data(), sk.size());

    std::string original = CBDC::GetAuthorityPQCPubkeyHashHex();
    CBDC::SetAuthorityPQCPubkeyHashHex(hash_hex);

    return {HexStr(combined), original};
}

BOOST_AUTO_TEST_CASE(require_pqc_auth_soft_mode_noop_when_disabled)
{
    // PQC disabled → RequirePQCAuth is a no-op, even with no key.
    std::string original = CBDC::GetAuthorityPQCPubkeyHashHex();
    CBDC::SetAuthorityPQCPubkeyHashHex("");

    BOOST_CHECK_NO_THROW(CBDC::RequirePQCAuth("", "testop", "params"));
    BOOST_CHECK(!CBDC::IsPQCActive());

    CBDC::SetAuthorityPQCPubkeyHashHex(original);
}

BOOST_AUTO_TEST_CASE(require_pqc_auth_rejects_empty_key_when_active)
{
    auto [combined_hex, original] = InstallTestPQCAuthority(0x01);
    BOOST_CHECK(CBDC::IsPQCActive());

    BOOST_CHECK_THROW(
        CBDC::RequirePQCAuth("", "testop", "params"),
        std::runtime_error);

    CBDC::SetAuthorityPQCPubkeyHashHex(original);
}

BOOST_AUTO_TEST_CASE(require_pqc_auth_rejects_wrong_size)
{
    auto [combined_hex, original] = InstallTestPQCAuthority(0x02);

    // Too short
    BOOST_CHECK_THROW(
        CBDC::RequirePQCAuth("deadbeef", "testop", "params"),
        std::runtime_error);

    // Only pk (no sk)
    std::string pk_only = combined_hex.substr(0, PQC::ML_DSA_87_PUBKEY_SIZE * 2);
    BOOST_CHECK_THROW(
        CBDC::RequirePQCAuth(pk_only, "testop", "params"),
        std::runtime_error);

    CBDC::SetAuthorityPQCPubkeyHashHex(original);
}

BOOST_AUTO_TEST_CASE(require_pqc_auth_rejects_mismatched_key)
{
    // Configure authority hash from seed=0x03 but sign with seed=0x04 key.
    auto [combined_hex_3, original] = InstallTestPQCAuthority(0x03);

    uint8_t seed_other[32];
    memset(seed_other, 0x04, 32);
    std::vector<uint8_t> pk2(PQC::ML_DSA_87_PUBKEY_SIZE);
    std::vector<uint8_t> sk2(PQC::ML_DSA_87_SECKEY_SIZE);
    BOOST_REQUIRE(PQC::MLDSA87KeygenFromSeed(seed_other, pk2.data(), sk2.data()));

    std::vector<uint8_t> combined2(pk2.size() + sk2.size());
    memcpy(combined2.data(), pk2.data(), pk2.size());
    memcpy(combined2.data() + pk2.size(), sk2.data(), sk2.size());
    std::string combined_hex_4 = HexStr(combined2);

    BOOST_CHECK_THROW(
        CBDC::RequirePQCAuth(combined_hex_4, "testop", "params"),
        std::runtime_error);

    CBDC::SetAuthorityPQCPubkeyHashHex(original);
}

BOOST_AUTO_TEST_CASE(require_pqc_auth_accepts_matching_key)
{
    auto [combined_hex, original] = InstallTestPQCAuthority(0x05);

    BOOST_CHECK_NO_THROW(
        CBDC::RequirePQCAuth(combined_hex, "mintasset",
                             "asset_id|amount|params_blob"));

    CBDC::SetAuthorityPQCPubkeyHashHex(original);
}

BOOST_AUTO_TEST_CASE(require_pqc_auth_independent_of_op_name)
{
    // The same key must authorize any op name (the op name only affects the
    // audit signature, not the validation outcome).
    auto [combined_hex, original] = InstallTestPQCAuthority(0x06);

    for (const char* op : {"mintasset", "burnasset", "transferasset",
                           "declaredividend", "updatepegrate",
                           "setupmarketmaker", "depositgrd",
                           "rotateauthoritykey"}) {
        BOOST_CHECK_NO_THROW(CBDC::RequirePQCAuth(combined_hex, op, "x|y|z"));
    }

    CBDC::SetAuthorityPQCPubkeyHashHex(original);
}

BOOST_AUTO_TEST_CASE(require_pqc_auth_rejects_truncated_combined)
{
    auto [combined_hex, original] = InstallTestPQCAuthority(0x07);

    // Chop the last 2 hex chars (one byte) — size check must reject.
    std::string truncated = combined_hex.substr(0, combined_hex.size() - 2);
    BOOST_CHECK_THROW(
        CBDC::RequirePQCAuth(truncated, "testop", "params"),
        std::runtime_error);

    CBDC::SetAuthorityPQCPubkeyHashHex(original);
}

BOOST_AUTO_TEST_SUITE_END()
