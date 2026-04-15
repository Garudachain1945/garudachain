// Copyright (c) 2026 GarudaChain developers
// CBDC Authority — Configurable Hybrid Schnorr + ML-DSA-87 (FIPS 204)
#pragma once

#include <primitives/transaction.h>
#include <script/script.h>
#include <uint256.h>
#include <pubkey.h>
#include <string>
#include <vector>
#include <mutex>

namespace CBDC {

// ---- Compile-time defaults ----
// By default all authority identifiers are EMPTY. Operators MUST configure
// them explicitly via bitcoin.conf (-cbdcauthoritypubkey, -cbdcpqcpubkeyhash,
// -cbdcapbnhash) before privileged CBDC RPCs can be used. Shipping hardcoded
// defaults would make every node trust the developer's test keys, which is
// not acceptable for a public/open-source build.
static const std::string DEFAULT_AUTHORITY_PUBKEY_HEX = "";
static const std::string DEFAULT_AUTHORITY_PQC_PUBKEY_HASH_HEX = "";
static const std::string DEFAULT_APBN_PUBKEYHASH_HEX = "";

// ---- Runtime configurable authority keys ----
// Loaded from -cbdcauthoritypubkey, -cbdcpqcpubkeyhash, -cbdcapbnhash at init.
// Can be rotated via RPC rotateauthoritykey (requires current authority sig).
std::string GetAuthorityPubkeyHex();
std::string GetAuthorityPQCPubkeyHashHex();
std::string GetAPBNPubkeyHashHex();

void InitAuthorityKeys(); // Call once at startup to load from config
void SetAuthorityPubkeyHex(const std::string& hex);
void SetAuthorityPQCPubkeyHashHex(const std::string& hex);
void SetAPBNPubkeyHashHex(const std::string& hex);

// ---- Key rotation history (on-chain commitment via OP_RETURN) ----
struct KeyRotationRecord {
    std::string old_key_hex;
    std::string new_key_hex;
    int64_t timestamp;
    uint256 authorization_txid; // tx signed by old key authorizing rotation
};

// Verify hybrid CBDC mint signature (Schnorr + optional ML-DSA-87)
bool VerifyCBDCMintSigHybrid(const CTransaction& tx, std::string& errMsg);

// CBDC_MINT tx version
static constexpr int32_t CBDC_MINT_VERSION = 3;

// ---- Replay protection: chain ID embedded in CBDC_MINT ----
// Unique chain identifier to prevent cross-chain replay attacks.
// CBDC_MINT txs include this in the sighash to bind them to this chain.
static const std::string CHAIN_ID = "garudachain-mainnet-v1";

// Marker prevout hash (input dummy untuk CBDC_MINT)
static const uint256 CBDC_MINT_MARKER = uint256{
    "cbdc000000000000000000000000000000000000000000000000000000000000"};

// ---- Supply cap & rate limiting ----
static constexpr int64_t MAX_MINT_PER_TX = 100000000000000000LL;     // 1B GRD
static constexpr int64_t MAX_MINT_PER_BLOCK = 500000000000000000LL;  // 5B GRD
static constexpr int32_t MAX_MINT_TXS_PER_BLOCK = 10;

// ---- CBDC_MINT fee: percentage of mint burned to OP_RETURN (anti-inflation) ----
// Fee in parts-per-million (PPM). 1000 PPM = 0.1%
// Configurable via -cbdcmintfeeppm (default: 1000 = 0.1%)
int64_t GetMintFeePPM();
void SetMintFeePPM(int64_t ppm);

// ---- Multi-sig treasury (APBN) ----
// Treasury requires M-of-N signatures. Configurable via:
//   -cbdcapbnhash=<20-byte-hex>     (P2WSH script hash)
//   -cbdctreasurymultisig=2-of-3    (M-of-N config)
//   -cbdctreasurytimelock=144       (blocks before spend, default 144 = ~1 day)
struct TreasuryConfig {
    int required_sigs;   // M
    int total_keys;      // N
    int timelock_blocks; // CSV timelock
};
TreasuryConfig GetTreasuryConfig();
void InitTreasuryConfig();
CScript GetAPBNScript();

// Wallet mode
enum class WalletMode { NORMAL, CBDC, CREATOR, PUBLIC };
WalletMode GetWalletMode();
void SetWalletMode(const std::string& mode);

// Validasi transaksi CBDC_MINT
bool IsCBDCMintTx(const CTransaction& tx);
bool VerifyCBDCMintSig(const CTransaction& tx, std::string& errMsg);

// ---- Replay-protected sighash ----
// Computes SHA256(CHAIN_ID || tx.GetHash()) for cross-chain replay protection
uint256 GetReplayProtectedHash(const CTransaction& tx);

// ---- Unified PQC authorization gate for privileged RPCs ----
// Every privileged RPC that mutates asset/dex/peg/treasury state MUST call this
// before performing its operation. Validates that the caller provided a valid
// ML-DSA-87 secret key matching -cbdcpqcpubkeyhash, and produces an audit
// signature over SHA256(CHAIN_ID || op_name || params_blob).
//
// Throws on any validation failure. On success, logs the audit sig.
// Arguments:
//   pqc_key_hex — concatenated pk||sk hex (PUBKEY_SIZE + SECKEY_SIZE bytes)
//   op_name     — canonical op identifier (e.g. "mintasset", "updatepegrate")
//   params_blob — deterministic serialization of the operation parameters
//
// Soft mode: if -cbdcpqcpubkeyhash is empty (PQC disabled), this is a no-op.
// Use IsPQCActive() to detect and make the pqc_key_hex param optional.
bool IsPQCActive();
void RequirePQCAuth(const std::string& pqc_key_hex,
                    const std::string& op_name,
                    const std::string& params_blob);

} // namespace CBDC
